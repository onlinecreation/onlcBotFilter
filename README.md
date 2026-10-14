# onlcBotFilter

A PHP + JavaScript script that filters out the most naive bots from web forms, while getting in the
way of real people as little as possible and taking assistive technologies into account.

Most visitors never see anything: the browser counts how the form was used, signs that count with a
single-use key, and the server checks it. Only when the signals are weak (very fast submission, no
interaction, automated browser) does a short fallback challenge appear, usable with a mouse, a
finger, a keyboard alone, a screen reader or a braille display.

- **No third party, no cookie, no fingerprinting.** Nothing typed in the form is ever collected.
- **Browser client** with no dependency: about 10 KB compressed.
- **PHP 8.2+ verifier** with no dependency, and a **TypeScript verifier for Node**. Both make the
  same decisions on the same 70 shared test vectors.
- Challenge texts in English, French, Spanish, German and Dutch, replaceable.

Installation and integration: **[INSTALL.md](INSTALL.md)**. Versions: [CHANGELOG.md](CHANGELOG.md).

> **What it is not.** onlcBotFilter stops naive bots: scripts that post forms directly, or drive a
> browser without trying to look human. A bot that drives a real browser and simulates irregular
> movements can get through, because the count and the challenge are produced by the visitor's
> device. The signature guarantees the integrity of the proof, single use and the time really
> elapsed — not humanity. Use it **alongside** rate limiting, a honeypot field and content analysis,
> not instead of them.

## How it works

1. The page loads the script. Each form to protect gets an onlcBotFilter instance.
2. When attached, the instance adds a hidden field and asks the server for a **single-use key**.
3. It counts interactions with the form: presses, touches, keystrokes, moves, inputs, focus changes,
   pastes, scrolls. These are **numbers only**: no text, no keys, no screen positions. Window
   scrolling does not count as an interaction, so a bot simulating a global scroll gains nothing.
4. For each field it also records:
   - the cumulated focus time;
   - whether its value differs from the HTML default value;
   - whether it was filled **without any keystroke** (browser autofill, password manager, form
     restored by the browser on Back, value set by the page).

   It also records the total time spent on the form.
5. Just before submission, the hidden field receives a JSON document signed with the single-use key
   (HMAC-SHA256): the counts, the device clocks, the time spent and the key id.
6. **A second submission is blocked.**
7. Too few interactions, too little time (under 3 s) or an automated browser (`navigator.webdriver`)
   trigger the **fallback challenge**.
8. The server checks:
   - that the key exists and has not been used before (replay);
   - the time elapsed since the key was issued. Under 1 s: a bot. Over 2 h: the key was probably
     harvested to be replayed;
   - the consistency of the clocks sent by the device;
   - the plausibility of the interactions and, if any, of the challenge;
   - cross-checks: the key cannot be older than the form, and per-field times cannot exceed the
     total time;
   - if the server passes the list of fields it received filled in, that each was declared edited.
     A mismatch, or a field typed by hand in under one second, requires the challenge — it never
     rejects. A field filled without keystrokes is exempt from the delay.

**General rule: a suspicious signal requires the challenge, and a passed challenge wins.** Only an
impossible or forged proof (signature, key, replay, timings, contradictory measurements) and a
failed challenge lead to a rejection. A badly set clock or a distant time zone never causes a
rejection: the challenge is required instead.

## Fallback challenge

- **Slider** to drag slowly from left to right (mouse, finger, pen). A gesture that is too abrupt
  (under 0.4 s) is refused on the spot with an invitation to try again more slowly. The press, the
  path (at most 200 points, in thousandths of the track), the stop, the duration and the pointer
  type are recorded. A constant-speed path, typical of a naive bot, is rejected.
