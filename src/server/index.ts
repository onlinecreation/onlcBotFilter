/**
 * Vérificateur onlcBotFilter pour Node. Transcription exacte :
 * `php/src/Verifier.php`. Les deux passent `tests/vectors.json`.
 */
import { hmacSha256 } from '../shared/hmac';
import { FIELD_MAX_BYTES, FIELD_NAME, interactionCount, MAX_FIELDS, type Challenge, type FieldValue, type KeyResponse, type Payload } from '../shared/protocol';
import { DEFAULT_POLICY, type Policy } from './policy';

export { DEFAULT_POLICY, type Policy };
export type { KeyResponse, Payload };

export interface KeyRecord {
  key: string;
  action: string;
  issuedAt: number;
  letter: string;
  holds: number[];
}

/** Stockage des clés : `consume` est atomique et marque la clé utilisée (le rejeu est reconnu). */
export interface KeyStore {
  save(id: string, record: KeyRecord, ttlSeconds: number): void | Promise<void>;
  consume(id: string): { record: KeyRecord; alreadyUsed: boolean } | null | Promise<{ record: KeyRecord; alreadyUsed: boolean } | null>;
}

export class MemoryKeyStore implements KeyStore {
  private items = new Map<string, { record: KeyRecord; used: boolean; until: number }>();
  constructor(private readonly clock: () => number = Date.now) {}
  save(id: string, record: KeyRecord, ttlSeconds: number): void {
    this.items.set(id, { record, used: false, until: this.clock() + ttlSeconds * 1000 });
  }
  consume(id: string) {
    const it = this.items.get(id);
    if (!it || it.until < this.clock()) return null;
    const alreadyUsed = it.used;
    it.used = true;
    return { record: it.record, alreadyUsed };
  }
}

/** Codes de refus définitif et code « défi exigé » (le client recommence avec le défi). */
export type Code =
  | 'OK' | 'MALFORMED' | 'BAD_SIGNATURE' | 'UNKNOWN_KEY' | 'REPLAYED' | 'ACTION_MISMATCH'
  | 'TOO_FAST' | 'EXPIRED' | 'CLOCK_INCOHERENT' | 'FIELDS_INCOHERENT' | 'CHALLENGE_REQUIRED' | 'CHALLENGE_FAILED';

export interface Result {
  ok: boolean;
  code: Code;
  /** Signaux relevés (journal), sans donnée personnelle. */
  reasons: string[];
  /** Défi présenté et réussi */
  challenge: 'slide' | 'keys' | null;
}

function randomToken(bytes: number): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomInt(min: number, max: number): number {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return min + (b[0]! % (max - min + 1));
}

