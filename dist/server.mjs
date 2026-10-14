// src/shared/hmac.ts
var enc = new TextEncoder();
function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmacSha256(key, data) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const k = await subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return b64url(new Uint8Array(await subtle.sign("HMAC", k, enc.encode(data))));
  }
  return b64url(hmacFallback(enc.encode(key), enc.encode(data)));
}
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256(msg) {
  const len = msg.length;
  const padded = new Uint8Array(len + 9 + 63 >> 6 << 6);
  padded.set(msg);
  padded[len] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len * 8 / 2 ** 32));
  view.setUint32(padded.length - 4, len * 8 >>> 0);
  const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const w = new Uint32Array(64);
  const rot = (x, n) => x >>> n | x << 32 - n;
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] >>> 0;
      const t2 = (rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => {
      h[i] = h[i] + v >>> 0;
    });
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}
function hmacFallback(key, data) {
  let k = key.length > 64 ? sha256(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  k = block;
  const inner = new Uint8Array(64 + data.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = k[i] ^ 54;
    outer[i] = k[i] ^ 92;
  }
  inner.set(data, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

// src/shared/protocol.ts
var MAX_FIELDS = 20;
var FIELD_NAME = /^[A-Za-z0-9_.\-\[\]]{1,40}$/;
var FIELD_MAX_BYTES = 8192;
function interactionCount(c) {
  return c.ptr + c.tch + c.key + c.inp + c.foc + c.pst;
}

// src/server/policy.ts
var DEFAULT_POLICY = {
  minSeconds: 3,
  hardMinSeconds: 1,
  maxSeconds: 7200,
  minInteractions: 3,
  minFieldMs: 1e3,
  clockDrift: 2e3,
  maxSkew: 48 * 3600 * 1e3,
  holdRounds: 3,
  holdMin: 2e3,
  holdMax: 4e3,
  reactMin: 80,
  reactMax: 8e3,
  letters: "DFJKLS"
};

// src/server/index.ts
var MemoryKeyStore = class {
  constructor(clock = Date.now) {
    this.clock = clock;
  }
  clock;
  items = /* @__PURE__ */ new Map();
  save(id, record, ttlSeconds) {
    this.items.set(id, { record, used: false, until: this.clock() + ttlSeconds * 1e3 });
  }
  consume(id) {
    const it = this.items.get(id);
    if (!it || it.until < this.clock()) return null;
    const alreadyUsed = it.used;
    it.used = true;
    return { record: it.record, alreadyUsed };
  }
};
function randomToken(bytes) {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomInt(min, max) {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return min + b[0] % (max - min + 1);
}
async function issueKey(store, action, opts = {}) {
  const p = { ...DEFAULT_POLICY, ...opts.policy };
  const now = opts.now ?? Date.now();
  const id = randomToken(16);
  const record = {
    key: randomToken(32),
    action,
    issuedAt: now,
    letter: p.letters[randomInt(0, p.letters.length - 1)],
    holds: Array.from({ length: p.holdRounds }, () => randomInt(p.holdMin, p.holdMax))
  };
  await store.save(id, record, p.maxSeconds);
  return { v: 2, id, key: record.key, issuedAt: now, expiresIn: p.maxSeconds, minSeconds: p.minSeconds, minInteractions: p.minInteractions, minFieldMs: p.minFieldMs, letter: record.letter, holds: record.holds };
}
var isInt = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
var COUNT_KEYS = ["ptr", "mv", "tch", "key", "inp", "foc", "pst", "scr"];
function parsePayload(d) {
  let x;
  try {
    x = JSON.parse(d);
  } catch {
    return null;
  }
  if (!x || typeof x !== "object") return null;
  const p = x;
  if (p.v !== 2 || typeof p.id !== "string" || typeof p.a !== "string" || !isInt(p.t0) || !isInt(p.t1) || !isInt(p.el) || !isInt(p.ft)) return null;
  if (typeof p.tz !== "number" || !Number.isInteger(p.tz) || Math.abs(p.tz) > 1440) return null;
  const c = p.c;
  if (!c || typeof c !== "object" || !COUNT_KEYS.every((k) => isInt(c[k]))) return null;
  const env = p.env;
  if (!env || typeof env !== "object" || typeof env.wd !== "boolean" || !(env.pt === null || typeof env.pt === "string")) return null;
  const f = p.f;
  if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).length > MAX_FIELDS) return null;
  for (const [name, info] of Object.entries(f)) {
    const i = info;
    if (!FIELD_NAME.test(name) || !i || typeof i !== "object" || !isInt(i.d) || i.e !== 0 && i.e !== 1 || i.a !== 0 && i.a !== 1) return null;
  }
  if (p.ch !== void 0 && !validChallengeShape(p.ch)) return null;
  return p;
}
function validChallengeShape(ch) {
  if (!ch || typeof ch !== "object") return false;
  const c = ch;
  if (c.m === "slide") {
    return (c.pt === null || typeof c.pt === "string") && Array.isArray(c.p) && c.p.length <= 200 && c.p.every((s) => Array.isArray(s) && s.length === 2 && isInt(s[0]) && isInt(s[1]) && s[1] <= 1e3);
  }
  if (c.m === "keys") {
    return Array.isArray(c.r) && c.r.length <= 10 && c.r.every((r) => r && typeof r === "object" && isInt(r.t) && isInt(r.h)) && isInt(c.f) && typeof c.au === "boolean";
  }
  return false;
}
function slideIsHuman(p) {
  if (p.length < 5) return false;
  for (let i = 1; i < p.length; i++) if (p[i][0] < p[i - 1][0]) return false;
  const duration = p[p.length - 1][0] - p[0][0];
  if (p[0][1] > 150 || p[p.length - 1][1] < 950 || duration < 200 || duration > 6e4) return false;
  const v = [];
  for (let i = 1; i < p.length; i++) {
    const dt = p[i][0] - p[i - 1][0];
    if (dt > 0) v.push((p[i][1] - p[i - 1][1]) / dt);
  }
  if (v.length < 3) return false;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  if (mean <= 0) return false;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return sd / mean >= 0.1;
}
function keysAreHuman(r, rec, policy) {
  if (r.length !== rec.holds.length) return false;
  return r.every((x, i) => x.t === rec.holds[i] && x.h - x.t >= policy.reactMin && x.h - x.t <= policy.reactMax);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verify(value, ctx) {
  const p = { ...DEFAULT_POLICY, ...ctx.policy };
  const now = ctx.now ?? Date.now();
  const fail = (code, reasons2 = []) => ({ ok: false, code, reasons: reasons2, challenge: null });
  if (typeof value !== "string" || value === "" || new TextEncoder().encode(value).length > FIELD_MAX_BYTES) return fail("MALFORMED");
  let field;
  try {
    field = JSON.parse(value);
  } catch {
    return fail("MALFORMED");
  }
  if (!field || typeof field.d !== "string" || typeof field.s !== "string") return fail("MALFORMED");
  const payload = parsePayload(field.d);
  if (!payload) return fail("MALFORMED");
  const found = await ctx.store.consume(payload.id);
  if (!found) return fail("UNKNOWN_KEY");
  if (found.alreadyUsed) return fail("REPLAYED");
  const rec = found.record;
  if (!timingSafeEqual(await hmacSha256(rec.key, field.d), field.s)) return fail("BAD_SIGNATURE");
  if (payload.a !== ctx.action || rec.action !== ctx.action) return fail("ACTION_MISMATCH");
  const serverElapsed = now - rec.issuedAt;
  if (serverElapsed > p.maxSeconds * 1e3) return fail("EXPIRED");
  if (serverElapsed < p.hardMinSeconds * 1e3) return fail("TOO_FAST");
  if (payload.el > serverElapsed + p.clockDrift) return fail("CLOCK_INCOHERENT", ["monotonic_ahead"]);
  if (payload.el > payload.ft + p.clockDrift) return fail("CLOCK_INCOHERENT", ["key_older_than_form"]);
  if (Object.values(payload.f).reduce((s, i) => s + i.d, 0) > payload.ft + p.clockDrift) return fail("FIELDS_INCOHERENT", ["field_time_exceeds_total"]);
  const reasons = [];
  if (ctx.filled) {
    for (const name of ctx.filled) {
      const info = Object.hasOwn(payload.f, name) ? payload.f[name] : void 0;
      if (!info || info.e !== 1) {
        if (!reasons.includes("filled_field_not_edited")) reasons.push("filled_field_not_edited");
        continue;
      }
      if (info.a !== 1 && info.d < p.minFieldMs && !reasons.includes("field_too_quick")) reasons.push("field_too_quick");
    }
  }
  if (serverElapsed < p.minSeconds * 1e3) reasons.push("short_time");
  if (interactionCount(payload.c) < p.minInteractions) reasons.push("few_interactions");
  if (payload.env.wd) reasons.push("webdriver");
  if (Math.abs(payload.t1 - payload.t0 - payload.el) > p.clockDrift + payload.el / 100) reasons.push("wall_clock_drift");
  if (Math.abs(payload.t1 - now) > p.maxSkew) reasons.push("clock_skew");
  if (payload.ch) {
    const ch = payload.ch;
    const spent = ch.m === "slide" ? ch.p.length ? ch.p[ch.p.length - 1][0] - ch.p[0][0] : 0 : ch.r.reduce((s, x) => s + x.h, 0);
    const passed = spent <= serverElapsed + p.clockDrift && (ch.m === "slide" ? slideIsHuman(ch.p) : keysAreHuman(ch.r, rec, p));
    if (!passed) return fail("CHALLENGE_FAILED", reasons);
    return { ok: true, code: "OK", reasons, challenge: ch.m };
  }
  if (reasons.length) return fail("CHALLENGE_REQUIRED", reasons);
  return { ok: true, code: "OK", reasons, challenge: null };
}
export {
  DEFAULT_POLICY,
  MemoryKeyStore,
  issueKey,
  keysAreHuman,
  slideIsHuman,
  verify
};
//# sourceMappingURL=server.mjs.map
