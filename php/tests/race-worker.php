<?php

// Processus concurrent de `run.php` : attend l'instant convenu, puis vérifie la même preuve.
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'OnlineCreation\\BotFilter\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__.'/../src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    }
});

[, $dir, $startAt, $nowMs] = $argv;
$value = (string) stream_get_contents(STDIN);
while (microtime(true) < (float) $startAt) {
    usleep(200);
}
echo (new OnlineCreation\BotFilter\Verifier(new OnlineCreation\BotFilter\FileKeyStore($dir)))->verify($value, 'login', (int) $nowMs)->code;
