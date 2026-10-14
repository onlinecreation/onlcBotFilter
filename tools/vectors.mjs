// Vecteurs de test communs : décisions du vérificateur TypeScript, rejouées par le vérificateur PHP.
// `npm run build && npm run vectors` → tests/vectors.json.
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { MemoryKeyStore, verify } from '../dist/server.mjs';

const issuedAt = 1_800_000_000_000;
const record = { key: 'Zm9vYmFyLWNsZS11bmlxdWUtZGUtdGVzdC0zMi1vY3RldHM', action: 'contact', issuedAt, letter: 'F', holds: [2500, 3100, 3800] };
const id = 'aWQtZGUtdGVzdC0xNg';
const sign = (d, key = record.key) => createHmac('sha256', key).update(d).digest('base64url');
const base = (o = {}) => ({
  v: 2, id, a: 'contact', t0: issuedAt + 300, t1: issuedAt + 20_300, el: 20_000, ft: 21_000, tz: -120,
  c: { ptr: 4, mv: 180, tch: 0, key: 42, inp: 40, foc: 3, pst: 0, scr: 2 },
  f: { nom: { d: 3200, e: 1, a: 0 }, message: { d: 9400, e: 1, a: 0 } }, env: { pt: 'mouse', wd: false }, ...o,
});
const field = (p, key) => { const d = JSON.stringify(p); return JSON.stringify({ d, s: sign(d, key) }); };
const humanSlide = [[0, 0], [40, 30], [90, 120], [150, 300], [210, 520], [260, 700], [320, 860], [380, 940], [430, 985], [470, 1000]];
const linearSlide = Array.from({ length: 10 }, (_, i) => [i * 50, Math.round((i * 1000) / 9)]);
const keys = (h) => ({ m: 'keys', r: record.holds.map((t, i) => ({ t, h: t + h[i] })), f: 0, au: false });