- **Keyboard mode**, for people using neither mouse, touch screen nor trackpad. Three times in a row:
  - "Press and hold the F key on your keyboard" is shown, with an illustrated key being pressed;
  - while the key is held, the illustrated key stays down and "Keep holding the F key…" is shown
    with a countdown and a progress bar. This state is neither announced nor spoken;
  - after 2 to 4 s: "Release the F key".

  Three dots show progress. The key and the durations are chosen by the server. Releasing too
  quickly after the instruction (under 80 ms) betrays an automaton. If the focus leaves the
  verification area, a message invites the user back (Tab key). The mode opens with a button, and
  also as soon as a key is pressed on the slider: the slider does not move with the keyboard, which
  would be too easy to automate.
- **Text mode**: instructions live in an announced region (`aria-live`) that screen readers and
  braille displays render.
- **Optional audio mode** (checkbox, browser speech synthesis). It says "This is a protection against
  malicious robots", then the instructions.

The challenge is a native modal `<dialog>`: trapped focus, Escape to cancel, 44 px targets, dark
mode, reduced motion on request. Events fabricated by a page script (`isTrusted: false`) are ignored.

### Accessibility profiles

Each of these has a test vector and passes **without** any challenge:
- mouse;
- keyboard only;
- screen reader or braille display (inputs and focus, no keystrokes or pointer);
- browser autofill followed by a click;
- phone;
- form restored on Back, then navigated with the keyboard (Tab, Enter).

**Known limitation.** A braille display often types with key chords and produces no hold duration.
A person who has neither a regular keyboard, nor a pointer, nor a touch screen therefore cannot pass
the challenge. They only face it if their normal input (counted inputs and focus changes) was not
enough. Plan a fallback that needs no challenge on your side: e-mail confirmation, support contact.

## Privacy

- Collected: counters, field names with their focus time and two flags (edited, filled without
  keystroke), the pointer type, `navigator.webdriver`, the device clocks and its time zone offset.
  For the challenge: the relative slider path, or the hold durations.
- Nothing is kept after verification, except the key until it expires.
- No cookie, no device fingerprint, no third-party service.

This is a security processing. How you mention it in your privacy policy is up to the data
controller.

## Usage at a glance

### Classic HTML form

```html
<script src="/assets/onlc-bot-filter.js" defer></script>
<form method="post" action="/contact" data-onlc-bot-filter="contact" data-onlc-bot-filter-endpoint="/onlc-bot-filter/key">
  …
</form>
```

The form receives the `onlc-bot-filter` field. If a script interrupts the submission (AJAX), call
`reset()` on the instance to allow a new submission.

### Application (ES module)

```ts
import { attach } from 'onlc-bot-filter';

const filter = attach(formElement, { action: 'login', mode: 'manual', fetchKey: (a) => api.get(`/onlc-bot-filter/key?action=${a}`) });
const proof = await filter.seal();           // runs the challenge if needed; a second call fails until reset()
await api.post('/login', body, { headers: { 'X-Bot-Filter': proof } });
filter.reset();                              // after the response: next key (already prepared)
// Server answered CHALLENGE_REQUIRED: start again with filter.seal({ force: true }).
```

