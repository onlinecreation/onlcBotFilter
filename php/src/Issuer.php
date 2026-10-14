<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/** Émission des clés uniques (réponse à `GET …?action=`). */
final class Issuer
{
    public function __construct(private readonly KeyStore $store, private readonly Policy $policy = new Policy())
    {
    }

    /** @return array{v: int, id: string, key: string, issuedAt: int, expiresIn: int, minSeconds: int, minInteractions: int, minFieldMs: int, letter: string, holds: list<int>} */
    public function issue(string $action, ?int $nowMs = null): array
    {
        $p = $this->policy;
        $now = $nowMs ?? (int) floor(microtime(true) * 1000);
        $id = self::token(16);
        $holds = [];
        for ($i = 0; $i < $p->holdRounds; ++$i) {
            $holds[] = random_int($p->holdMin, $p->holdMax);
        }
        $record = ['key' => self::token(32), 'action' => $action, 'issuedAt' => $now, 'letter' => $p->letters[random_int(0, strlen($p->letters) - 1)], 'holds' => $holds];
        $this->store->save($id, $record, $p->maxSeconds);

        return ['v' => 2, 'id' => $id, 'key' => $record['key'], 'issuedAt' => $now, 'expiresIn' => $p->maxSeconds, 'minSeconds' => $p->minSeconds, 'minInteractions' => $p->minInteractions, 'minFieldMs' => $p->minFieldMs, 'letter' => $record['letter'], 'holds' => $holds];
    }

    private static function token(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }
}
