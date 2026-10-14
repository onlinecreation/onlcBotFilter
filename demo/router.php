<?php

// Démonstration locale : `npm run demo` (php -S 127.0.0.1:8099 demo/router.php) depuis la racine.
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'OnlineCreation\\BotFilter\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__.'/../php/src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    }
});

use OnlineCreation\BotFilter\FileKeyStore;
use OnlineCreation\BotFilter\Issuer;
use OnlineCreation\BotFilter\Verifier;

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$store = new FileKeyStore(sys_get_temp_dir().'/onlc-bot-filter-demo');

if ($path === '/onlc-bot-filter/key') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store'); // une clé ne doit jamais venir d'un cache partagé
    echo json_encode((new Issuer($store))->issue((string) ($_GET['action'] ?? '')));
    return true;
}
if ($path === '/submit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    // Champs remplis (valeur par défaut : vide) : chacun doit avoir été déclaré modifié par le client.
    $filled = array_values(array_filter(['name', 'message'], static fn (string $n): bool => trim((string) ($_POST[$n] ?? '')) !== ''));
    $r = (new Verifier($store))->verify($_POST['onlc-bot-filter'] ?? null, (string) ($_POST['action'] ?? ''), null, $filled);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Result</title>',
        '<body style="font:16px system-ui;margin:24px"><h1>', $r->ok ? 'Accepted' : 'Rejected', '</h1><p>Code: <code>', htmlspecialchars($r->code), '</code>',
        $r->challenge ? ' — challenge: '.htmlspecialchars($r->challenge) : '', '</p><p>Signals: ', htmlspecialchars(implode(', ', $r->reasons) ?: 'none'), '</p>',
        '<pre style="white-space:pre-wrap;background:#f3f5f4;padding:12px">', htmlspecialchars(json_encode(json_decode(json_decode($_POST['onlc-bot-filter'] ?? '{}', true)['d'] ?? 'null'), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)), '</pre><a href="/">Back</a>';
    return true;
}
if (str_starts_with($path, '/dist/') && is_file(__DIR__.'/..'.$path)) {
    header('Content-Type: '.(str_ends_with($path, '.js') || str_ends_with($path, '.mjs') ? 'text/javascript' : (str_ends_with($path, '.css') ? 'text/css' : 'application/json')));
    header('Cache-Control: no-cache'); // démonstration : toujours la dernière construction
    readfile(__DIR__.'/..'.$path);
    return true;
}
if ($path === '/' || $path === '/index.html') {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__.'/index.html');
    return true;
}
http_response_code(404);
return true;
