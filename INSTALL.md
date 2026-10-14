# Installing onlcBotFilter

One Git repository provides three things:
- the browser client (`dist/`, committed: nothing to build on your side);
- the PHP verifier (`php/src/`, Composer package `onlinecreation/onlc-bot-filter`);
- the Node verifier (`dist/server.mjs`, npm package `onlc-bot-filter`).

How it works and what it checks is described in the [README](README.md). This page explains how to
install and wire it.

Requirements: PHP 8.2+ (with `ext-json`; `ext-apcu` optional) and/or Node 20+. Browsers: any
evergreen browser (Safari 15+). The client signs with WebCrypto in a secure context (HTTPS,
`localhost`) and falls back to a built-in HMAC-SHA256 otherwise.

## 1. Get the library

Always pin a **tag** (`v1.0.0`), never a branch.

### PHP (Composer)

The package is not on Packagist; declare the repository:

```json
{
  "repositories": [{ "type": "vcs", "url": "https://github.com/onlinecreation/onlcBotFilter" }],
  "require": { "onlinecreation/onlc-bot-filter": "^1.0" }
}
```

```bash
composer update onlinecreation/onlc-bot-filter
```

### JavaScript (npm)

The package is not on the npm registry; install it from Git:

```bash
npm install "github:onlinecreation/onlcBotFilter#v1.0.0"
```

```ts
import { attach } from 'onlc-bot-filter';                  // browser client
import { issueKey, verify } from 'onlc-bot-filter/server'; // Node verifier
```

### Without a package manager

Copy `dist/onlc-bot-filter.js` (and `dist/onlc-bot-filter.css` if your CSP forbids inline styles)
to your public files. On the server, copy `php/src/` and load it with a PSR-4 autoloader
(`OnlineCreation\BotFilter\` → `php/src/`), for example:

```php
spl_autoload_register(static function (string $class): void {
    $prefix = 'OnlineCreation\\BotFilter\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__.'/lib/onlc-bot-filter/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    }
});
```

## 2. Wire the server

You need two things: a route that issues keys, and verification when the form is received.

### 2.1 Choose the key store

| Situation | Store |
|---|---|
| Single server with APCu | `ApcuKeyStore` |
| Small PHP site without cache | `FileKeyStore('/path/outside/web/root/onlc-bot-filter')` |
| Several servers (Redis, database) | your own class implementing `KeyStore` |
| Tests | `MemoryKeyStore` |

**Mandatory rule:** `consume()` must mark the key as used **atomically**. Otherwise two simultaneous
submissions of the same proof both pass. Example with Redis:

```php
final class RedisKeyStore implements \OnlineCreation\BotFilter\KeyStore
{
    public function __construct(private \Redis $redis) {}

    public function save(string $id, array $record, int $ttlSeconds): void
    {
        $this->redis->setex("obf:k:$id", $ttlSeconds, json_encode($record));
    }

    public function consume(string $id): ?array
    {
        $raw = $this->redis->get("obf:k:$id");
        if (!is_string($raw)) return null;
        // SET NX: only one caller sets the "used" mark.
        $first = $this->redis->set("obf:u:$id", '1', ['nx', 'ex' => 7 * 86400]);
        return ['record' => json_decode($raw, true), 'alreadyUsed' => $first !== true];
    }
}
```

`FileKeyStore` keeps one small file per key; call `$store->purge()` from a periodic task to remove
expired ones.

### 2.2 Plain PHP

```php
use OnlineCreation\BotFilter\{FileKeyStore, Issuer, Verifier};

$store = new FileKeyStore(__DIR__.'/../var/onlc-bot-filter');

// GET /onlc-bot-filter/key?action=contact
$action = $_GET['action'] ?? '';
if (!in_array($action, ['contact', 'login'], true)) { http_response_code(422); exit; } // Issuer accepts any string
header('Content-Type: application/json');
header('Cache-Control: no-store');           // never serve a key from a shared cache
echo json_encode((new Issuer($store))->issue($action));

// On reception (POST /contact)
$filled = array_keys(array_filter(['name' => $_POST['name'] ?? '', 'message' => $_POST['message'] ?? ''], fn ($v) => trim($v) !== ''));
$result = (new Verifier($store))->verify($_POST['onlc-bot-filter'] ?? null, 'contact', null, $filled);
if ($result->code === 'CHALLENGE_REQUIRED') {
    // Show the form again, keeping what was typed, with data-onlc-bot-filter-challenge on <form>.
} elseif (!$result->ok) {
    // Reject with a clear message ("Reload the page and try again"), log $result->code and
    // $result->reasons. Never drop the message silently.
}
```

`$filled` lists the fields received with a value different from their HTML default. It is
optional but recommended: it lets the server cross-check what the client declared.

### 2.3 Symfony

```php
#[Route('/onlc-bot-filter/key', methods: ['GET'])]
public function key(Request $request, Issuer $issuer): JsonResponse
{
    $action = $request->query->getString('action');
    if (!in_array($action, ['contact', 'login'], true)) {
        throw new UnprocessableEntityHttpException();
    }
    return new JsonResponse($issuer->issue($action), headers: ['Cache-Control' => 'no-store']);
}
```

Services: declare `Issuer`, `Verifier` and your `KeyStore`. `Policy::fromArray($config)` reads the
settings from your configuration.

### 2.4 Node

```ts
import { issueKey, verify, MemoryKeyStore, type KeyStore } from 'onlc-bot-filter/server';