const cases = [
  ['humain à la souris', field(base()), 'OK'],
  ['clavier seul', field(base({ c: { ptr: 0, mv: 0, tch: 0, key: 60, inp: 55, foc: 6, pst: 0, scr: 0 }, env: { pt: null, wd: false } })), 'OK'],
  ['lecteur d’écran ou plage braille (saisies et focus)', field(base({ c: { ptr: 0, mv: 0, tch: 0, key: 0, inp: 30, foc: 5, pst: 0, scr: 0 }, env: { pt: null, wd: false } })), 'OK'],
  ['remplissage automatique puis clic', field(base({ c: { ptr: 1, mv: 12, tch: 0, key: 0, inp: 4, foc: 1, pst: 0, scr: 0 }, f: { nom: { d: 0, e: 1, a: 1 }, message: { d: 0, e: 1, a: 1 } } })), 'OK', undefined, ['nom', 'message']],
  ['téléphone', field(base({ c: { ptr: 8, mv: 0, tch: 8, key: 0, inp: 35, foc: 3, pst: 0, scr: 4 }, env: { pt: 'touch', wd: false } })), 'OK'],
  ['horloge du terminal décalée de 3 jours, sans défi', field(base({ t0: issuedAt + 3 * 86400000, t1: issuedAt + 3 * 86400000 + 20000 })), 'CHALLENGE_REQUIRED'],
  ['horloge décalée de 3 jours, curseur réussi', field(base({ t0: issuedAt + 3 * 86400000, t1: issuedAt + 3 * 86400000 + 20000, ch: { m: 'slide', pt: 'mouse', p: humanSlide } })), 'OK'],
  ['fuseau horaire lointain (sans effet)', field(base({ tz: 600 })), 'OK'],
  ['signature fausse', JSON.stringify({ d: JSON.stringify(base()), s: sign('autre chose') }), 'BAD_SIGNATURE'],
  ['contenu modifié après signature', (() => { const v = JSON.parse(field(base())); v.d = v.d.replace('"key":42', '"key":420'); return JSON.stringify(v); })(), 'BAD_SIGNATURE'],
  ['autre action', field(base({ a: 'login' })), 'ACTION_MISMATCH'],
  ['clé inconnue', field(base({ id: 'inconnue' })), 'UNKNOWN_KEY'],
  ['illisible', '{"d":"pas du json","s":"x"}', 'MALFORMED'],
  ['champ inattendu', field(base({ c: { ptr: 4 } })), 'MALFORMED'],
  ['envoyé en 0,5 s', field(base({ t1: issuedAt + 800, el: 500 })), 'TOO_FAST', issuedAt + 500],
  ['envoyé en 2 s sans défi', field(base({ t1: issuedAt + 2300, el: 2000 })), 'CHALLENGE_REQUIRED', issuedAt + 2000],
  ['envoyé en 2 s avec défi clavier', field(base({ t1: issuedAt + 2300, el: 2000, ch: keys([400, 650, 520]) })), 'CHALLENGE_FAILED', issuedAt + 2000],
  ['trop peu d’interactions', field(base({ c: { ptr: 0, mv: 0, tch: 0, key: 0, inp: 0, foc: 1, pst: 0, scr: 0 } })), 'CHALLENGE_REQUIRED'],
  ['navigateur piloté (webdriver)', field(base({ env: { pt: null, wd: true } })), 'CHALLENGE_REQUIRED'],
  ['clé de plus de 2 h (collectée pour rejeu)', field(base()), 'EXPIRED', issuedAt + 7201_000],
  ['temps monotone supérieur au temps réel', field(base({ el: 40_000, t1: issuedAt + 40_300 })), 'CLOCK_INCOHERENT'],
  ['horloge murale incohérente avec le temps passé', field(base({ t1: issuedAt + 90_300 })), 'CHALLENGE_REQUIRED'],
  ['champs remplis tels que déclarés', field(base()), 'OK', undefined, ['nom', 'message']],
  ['champ envoyé rempli mais déclaré intact : défi exigé', field(base({ f: { nom: { d: 3200, e: 1, a: 0 } } })), 'CHALLENGE_REQUIRED', undefined, ['nom', 'message']],
  ['champ envoyé rempli mais déclaré intact, défi réussi', field(base({ f: { nom: { d: 3200, e: 1, a: 0 } }, ch: { m: 'slide', pt: 'mouse', p: humanSlide } })), 'OK', undefined, ['nom', 'message']],
  ['formulaire restauré au retour arrière, simple clic puis défi', field(base({ c: { ptr: 1, mv: 0, tch: 0, key: 0, inp: 0, foc: 0, pst: 0, scr: 0 }, f: { nom: { d: 0, e: 1, a: 1 }, message: { d: 0, e: 1, a: 1 } }, ch: { m: 'slide', pt: 'mouse', p: humanSlide } })), 'OK', undefined, ['nom', 'message']],
  ['champs préremplis parcourus au clavier (tabulations, Entrée)', field(base({ c: { ptr: 0, mv: 0, tch: 0, key: 4, inp: 0, foc: 3, pst: 0, scr: 0 }, env: { pt: null, wd: false }, f: { nom: { d: 400, e: 1, a: 1 }, message: { d: 300, e: 1, a: 1 } } })), 'OK', undefined, ['nom', 'message']],
  ['champ saisi à la main en 0,4 s', field(base({ f: { nom: { d: 400, e: 1, a: 0 }, message: { d: 9400, e: 1, a: 0 } } })), 'CHALLENGE_REQUIRED', undefined, ['nom', 'message']],
  ['temps par champ supérieur au temps passé', field(base({ f: { nom: { d: 30_000, e: 1, a: 0 } } })), 'FIELDS_INCOHERENT'],
  ['clé plus ancienne que le formulaire', field(base({ ft: 5000 })), 'CLOCK_INCOHERENT'],
  ['nouvelle clé après une erreur (temps de formulaire cumulé)', field(base({ el: 6000, t0: issuedAt + 300, t1: issuedAt + 6300, ft: 95_000, f: { nom: { d: 30_000, e: 1, a: 0 }, message: { d: 50_000, e: 1, a: 0 } } })), 'OK', issuedAt + 6500],
  ['nom de champ hostile', field(base({ f: { '<script>': { d: 10, e: 1, a: 0 } } })), 'MALFORMED'],
  ['curseur humain', field(base({ c: { ptr: 0, mv: 0, tch: 0, key: 0, inp: 0, foc: 0, pst: 0, scr: 0 }, ch: { m: 'slide', pt: 'mouse', p: humanSlide } })), 'OK'],
  ['curseur à vitesse constante (robot naïf)', field(base({ ch: { m: 'slide', pt: 'mouse', p: linearSlide } })), 'CHALLENGE_FAILED'],
  ['curseur lâché au milieu', field(base({ ch: { m: 'slide', pt: 'touch', p: humanSlide.slice(0, 6) } })), 'CHALLENGE_FAILED'],
  ['clavier : trois appuis réussis', field(base({ el: 25_000, ft: 26_000, t1: issuedAt + 25_300, ch: keys([420, 610, 380]) })), 'OK', issuedAt + 26_000],
  ['clavier : relâché pile à la consigne (robot)', field(base({ el: 25_000, ft: 26_000, t1: issuedAt + 25_300, ch: keys([2, 1, 3]) })), 'CHALLENGE_FAILED', issuedAt + 26_000],
  ['clavier : durées imposées falsifiées', field(base({ el: 25_000, ft: 26_000, t1: issuedAt + 25_300, ch: { m: 'keys', r: [{ t: 2000, h: 2400 }, { t: 2000, h: 2400 }, { t: 2000, h: 2400 }], f: 0, au: true } })), 'CHALLENGE_FAILED', issuedAt + 26_000],

  // —— Tests hostiles : preuves fabriquées, types piégés, tailles et valeurs extrêmes ——
  ['hostile : signée avec une autre clé', JSON.stringify({ d: JSON.stringify(base()), s: sign(JSON.stringify(base()), 'une-autre-cle') }), 'BAD_SIGNATURE'],
  ['hostile : signature vide', JSON.stringify({ d: JSON.stringify(base()), s: '' }), 'BAD_SIGNATURE'],
  ['hostile : signature en hexadécimal', JSON.stringify({ d: JSON.stringify(base()), s: createHmac('sha256', record.key).update(JSON.stringify(base())).digest('hex') }), 'BAD_SIGNATURE'],
  ['hostile : contenu non textuel', JSON.stringify({ d: base(), s: 'x' }), 'MALFORMED'],
  ['hostile : JSON tronqué', field(base()).slice(0, 120), 'MALFORMED'],
  ['hostile : tableau à la place de l’objet', JSON.stringify([field(base())]), 'MALFORMED'],
  ['hostile : champ de plus de 8 Kio', field(base({ env: { pt: 'x'.repeat(9000), wd: false } })), 'MALFORMED'],
  ['hostile : ancienne version du protocole', field(base({ v: 1 })), 'MALFORMED'],
  ['hostile : durée négative', field(base({ el: -1 })), 'MALFORMED'],
  ['hostile : durée décimale', field(base({ el: 20000.5 })), 'MALFORMED'],
  ['hostile : durée gigantesque', field(base({ el: 1e20 })), 'MALFORMED'],
  ['hostile : durée en chaîne', field(base({ el: '20000' })), 'MALFORMED'],
  ['hostile : compteurs en liste', field(base({ c: [4, 180, 0, 42, 40, 3, 0, 2] })), 'MALFORMED'],
  ['hostile : champs en liste', field(base({ f: [{ d: 1, e: 1, a: 0 }] })), 'MALFORMED'],
  ['hostile : indicateur hors 0/1', field(base({ f: { nom: { d: 1, e: 2, a: 0 } } })), 'MALFORMED'],
  ['hostile : webdriver en chaîne', field(base({ env: { pt: 'mouse', wd: 'false' } })), 'MALFORMED'],
  ['hostile : fuseau hors limites', field(base({ tz: 5000 })), 'MALFORMED'],
  ['hostile : imbrication profonde', field(base({ c: { ...base().c, ptr: JSON.parse('['.repeat(40) + ']'.repeat(40)) } })), 'MALFORMED'],
  ['hostile : 21 champs', field(base({ f: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`c${i}`, { d: 1, e: 1, a: 0 }])) })), 'MALFORMED'],
  ['hostile : champ « constructor » attendu mais absent', field(base()), 'CHALLENGE_REQUIRED', undefined, ['nom', 'message', 'constructor']],
  ['hostile : champ « __proto__ » déclaré', JSON.stringify((() => { const d = JSON.stringify(base()).replace('"f":{', '"f":{"__proto__":{"d":1,"e":1,"a":0},'); return { d, s: sign(d) }; })()), 'OK'],
  ['hostile : texte accentué (signature UTF-8)', field(base({ env: { pt: 'stylo-é-漢', wd: false } })), 'OK'],
  ['hostile : horloge en 2100', field(base({ t0: 4_102_444_800_000, t1: 4_102_444_820_000 })), 'CHALLENGE_REQUIRED'],
  ['hostile : heure d’envoi antérieure à la réception', field(base({ t1: issuedAt + 100 })), 'CHALLENGE_REQUIRED'],
  ['hostile : curseur de 201 points', field(base({ ch: { m: 'slide', pt: 'mouse', p: Array.from({ length: 201 }, (_, i) => [i * 5, Math.min(1000, i * 5)]) } })), 'MALFORMED'],
  ['hostile : curseur hors course', field(base({ ch: { m: 'slide', pt: 'mouse', p: [...humanSlide.slice(0, 9), [470, 1001]] } })), 'MALFORMED'],
  ['hostile : curseur à reculons dans le temps', field(base({ ch: { m: 'slide', pt: 'mouse', p: humanSlide.map(([t, x], i) => [i === 5 ? 10 : t, x]) } })), 'CHALLENGE_FAILED'],
  ['hostile : curseur téléporté (deux points)', field(base({ ch: { m: 'slide', pt: 'mouse', p: [[0, 0], [24, 1000]] } })), 'CHALLENGE_FAILED'],
  ['hostile : défi de type inconnu', field(base({ ch: { m: 'audio' } })), 'MALFORMED'],
  ['hostile : clavier, deux tours au lieu de trois', field(base({ el: 25_000, ft: 26_000, t1: issuedAt + 25_300, ch: { ...keys([420, 610, 380]), r: keys([420, 610, 380]).r.slice(0, 2) } })), 'CHALLENGE_FAILED', issuedAt + 26_000],
  ['hostile : clavier, défi plus long que le temps écoulé', field(base({ ch: keys([5000, 5000, 5000]) })), 'CHALLENGE_FAILED'],
  // Limite assumée : un trajet linéaire auquel on ajoute du bruit passe. onlcBotFilter vise les robots naïfs.
  ['limite connue : trajet linéaire bruité', field(base({ ch: { m: 'slide', pt: 'mouse', p: linearSlide.map(([t, x], i) => [t, Math.min(1000, x + (i % 3) * 37)]) } })), 'OK'],
];

const out = { record, id, cases: [] };
for (const [name, value, expect, at, filled] of cases) {
  const now = at ?? issuedAt + 20_500;
  const store = new MemoryKeyStore(() => now);
  store.save(id, record, 7200);
  const r = await verify(value, { action: 'contact', store, now, filled });
  if (r.code !== expect) throw new Error(`${name} : ${r.code} au lieu de ${expect} (${r.reasons.join(', ')})`);
  out.cases.push({ name, value, now, expect, ...(filled ? { filled } : {}) });
}
// Rejeu : la même preuve, présentée une seconde fois.
out.replay = { value: field(base()), now: issuedAt + 20_500, first: 'OK', second: 'REPLAYED' };
writeFileSync(new URL('../tests/vectors.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.cases.length} vecteurs écrits`);
