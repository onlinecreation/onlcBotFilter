import { describe, expect, it } from 'vitest';
import { b64url, hmacFallback, hmacSha256 } from '../src/shared/hmac';
import { issueKey, MemoryKeyStore, verify, type KeyRecord } from '../src/server';

import raw from './vectors.json';

const vectors = raw as unknown as {
  record: KeyRecord; id: string; cases: Array<{ name: string; value: string; now: number; expect: string; filled?: string[] }>;
  replay: { value: string; now: number; first: string; second: string };
};

describe('HMAC-SHA256', () => {
  it('implémentation de repli conforme (RFC 4231, cas 2) et identique à WebCrypto', async () => {
    const enc = new TextEncoder();
    const hex = [...hmacFallback(enc.encode('Jefe'), enc.encode('what do ya want for nothing?'))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    const long = 'k'.repeat(100);
    const data = 'é'.repeat(300);
    expect(await hmacSha256(long, data)).toBe(b64url(hmacFallback(enc.encode(long), enc.encode(data))));
  });
});

describe('vérificateur : vecteurs communs avec PHP', () => {
  for (const c of vectors.cases) {
    it(c.name, async () => {
      const store = new MemoryKeyStore(() => c.now);
      store.save(vectors.id, vectors.record, 7200);
      expect((await verify(c.value, { action: 'contact', store, now: c.now, filled: c.filled })).code).toBe(c.expect);
    });
  }
  it('rejeu refusé', async () => {
    const store = new MemoryKeyStore(() => vectors.replay.now);
    store.save(vectors.id, vectors.record, 7200);
    expect((await verify(vectors.replay.value, { action: 'contact', store, now: vectors.replay.now })).code).toBe('OK');
    expect((await verify(vectors.replay.value, { action: 'contact', store, now: vectors.replay.now })).code).toBe('REPLAYED');
  });
});

describe('émission des clés', () => {
  it('clé unique, durées du défi entre 2 et 4 s, touche imposée', async () => {
    const store = new MemoryKeyStore();
    const a = await issueKey(store, 'login');
    const b = await issueKey(store, 'login');
    expect(a.id).not.toBe(b.id);
    expect(a.key).not.toBe(b.key);
    expect(a.holds).toHaveLength(3);
    expect(a.holds.every((h) => h >= 2000 && h <= 4000)).toBe(true);
    expect('DFJKLS').toContain(a.letter);
  });
});
