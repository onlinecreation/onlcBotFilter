<?php

// Tests du vérificateur PHP, sans dépendance : `php php/tests/run.php`. Rejoue les vecteurs
// produits par le vérificateur TypeScript (`tests/vectors.json`) et quelques cas propres à PHP.

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'OnlineCreation\\BotFilter\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__.'/../src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    }
});

use OnlineCreation\BotFilter\FileKeyStore;
use OnlineCreation\BotFilter\Issuer;
use OnlineCreation\BotFilter\MemoryKeyStore;
use OnlineCreation\BotFilter\Verifier;

$failures = 0;
$count = 0;
$check = static function (string $name, mixed $got, mixed $expected) use (&$failures, &$count): void {
    ++$count;
    if ($got !== $expected) {
        ++$failures;
        fwrite(STDERR, "ÉCHEC $name : ".var_export($got, true).' au lieu de '.var_export($expected, true)."\n");
    }
};

$vectors = json_decode((string) file_get_contents(__DIR__.'/../../tests/vectors.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($vectors['cases'] as $case) {
    $now = $case['now'];
    $store = new MemoryKeyStore(static fn (): int => $now);
    $store->save($vectors['id'], $vectors['record'], 7200);
    $check($case['name'], (new Verifier($store))->verify($case['value'], 'contact', $now, $case['filled'] ?? null)->code, $case['expect']);
}
$replay = $vectors['replay'];
$store = new MemoryKeyStore(static fn (): int => $replay['now']);
$store->save($vectors['id'], $vectors['record'], 7200);
$verifier = new Verifier($store);
$check('rejeu (1)', $verifier->verify($replay['value'], 'contact', $replay['now'])->code, $replay['first']);
$check('rejeu (2)', $verifier->verify($replay['value'], 'contact', $replay['now'])->code, $replay['second']);

// Émission, puis preuve signée en PHP (comme le ferait le client) avec un stockage en fichiers.
$dir = sys_get_temp_dir().'/onlc-bot-filter-test-'.bin2hex(random_bytes(4));
$files = new FileKeyStore($dir);
$key = (new Issuer($files))->issue('login', 1_800_000_000_000);
$check('durées imposées', count(array_filter($key['holds'], static fn (int $h): bool => $h >= 2000 && $h <= 4000)), 3);
$d = json_encode(['v' => 2, 'id' => $key['id'], 'a' => 'login', 't0' => 1_800_000_000_100, 't1' => 1_800_000_009_100, 'el' => 9000, 'ft' => 9500, 'tz' => 0,
    'c' => ['ptr' => 2, 'mv' => 50, 'tch' => 0, 'key' => 20, 'inp' => 18, 'foc' => 2, 'pst' => 0, 'scr' => 0],
    'f' => ['email' => ['d' => 0, 'e' => 1, 'a' => 1], 'password' => ['d' => 2500, 'e' => 1, 'a' => 0]], 'env' => ['pt' => 'mouse', 'wd' => false]], JSON_THROW_ON_ERROR);
$value = json_encode(['d' => $d, 's' => rtrim(strtr(base64_encode(hash_hmac('sha256', $d, $key['key'], true)), '+/', '-_'), '=')], JSON_THROW_ON_ERROR);
$fileVerifier = new Verifier($files);
$check('stockage fichiers : accepté', $fileVerifier->verify($value, 'login', 1_800_000_009_500, ['email', 'password'])->code, 'OK');
$check('stockage fichiers : rejeu', $fileVerifier->verify($value, 'login', 1_800_000_009_600)->code, 'REPLAYED');
$check('identifiant de clé hostile', $fileVerifier->verify(str_replace($key['id'], '../../etc/passwd', $value), 'login', 1_800_000_009_600)->code, 'UNKNOWN_KEY');
$check('valeur trop longue', $fileVerifier->verify(str_repeat('x', 9000), 'login')->code, 'MALFORMED');
$check('valeur absente', $fileVerifier->verify(null, 'login')->code, 'MALFORMED');

// Attaque concurrente : la même preuve présentée au même instant par 8 processus. Une seule passe.
$raceKey = (new Issuer($files))->issue('login', 1_800_000_000_000);
$raceD = str_replace($key['id'], $raceKey['id'], $d);
$raceValue = json_encode(['d' => $raceD, 's' => rtrim(strtr(base64_encode(hash_hmac('sha256', $raceD, $raceKey['key'], true)), '+/', '-_'), '=')], JSON_THROW_ON_ERROR);
$startAt = microtime(true) + 0.6;
$procs = [];
for ($i = 0; $i < 8; ++$i) {
    $p = proc_open([PHP_BINARY, __DIR__.'/race-worker.php', $dir, (string) $startAt, '1800000009500'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fwrite($pipes[0], $raceValue);
    fclose($pipes[0]);
    $procs[] = [$p, $pipes];
}
$codes = [];
foreach ($procs as [$p, $pipes]) {
    $codes[] = trim((string) stream_get_contents($pipes[1]));
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($p);
}
sort($codes);
$check('hostile : 8 envois simultanés de la même preuve', array_count_values($codes), ['OK' => 1, 'REPLAYED' => 7]);

array_map('unlink', glob($dir.'/*') ?: []);
rmdir($dir);

echo $failures === 0 ? "OK : $count vérifications\n" : "$failures échec(s) sur $count\n";
exit($failures === 0 ? 0 : 1);
