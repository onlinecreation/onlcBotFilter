# Changelog

Semantic versioning (`MAJOR.MINOR.PATCH`). The **protocol** version (`v` in the proof and in the key
response) is separate. It only changes with a major library version, and client and server must
then be updated together.

## Unreleased

- Client: cancelling the challenge now rejects `seal()` with a `BotFilterError` (code `CANCELLED`),
  as its type declares. It used to be a plain `Error` carrying a `code` property, so
  `error instanceof BotFilterError` was false.
- README: the rejection codes of `seal()` are documented.

## 1.0.0 — 2026-10-14

First public release, protocol 2.

- **Client**:
  - single-use key per form;
  - interaction count;
  - per-field record: focus time, edited compared with the HTML default value, filled without
    keystroke;
  - signed proof (HMAC-SHA256), double submission blocked;
  - recovery after a Back navigation served from the page cache.
- **Fallback challenge**:
  - slider to drag slowly; a gesture under 0.4 s is refused on the spot with an invitation to try
    again more slowly, without sending a proof bound to fail;
  - keyboard mode (illustrated key, visual "Keep holding" and countdown);
  - text instructions in a live region, optional audio;
  - five languages (en, fr, es, de, nl).
- **Verifiers**:
  - PHP 8.2+ and TypeScript, 70 shared vectors including 31 hostile ones;
  - memory, file and APCu key stores;
  - concurrent attack (8 simultaneous submissions of the same proof) tested.
- A form restored by the browser on Back is not taken for a forged proof: a suspicion on fields
  requires the challenge, it never rejects.