| Option | Purpose |
|---|---|
| `action` | Protected action, bound to the key |
| `endpoint` / `fetchKey` | URL that issues keys, or a function that does it |
| `mode` | `form` (default, intercepts submission) or `manual` |
| `fieldName` | Hidden field name (default `onlc-bot-filter`) |
| `lang`, `messages` | Challenge language (default: the page's) and texts |
| `onError` | Key unavailable in form mode. Default: a message inside the form |
| `forceChallenge` | Challenge from the first submission (attribute `data-onlc-bot-filter-challenge`) |
| `injectStyle` | `false`: load `dist/onlc-bot-filter.css` yourself, for a strict CSP (attribute `data-onlc-bot-filter-nostyle`) |

### PHP server

```php
use OnlineCreation\BotFilter\{Issuer, Verifier, ApcuKeyStore};

$store = new ApcuKeyStore();              // or FileKeyStore, or your own KeyStore (shared cache, database)
// GET /onlc-bot-filter/key?action=contact  — send Cache-Control: no-store
echo json_encode((new Issuer($store))->issue($_GET['action']));
// On form submission. $filled: names of fields received with a non-default value (optional, recommended)
$result = (new Verifier($store))->verify($_POST['onlc-bot-filter'] ?? null, 'contact', null, $filled);
if (!$result->ok) { /* $result->code, $result->reasons */ }
```

### Node server

```ts
import { issueKey, verify, MemoryKeyStore } from 'onlc-bot-filter/server';
```

## Result codes

| Code | Meaning |
|---|---|
| `OK` | Accepted. `challenge` tells which challenge was passed, if any |
| `CHALLENGE_REQUIRED` | Weak signals without a challenge: try again with the challenge (`seal({ force: true })`) |
| `MALFORMED`, `BAD_SIGNATURE` | Unreadable field, or modified after signing |
| `UNKNOWN_KEY`, `REPLAYED`, `EXPIRED` | Unknown key, already used, or too old |
| `ACTION_MISMATCH` | Key issued for another action |
| `TOO_FAST` | Sent less than 1 s after the key was issued |
| `CLOCK_INCOHERENT` | The device claims more time than actually elapsed |
| `FIELDS_INCOHERENT` | Sum of per-field times greater than the time spent (impossible measurement) |
| `CHALLENGE_FAILED` | Challenge present but not plausible |

Signals (`reasons`), for your logs:
`short_time`, `few_interactions`, `webdriver`, `field_too_quick` (a field typed by hand in under
one second), `filled_field_not_edited` (a field received filled that the client reports untouched),
`wall_clock_drift` (the device clock changed while filling in), `clock_skew` (device clock off by
more than 48 h).

## Settings (`Policy`)

| Setting | Default | Meaning |
|---|---|---|
| `minSeconds` | 3 | Below this time spent, the challenge is required (s) |
| `hardMinSeconds` | 1 | Below this, rejected even with a challenge (s) |
| `maxSeconds` | 7200 | Key lifetime (s) |
| `minInteractions` | 3 | Below this count, the challenge is required |
| `minFieldMs` | 1000 | Minimal focus time of a field typed by hand (ms) |
| `clockDrift` | 2000 | Tolerated gap between wall clock and monotonic clock (ms) |
| `maxSkew` | 48 h | Tolerated gap between device and server clocks; beyond: challenge, never rejection |
| `holdRounds` | 3 | Keyboard challenge rounds |
| `holdMin` / `holdMax` | 2000 / 4000 | Imposed hold durations (ms) |
| `reactMin` / `reactMax` | 80 / 8000 | Reaction time bounds to "release" (ms) |
| `letters` | `DFJKLS` | Keys used by the keyboard challenge |

Same names and defaults in PHP (`new Policy(...)`, `Policy::fromArray()`) and Node
(`DEFAULT_POLICY`, `policy` option).

## Tests

70 vectors are shared by both verifiers; 31 of them are attacks:
- **signature**: signed with another key, empty, wrong format, content changed afterwards;
- **trapped types**: negative, decimal, huge or string numbers, lists instead of objects, boolean as
  string, field over 8 KiB, deep nesting, 21 fields;
- **field names**: `__proto__`, `constructor`, tags;
- **clocks**: year 2100, submission before reception;
- **slider**: 201 points, position off track, time going backwards, teleportation;
- **challenge**: unknown type, missing rounds, challenge longer than the elapsed time.

Plus: 8 PHP processes presenting the same proof at the same instant (only one passes); a key id
trying to escape the key directory (`../../etc/passwd`); in the browser, script-fabricated events
ignored and double submission blocked. The "known limitation" vector documents what deliberately
passes: a linear path with added noise.

## Development

Requires Node 20+ and PHP 8.2+.

```bash
npm install
npm run check       # types, JS tests (client, verifier, vectors) and PHP tests
npm run build       # dist/: onlc-bot-filter.js (script), .mjs (module), .css, server.mjs
npm run vectors     # regenerate tests/vectors.json from the TypeScript verifier (after npm run build)
npm run demo        # http://127.0.0.1:8099 (PHP demo server)
```

Code comments and test names are in French.

## License

MIT — see [LICENSE](LICENSE).