export async function issueKey(store: KeyStore, action: string, opts: { policy?: Partial<Policy>; now?: number } = {}): Promise<KeyResponse> {
  const p = { ...DEFAULT_POLICY, ...opts.policy };
  const now = opts.now ?? Date.now();
  const id = randomToken(16);
  const record: KeyRecord = {
    key: randomToken(32), action, issuedAt: now,
    letter: p.letters[randomInt(0, p.letters.length - 1)]!,
    holds: Array.from({ length: p.holdRounds }, () => randomInt(p.holdMin, p.holdMax)),
  };
  await store.save(id, record, p.maxSeconds);
  return { v: 2, id, key: record.key, issuedAt: now, expiresIn: p.maxSeconds, minSeconds: p.minSeconds, minInteractions: p.minInteractions, minFieldMs: p.minFieldMs, letter: record.letter, holds: record.holds };
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
const COUNT_KEYS = ['ptr', 'mv', 'tch', 'key', 'inp', 'foc', 'pst', 'scr'] as const;

/** Lecture stricte : tout champ inattendu ou mal typé rend la preuve illisible. */
function parsePayload(d: string): Payload | null {
  let x: unknown;
  try { x = JSON.parse(d); } catch { return null; }
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  if (p.v !== 2 || typeof p.id !== 'string' || typeof p.a !== 'string' || !isInt(p.t0) || !isInt(p.t1) || !isInt(p.el) || !isInt(p.ft)) return null;
  if (typeof p.tz !== 'number' || !Number.isInteger(p.tz) || Math.abs(p.tz) > 1440) return null;
  const c = p.c as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object' || !COUNT_KEYS.every((k) => isInt(c[k]))) return null;
  const env = p.env as Record<string, unknown> | undefined;
  if (!env || typeof env !== 'object' || typeof env.wd !== 'boolean' || !(env.pt === null || typeof env.pt === 'string')) return null;
  const f = p.f as Record<string, unknown> | undefined;
  if (!f || typeof f !== 'object' || Array.isArray(f) || Object.keys(f).length > MAX_FIELDS) return null;
  for (const [name, info] of Object.entries(f)) {
    const i = info as Record<string, unknown> | null;
    if (!FIELD_NAME.test(name) || !i || typeof i !== 'object' || !isInt(i.d) || (i.e !== 0 && i.e !== 1) || (i.a !== 0 && i.a !== 1)) return null;
  }
  if (p.ch !== undefined && !validChallengeShape(p.ch)) return null;
  return p as unknown as Payload;
}

function validChallengeShape(ch: unknown): ch is Challenge {
  if (!ch || typeof ch !== 'object') return false;
  const c = ch as Record<string, unknown>;
  if (c.m === 'slide') {
    return (c.pt === null || typeof c.pt === 'string') && Array.isArray(c.p) && c.p.length <= 200
      && c.p.every((s) => Array.isArray(s) && s.length === 2 && isInt(s[0]) && isInt(s[1]) && s[1] <= 1000);
  }
  if (c.m === 'keys') {
    return Array.isArray(c.r) && c.r.length <= 10 && c.r.every((r) => r && typeof r === 'object' && isInt((r as { t: unknown }).t) && isInt((r as { h: unknown }).h))
      && isInt(c.f) && typeof c.au === 'boolean';
  }
  return false;
}

/** Glissement humain : départ à gauche, arrivée à droite, durée plausible, vitesse irrégulière. */
export function slideIsHuman(p: Array<[number, number]>): boolean {
  if (p.length < 5) return false;
  for (let i = 1; i < p.length; i++) if (p[i]![0] < p[i - 1]![0]) return false;
  const duration = p[p.length - 1]![0] - p[0]![0];
  if (p[0]![1] > 150 || p[p.length - 1]![1] < 950 || duration < 200 || duration > 60000) return false;
  const v: number[] = [];
  for (let i = 1; i < p.length; i++) {
    const dt = p[i]![0] - p[i - 1]![0];
    if (dt > 0) v.push((p[i]![1] - p[i - 1]![1]) / dt);
  }
  if (v.length < 3) return false;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  if (mean <= 0) return false;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  // Un trajet interpolé à vitesse constante (robot naïf) a un coefficient de variation nul.
  return sd / mean >= 0.1;
}

/** Défi au clavier : durées imposées par le serveur, relâchement après la consigne, réaction humaine. */
export function keysAreHuman(r: Array<{ t: number; h: number }>, rec: KeyRecord, policy: Policy): boolean {
  if (r.length !== rec.holds.length) return false;
  return r.every((x, i) => x.t === rec.holds[i] && x.h - x.t >= policy.reactMin && x.h - x.t <= policy.reactMax);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * `filled` (facultatif) : noms des champs envoyés avec une valeur différente de leur valeur par défaut,
 * quand le serveur les connaît (formulaire classique). Chacun doit avoir été déclaré modifié.
 */
export async function verify(value: string | null | undefined, ctx: { action: string; store: KeyStore; now?: number; policy?: Partial<Policy>; filled?: string[] }): Promise<Result> {
  const p = { ...DEFAULT_POLICY, ...ctx.policy };
  const now = ctx.now ?? Date.now();
  const fail = (code: Code, reasons: string[] = []): Result => ({ ok: false, code, reasons, challenge: null });
  if (typeof value !== 'string' || value === '' || new TextEncoder().encode(value).length > FIELD_MAX_BYTES) return fail('MALFORMED');
  let field: FieldValue;
  try { field = JSON.parse(value) as FieldValue; } catch { return fail('MALFORMED'); }
  if (!field || typeof field.d !== 'string' || typeof field.s !== 'string') return fail('MALFORMED');
  const payload = parsePayload(field.d);
  if (!payload) return fail('MALFORMED');

  // La clé est brûlée dès la première présentation, que la preuve soit bonne ou non.
  const found = await ctx.store.consume(payload.id);
  if (!found) return fail('UNKNOWN_KEY');
  if (found.alreadyUsed) return fail('REPLAYED');
  const rec = found.record;
  if (!timingSafeEqual(await hmacSha256(rec.key, field.d), field.s)) return fail('BAD_SIGNATURE');
  if (payload.a !== ctx.action || rec.action !== ctx.action) return fail('ACTION_MISMATCH');

  const serverElapsed = now - rec.issuedAt;
  if (serverElapsed > p.maxSeconds * 1000) return fail('EXPIRED');
  if (serverElapsed < p.hardMinSeconds * 1000) return fail('TOO_FAST');
  // Le terminal ne peut pas avoir passé plus de temps sur le formulaire qu'il ne s'en est écoulé
  // depuis l'émission de la clé (l'inverse est normal : réseau, mise en veille).
  if (payload.el > serverElapsed + p.clockDrift) return fail('CLOCK_INCOHERENT', ['monotonic_ahead']);

  // Le temps depuis la clé est inclus dans le temps passé sur le formulaire, qui couvre lui-même
  // la somme des temps par champ.
  if (payload.el > payload.ft + p.clockDrift) return fail('CLOCK_INCOHERENT', ['key_older_than_form']);
  if (Object.values(payload.f).reduce((s, i) => s + i.d, 0) > payload.ft + p.clockDrift) return fail('FIELDS_INCOHERENT', ['field_time_exceeds_total']);

  const reasons: string[] = [];
  if (ctx.filled) {
    for (const name of ctx.filled) {
      const info = Object.hasOwn(payload.f, name) ? payload.f[name] : undefined;
      // Champ arrivé rempli que le client dit intact : preuve fabriquée sans regarder le formulaire,
      // ou cas imprévu du navigateur. Soupçon, pas refus : le défi tranche.
      if (!info || info.e !== 1) {
        if (!reasons.includes('filled_field_not_edited')) reasons.push('filled_field_not_edited');
        continue;
      }
      // Rempli à la main en moins d'une seconde (le remplissage automatique est exempté).
      if (info.a !== 1 && info.d < p.minFieldMs && !reasons.includes('field_too_quick')) reasons.push('field_too_quick');
    }
  }
  if (serverElapsed < p.minSeconds * 1000) reasons.push('short_time');
  if (interactionCount(payload.c) < p.minInteractions) reasons.push('few_interactions');
  if (payload.env.wd) reasons.push('webdriver');
  // Horloge murale contre horloge monotone : réglage modifié en cours de route ou valeurs inventées.
  if (Math.abs(payload.t1 - payload.t0 - payload.el) > p.clockDrift + payload.el / 100) reasons.push('wall_clock_drift');
  // Horloge du terminal mal réglée : courant, jamais un motif de refus à lui seul.
  if (Math.abs(payload.t1 - now) > p.maxSkew) reasons.push('clock_skew');

  if (payload.ch) {
    const ch = payload.ch;
    // Le défi se déroule pendant le remplissage : il ne peut pas avoir duré plus longtemps.
    const spent = ch.m === 'slide' ? (ch.p.length ? ch.p[ch.p.length - 1]![0] - ch.p[0]![0] : 0) : ch.r.reduce((s, x) => s + x.h, 0);
    const passed = spent <= serverElapsed + p.clockDrift && (ch.m === 'slide' ? slideIsHuman(ch.p) : keysAreHuman(ch.r, rec, p));
    if (!passed) return fail('CHALLENGE_FAILED', reasons);
    return { ok: true, code: 'OK', reasons, challenge: ch.m };
  }
  if (reasons.length) return fail('CHALLENGE_REQUIRED', reasons);
  return { ok: true, code: 'OK', reasons, challenge: null };
}