const store: KeyStore = new MemoryKeyStore(); // single process only; use a shared atomic store otherwise

app.get('/onlc-bot-filter/key', async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await issueKey(store, String(req.query.action)));
});
app.post('/contact', async (req, res) => {
  const r = await verify(req.body['onlc-bot-filter'], { action: 'contact', store, filled: ['name', 'message'].filter((n) => req.body[n]?.trim()) });
  // r.ok, r.code, r.reasons, r.challenge
});
```

## 3. Wire the client

### 3.1 Classic HTML form

```html
<script src="/assets/onlc-bot-filter.js" defer></script>
<form method="post" action="/contact" data-onlc-bot-filter="contact" data-onlc-bot-filter-endpoint="/onlc-bot-filter/key">
```

Forms with `data-onlc-bot-filter` are attached automatically; the script also exposes
`window.onlcBotFilter` (`attach`, `autoAttach`, `BotFilter`, `BotFilterError`).

Optional attributes:
- `data-onlc-bot-filter-lang="en"`: challenge language (`en`, `fr`, `es`, `de`, `nl`); default: the
  page language;
- `data-onlc-bot-filter-challenge`: challenge required, to redisplay after `CHALLENGE_REQUIRED`;
- `data-onlc-bot-filter-nostyle`: the page loads `onlc-bot-filter.css` itself.

### 3.2 Application (submission in JavaScript)

```ts
import { attach } from 'onlc-bot-filter';

const filter = attach(form, { action: 'login', mode: 'manual', fetchKey: (a) => getJson(`/onlc-bot-filter/key?action=${a}`) });

async function submit() {
  let proof = await filter.seal();                          // challenge if needed; one call per reset()
  try {
    let res = await post('/login', body, { 'X-Bot-Filter': proof });
    if (res.code === 'CHALLENGE_REQUIRED') {                // whatever code your API returns
      filter.reset();
      proof = await filter.seal({ force: true });
      res = await post('/login', body, { 'X-Bot-Filter': proof });
    }
  } finally {
    filter.reset();                                         // next key (already prepared), submission allowed again
  }
}
```

When the screen is destroyed: `filter.detach()`.

With a bundler (Vite, esbuild…) you can also import the TypeScript sources directly
(`src/client/index.ts`); `dist/onlc-bot-filter.mjs` is the prebuilt module.

### 3.3 Appearance

The challenge follows the system dark mode and reduced-motion preference. Colours are set with CSS
variables on `.obf`:
- `--obf-bg`, `--obf-fg`, `--obf-muted`: background, text, secondary text;
- `--obf-accent`, `--obf-glow`: brand colour and key halo;
- `--obf-track`: slider track and countdown bar.

Texts can be replaced with the `messages` option (keys: `src/client/messages.ts`).

### 3.4 Content Security Policy

The client only calls the key route, never a third party.
- `style-src` without `'unsafe-inline'`: pass `injectStyle: false` (or `data-onlc-bot-filter-nostyle`)
  and load `dist/onlc-bot-filter.css`;
- `connect-src` must allow the host of the key route.

## 4. Check your integration

1. Fill in the form normally and wait a few seconds: accepted, no challenge.
2. Submit right after the page opens: the challenge appears. Once passed, the submission goes through.
3. Double-click the submit button: a single submission.
4. Go Back after a submission, then submit again: a challenge may appear, never a flat rejection.
5. Replay the same request (browser dev tools): `REPLAYED`.
6. Whole flow with the keyboard only, and with a screen reader.

A local demo is included: `npm install && npm run build && npm run demo`, then open
http://127.0.0.1:8099.

## 5. Updating

- **Patch or minor version**: change the tag, run your project's tests.
- **Major version** (new protocol): update client and server in the same deployment. Keys in
  circulation (2 h at most) are rejected after the switch.

## 6. Releasing (maintainers)

```bash
npm install
npm run check        # types, JS tests (vectors included) and PHP tests
npm run build        # dist/ up to date, to be committed
npm run vectors      # only if the rules changed; review the diff of tests/vectors.json
```

Then:
1. Update `CHANGELOG.md` and the version in `package.json`.
2. Commit, then tag `vX.Y.Z`.
3. Never move a published tag.
