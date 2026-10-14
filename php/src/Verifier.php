<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/** Vérification de la preuve. Transcription exacte de `src/server/index.ts` (mêmes vecteurs). */
final class Verifier
{
    public const FIELD_MAX_BYTES = 8192;
    private const COUNT_KEYS = ['ptr', 'mv', 'tch', 'key', 'inp', 'foc', 'pst', 'scr'];
    private const MAX_FIELDS = 20;
    private const FIELD_NAME = '/^[A-Za-z0-9_.\-\[\]]{1,40}$/D';

    public function __construct(private readonly KeyStore $store, private readonly Policy $policy = new Policy())
    {
    }

    /**
     * @param list<string>|null $filled noms des champs envoyés avec une valeur différente de leur valeur
     *                                  par défaut (formulaire classique) : chacun doit avoir été déclaré modifié
     */
    public function verify(?string $value, string $action, ?int $nowMs = null, ?array $filled = null): Result
    {
        $p = $this->policy;
        $now = $nowMs ?? (int) floor(microtime(true) * 1000);
        if ($value === null || $value === '' || strlen($value) > self::FIELD_MAX_BYTES) {
            return Result::fail('MALFORMED');
        }
        $field = self::decode($value);
        if (!is_array($field) || !is_string($field['d'] ?? null) || !is_string($field['s'] ?? null)) {
            return Result::fail('MALFORMED');
        }
        $payload = self::parsePayload($field['d']);
        if ($payload === null) {
            return Result::fail('MALFORMED');
        }

        // La clé est brûlée dès la première présentation, que la preuve soit bonne ou non.
        $found = $this->store->consume($payload['id']);
        if ($found === null) {
            return Result::fail('UNKNOWN_KEY');
        }
        if ($found['alreadyUsed']) {
            return Result::fail('REPLAYED');
        }
        $rec = $found['record'];
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $field['d'], $rec['key'], true)), '+/', '-_'), '=');
        if (!hash_equals($expected, $field['s'])) {
            return Result::fail('BAD_SIGNATURE');
        }
        if ($payload['a'] !== $action || $rec['action'] !== $action) {
            return Result::fail('ACTION_MISMATCH');
        }

        $serverElapsed = $now - $rec['issuedAt'];
        if ($serverElapsed > $p->maxSeconds * 1000) {
            return Result::fail('EXPIRED');
        }
        if ($serverElapsed < $p->hardMinSeconds * 1000) {
            return Result::fail('TOO_FAST');
        }
        // Le terminal ne peut pas avoir passé plus de temps sur le formulaire qu'il ne s'en est écoulé
        // depuis l'émission de la clé (l'inverse est normal : réseau, mise en veille).
        if ($payload['el'] > $serverElapsed + $p->clockDrift) {
            return Result::fail('CLOCK_INCOHERENT', ['monotonic_ahead']);
        }

        // Le temps depuis la clé est inclus dans le temps passé sur le formulaire, qui couvre lui-même
        // la somme des temps par champ.
        if ($payload['el'] > $payload['ft'] + $p->clockDrift) {
            return Result::fail('CLOCK_INCOHERENT', ['key_older_than_form']);
        }
        if (array_sum(array_column($payload['f'], 'd')) > $payload['ft'] + $p->clockDrift) {
            return Result::fail('FIELDS_INCOHERENT', ['field_time_exceeds_total']);
        }

        $reasons = [];
        foreach ($filled ?? [] as $name) {
            $info = is_string($name) && array_key_exists($name, $payload['f']) ? $payload['f'][$name] : null;
            // Champ arrivé rempli que le client dit intact : preuve fabriquée sans regarder le formulaire,
            // ou cas imprévu du navigateur. Soupçon, pas refus : le défi tranche.
            if ($info === null || $info['e'] !== 1) {
                if (!in_array('filled_field_not_edited', $reasons, true)) {
                    $reasons[] = 'filled_field_not_edited';
                }
                continue;
            }
            // Rempli à la main en moins d'une seconde (le remplissage automatique est exempté).
            if ($info['a'] !== 1 && $info['d'] < $p->minFieldMs && !in_array('field_too_quick', $reasons, true)) {
                $reasons[] = 'field_too_quick';
            }
        }
        if ($serverElapsed < $p->minSeconds * 1000) {
            $reasons[] = 'short_time';
        }
        $c = $payload['c'];
        if ($c['ptr'] + $c['tch'] + $c['key'] + $c['inp'] + $c['foc'] + $c['pst'] < $p->minInteractions) {
            $reasons[] = 'few_interactions';
        }
        if ($payload['env']['wd']) {
            $reasons[] = 'webdriver';
        }
        if (abs($payload['t1'] - $payload['t0'] - $payload['el']) > $p->clockDrift + $payload['el'] / 100) {
            $reasons[] = 'wall_clock_drift';
        }
        // Horloge du terminal mal réglée : courant, jamais un motif de refus à lui seul.
        if (abs($payload['t1'] - $now) > $p->maxSkew) {
            $reasons[] = 'clock_skew';
        }

        if (isset($payload['ch'])) {
            $ch = $payload['ch'];
            if ($ch['m'] === 'slide') {
                $spent = $ch['p'] === [] ? 0 : $ch['p'][count($ch['p']) - 1][0] - $ch['p'][0][0];
                $passed = self::slideIsHuman($ch['p']);
            } else {
                $spent = array_sum(array_column($ch['r'], 'h'));
                $passed = $this->keysAreHuman($ch['r'], $rec);
            }
            if ($spent > $serverElapsed + $p->clockDrift || !$passed) {
                return Result::fail('CHALLENGE_FAILED', $reasons);
            }

            return new Result(true, 'OK', $reasons, $ch['m']);
        }
        if ($reasons !== []) {
            return Result::fail('CHALLENGE_REQUIRED', $reasons);
        }

        return new Result(true, 'OK');
    }

    /** @param list<array{0: int, 1: int}> $p */
    public static function slideIsHuman(array $p): bool
    {
        $n = count($p);
        if ($n < 5) {
            return false;
        }
        for ($i = 1; $i < $n; ++$i) {
            if ($p[$i][0] < $p[$i - 1][0]) {
                return false;
            }
        }
        $duration = $p[$n - 1][0] - $p[0][0];
        if ($p[0][1] > 150 || $p[$n - 1][1] < 950 || $duration < 200 || $duration > 60000) {
            return false;
        }
        $v = [];
        for ($i = 1; $i < $n; ++$i) {
            $dt = $p[$i][0] - $p[$i - 1][0];
            if ($dt > 0) {
                $v[] = ($p[$i][1] - $p[$i - 1][1]) / $dt;
            }
        }
        if (count($v) < 3) {
            return false;
        }
        $mean = array_sum($v) / count($v);
        if ($mean <= 0) {
            return false;
        }
        $sd = sqrt(array_sum(array_map(static fn (float|int $x): float => ($x - $mean) ** 2, $v)) / count($v));

        // Un trajet interpolé à vitesse constante (robot naïf) a un coefficient de variation nul.
        return $sd / $mean >= 0.1;
    }

    /**
     * @param list<array{t: int, h: int}> $r
     * @param array{holds: list<int>} $rec
     */
    private function keysAreHuman(array $r, array $rec): bool
    {
        if (count($r) !== count($rec['holds'])) {
            return false;
        }
        foreach ($r as $i => $x) {
            $react = $x['h'] - $x['t'];
            if ($x['t'] !== $rec['holds'][$i] || $react < $this->policy->reactMin || $react > $this->policy->reactMax) {
                return false;
            }
        }

        return true;
    }

    private static function decode(string $json): mixed
    {
        try {
            return json_decode($json, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
    }

    private static function isInt(mixed $x): bool
    {
        return is_int($x) && $x >= 0;
    }

    /** Lecture stricte : tout champ mal typé rend la preuve illisible. @return array<string, mixed>|null */
    private static function parsePayload(string $d): ?array
    {
        $p = self::decode($d);
        if (!is_array($p) || array_is_list($p) || ($p['v'] ?? null) !== 2 || !is_string($p['id'] ?? null) || !is_string($p['a'] ?? null)
            || !self::isInt($p['t0'] ?? null) || !self::isInt($p['t1'] ?? null) || !self::isInt($p['el'] ?? null) || !self::isInt($p['ft'] ?? null)
            || !is_int($p['tz'] ?? null) || abs($p['tz']) > 1440) {
            return null;
        }
        $c = $p['c'] ?? null;
        if (!is_array($c)) {
            return null;
        }
        foreach (self::COUNT_KEYS as $k) {
            if (!self::isInt($c[$k] ?? null)) {
                return null;
            }
        }
        $f = $p['f'] ?? null;
        if (!is_array($f) || ($f !== [] && array_is_list($f)) || count($f) > self::MAX_FIELDS) {
            return null;
        }
        foreach ($f as $name => $info) {
            if (!is_string($name) || preg_match(self::FIELD_NAME, $name) !== 1 || !is_array($info) || !self::isInt($info['d'] ?? null)
                || !in_array($info['e'] ?? null, [0, 1], true) || !in_array($info['a'] ?? null, [0, 1], true)) {
                return null;
            }
        }
        $env = $p['env'] ?? null;
        if (!is_array($env) || !is_bool($env['wd'] ?? null) || !array_key_exists('pt', $env) || !($env['pt'] === null || is_string($env['pt']))) {
            return null;
        }
        if (array_key_exists('ch', $p) && !self::validChallenge($p['ch'])) {
            return null;
        }

        return $p;
    }

    private static function validChallenge(mixed $ch): bool
    {
        if (!is_array($ch)) {
            return false;
        }
        if (($ch['m'] ?? null) === 'slide') {
            if (!array_key_exists('pt', $ch) || !($ch['pt'] === null || is_string($ch['pt'])) || !is_array($ch['p'] ?? null) || !array_is_list($ch['p']) || count($ch['p']) > 200) {
                return false;
            }
            foreach ($ch['p'] as $s) {
                if (!is_array($s) || !array_is_list($s) || count($s) !== 2 || !self::isInt($s[0]) || !self::isInt($s[1]) || $s[1] > 1000) {
                    return false;
                }
            }

            return true;
        }
        if (($ch['m'] ?? null) === 'keys') {
            if (!is_array($ch['r'] ?? null) || !array_is_list($ch['r']) || count($ch['r']) > 10 || !self::isInt($ch['f'] ?? null) || !is_bool($ch['au'] ?? null)) {
                return false;
            }
            foreach ($ch['r'] as $r) {
                if (!is_array($r) || !self::isInt($r['t'] ?? null) || !self::isInt($r['h'] ?? null)) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }
}
