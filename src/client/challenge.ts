/**
 * Défi de repli, proposé quand le temps passé ou les interactions sont trop faibles :
 * - curseur à faire glisser (souris, doigt, stylet) : trajet, appui, glisser, arrêt et durée relevés ;
 * - mode clavier pour qui n'utilise ni souris, ni écran tactile, ni pavé : trois fois, maintenir la
 *   touche demandée puis la relâcher à la consigne (durées de 2 à 4 s imposées par le serveur) ;
 * - consignes en texte dans une région annoncée (lecteur d'écran, plage braille) et, à la demande,
 *   lues à voix haute.
 */
import type { Challenge } from '../shared/protocol';
import { fill, type Messages } from './messages';

export interface ChallengeSpec { letter: string; holds: number[] }

/** Feuille de style du défi (aussi publiée en `dist/onlc-bot-filter.css` pour une politique CSP stricte). */
export const CSS = `
.obf{box-sizing:border-box;width:100%;margin:auto;--obf-bg:#fff;--obf-fg:#1d2421;--obf-muted:#55605a;--obf-accent:#2f6b3c;--obf-track:#e3e8e4;--obf-glow:rgba(47,107,60,.35);border:0;border-radius:12px;padding:20px;max-width:min(420px,calc(100vw - 32px));background:var(--obf-bg);color:var(--obf-fg);font:inherit;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.obf::backdrop{background:rgba(0,0,0,.45)}
.obf h2{margin:0 0 8px;font-size:1.15em}
.obf p{margin:0 0 12px;line-height:1.45}
.obf-track{position:relative;height:48px;border-radius:24px;background:var(--obf-track);margin:8px 0 12px;touch-action:none;user-select:none;-webkit-user-select:none}
.obf-fill{position:absolute;inset:0 auto 0 0;border-radius:24px;background:var(--obf-accent);opacity:.25;width:48px}
.obf-thumb{position:absolute;top:0;left:0;width:48px;height:48px;border-radius:50%;background:var(--obf-accent);color:#fff;display:grid;place-items:center;cursor:grab;font-size:22px;line-height:1}
.obf-thumb:focus-visible,.obf-zone:focus-visible,.obf button:focus-visible{outline:3px solid var(--obf-accent);outline-offset:3px}
.obf-back{transition:left .25s ease,width .25s ease}
.obf-zone{border:2px dashed var(--obf-accent);border-radius:10px;padding:16px 14px;margin:0 0 12px;text-align:center}
.obf-zone:focus{border-style:solid}
.obf-live{font-weight:700;font-size:1.1em;min-height:1.45em;margin:0 0 6px}
.obf-key{--obf-edge:#9aa59e;width:68px;height:68px;margin:6px auto 18px;border-radius:12px;border:2px solid var(--obf-edge);background:var(--obf-bg);color:var(--obf-fg);box-shadow:0 7px 0 var(--obf-edge);display:grid;place-items:center;font:700 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace;transition:transform .08s,box-shadow .08s,background .15s}
.obf-key.obf-demo{animation:obf-press 2.2s ease-in-out infinite}
.obf-key.obf-down{transform:translateY(6px);box-shadow:0 1px 0 var(--obf-edge);background:var(--obf-accent);color:var(--obf-bg);border-color:var(--obf-accent)}
.obf-key.obf-go{box-shadow:0 1px 0 var(--obf-edge),0 0 0 5px var(--obf-glow)}
@keyframes obf-press{0%,60%,100%{transform:none;box-shadow:0 7px 0 var(--obf-edge)}15%,45%{transform:translateY(6px);box-shadow:0 1px 0 var(--obf-edge)}}
.obf-bar{height:8px;border-radius:4px;background:var(--obf-track);overflow:hidden;margin:4px 0 6px}
.obf-bar>i{display:block;height:100%;width:0;background:var(--obf-accent)}
.obf-count{font-variant-numeric:tabular-nums;color:var(--obf-muted);min-height:1.45em;margin:0}
.obf-dots{display:flex;gap:6px;justify-content:center;margin:8px 0 0}
.obf-dots>i{width:10px;height:10px;border-radius:50%;border:2px solid var(--obf-accent)}
.obf-dots>i.obf-on{background:var(--obf-accent)}
.obf-off{color:#a5361f;font-weight:600}
.obf-off:empty{display:none}
.obf-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.obf-msg{color:var(--obf-muted);min-height:1.45em}
.obf-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center}
.obf button{font:inherit;min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--obf-accent);background:transparent;color:var(--obf-accent);cursor:pointer}
.obf label{display:flex;gap:10px;align-items:center;justify-content:flex-start;min-height:44px;font-weight:400;margin:0}
.obf input[type=checkbox]{flex:none;width:1.25em;height:1.25em;margin:0;padding:0;accent-color:var(--obf-accent)}
.obf *{box-sizing:border-box}
@media (prefers-color-scheme:dark){.obf{--obf-bg:#1c211e;--obf-fg:#eef2ef;--obf-muted:#b4beb7;--obf-accent:#7cc48b;--obf-track:#2e3631;--obf-glow:rgba(124,196,139,.35)}.obf-thumb{color:#10261a}.obf-key{--obf-edge:#5d6862}.obf-off{color:#f0a08a}}
@media (prefers-reduced-motion:reduce){.obf-back,.obf-key{transition:none}.obf-key.obf-demo{animation:none}}
`;

function injectStyle() {
  if (document.getElementById('obf-style')) return;
  const s = document.createElement('style');
  s.id = 'obf-style';
  s.textContent = CSS;
  document.head.append(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

let seq = 0;

/**
 * `allowUntrusted` : accepter les événements fabriqués par un script (tests uniquement).
 * `injectStyle: false` : la page charge elle-même `dist/onlc-bot-filter.css` (CSP sans `style-src 'unsafe-inline'`).
 */
export function runChallenge(spec: ChallengeSpec, m: Messages, lang: string, opts: { allowUntrusted?: boolean; injectStyle?: boolean } = {}): Promise<Challenge> {
  const allowUntrusted = opts.allowUntrusted === true;
  if (opts.injectStyle !== false) injectStyle();
  const id = `obf-${++seq}`;
  const now = () => performance.now();
  const previous = document.activeElement as HTMLElement | null;

  // Curseur
  const hint = el('p', { id: `${id}-h`, class: 'obf-msg' });
  const fillBar = el('div', { class: 'obf-fill' });
  const thumb = el('div', { class: 'obf-thumb', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': m.sliderLabel, 'aria-describedby': `${id}-s ${id}-h` }, '→');
  const track = el('div', { class: 'obf-track' }, fillBar, thumb);
  const toKeys = el('button', { type: 'button' }, m.useKeyboard);
  const slidePane = el('div', {}, el('p', { id: `${id}-s` }, m.slide), track, hint, toKeys);

  // Clavier
  // Consigne annoncée (lecteur d'écran, plage braille, voix) ; l'état « maintenez » et le compte à
  // rebours sont seulement visuels, pour ne pas couper la parole à chaque dixième de seconde.
  const live = el('p', { class: 'obf-live', id: `${id}-l`, 'aria-live': 'assertive', 'aria-atomic': 'true' });
  const holding = el('p', { class: 'obf-live', 'aria-hidden': 'true', hidden: '' });
  const key = el('div', { class: 'obf-key obf-demo', 'aria-hidden': 'true' }, spec.letter);
  const barFill = el('i');
  const bar = el('div', { class: 'obf-bar', 'aria-hidden': 'true', hidden: '' }, barFill);
  const count = el('p', { class: 'obf-count', 'aria-hidden': 'true' });
  const dots = el('div', { class: 'obf-dots', 'aria-hidden': 'true' }, ...spec.holds.map(() => el('i')));
  const stepText = el('p', { class: 'obf-sr' });
  const offZone = el('p', { class: 'obf-msg obf-off', role: 'alert' });
  const zone = el('div', { class: 'obf-zone', role: 'application', tabindex: '0', 'aria-label': m.zone, 'aria-describedby': `${id}-l` }, key, live, holding, bar, count, dots, stepText);
  const audio = el('input', { type: 'checkbox' });
  const toSlide = el('button', { type: 'button' }, m.useSlider);
  const keysPane = el('div', { hidden: '' }, el('p', {}, m.keyboardIntro), zone, offZone, el('label', {}, audio, m.audio), toSlide);

  const cancel = el('button', { type: 'button' }, m.cancel);
  const dialog = el('dialog', { class: 'obf', 'aria-labelledby': `${id}-t`, 'aria-describedby': `${id}-p`, lang }, el('h2', { id: `${id}-t` }, m.title), el('p', { id: `${id}-p` }, m.protection), slidePane, keysPane, el('div', { class: 'obf-row' }, cancel));
  document.body.append(dialog);

  // Un robot naïf fabrique ses événements par script : ils ne comptent pas.
  const real = (e: Event) => e.isTrusted || allowUntrusted;

  return new Promise<Challenge>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    const speak = (text: string) => {
      const synth = globalThis.speechSynthesis;
      if (!audio.checked || !synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      synth.speak(u);
    };
    const close = () => {
      clearTimeout(timer);
      clearInterval(tick);
      globalThis.speechSynthesis?.cancel();
      if (dialog.open) dialog.close();
      dialog.remove();
      previous?.focus?.();
    };
    const finish = (c: Challenge) => { close(); resolve(c); };
    const abort = () => { close(); reject(Object.assign(new Error('onlcBotFilter: défi annulé'), { code: 'CANCELLED' })); };
    cancel.addEventListener('click', abort);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); abort(); });

    // —— Curseur ——
    let dragging = false;
    let grab = 0;
    let start = 0;
    let last = -Infinity;
    let pos = 0;
    let pointerType: string | null = null;
    let points: Array<[number, number]> = [];
    const place = (x: number, animate = false) => {
      pos = Math.min(1, Math.max(0, x));
      const span = track.clientWidth - thumb.offsetWidth;
      thumb.classList.toggle('obf-back', animate);
      fillBar.classList.toggle('obf-back', animate);
      thumb.style.left = `${pos * span}px`;
      fillBar.style.width = `${pos * span + thumb.offsetWidth}px`;
      thumb.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
    };
    const at = (clientX: number) => {
      const span = track.clientWidth - thumb.offsetWidth;
      return span > 0 ? (clientX - grab - track.getBoundingClientRect().left) / span : 0;
    };
    const sample = (force = false) => {
      const t = now() - start;
      if (!force && t - last < 16) return;
      last = t;
      points.push([Math.round(t), Math.round(pos * 1000)]);
      if (points.length >= 200) points = points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
    };
    thumb.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !real(e)) return;
      e.preventDefault();
      thumb.setPointerCapture?.(e.pointerId);
      dragging = true;
      pointerType = e.pointerType || null;
      grab = e.clientX - thumb.getBoundingClientRect().left;
      start = now();
      last = -Infinity;
      points = [];
      place(0);
      sample(true);
      hint.textContent = '';
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!dragging || !real(e)) return;
      place(at(e.clientX));
      sample();
    });
    const release = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      // Position au relâchement : un geste brusque n'a parfois produit aucun mouvement intermédiaire.
      if (e.type === 'pointerup' && real(e)) place(at(e.clientX));
      sample(true);
      // Arrivé au bout trop vite (geste brusque) : le serveur le refuserait ; on fait recommencer.
      const atEnd = pos >= 0.95;
      const tooFast = points.length < 6 || points[points.length - 1]![0] < 400;
      if (atEnd && !tooFast) return finish({ m: 'slide', pt: pointerType, p: points });
      hint.textContent = atEnd ? m.sliderSlow : m.sliderRetry;
      place(0, true);
    };
    thumb.addEventListener('pointerup', release);
    thumb.addEventListener('pointercancel', release);
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Escape') return;
      // Le curseur ne se déplace pas au clavier (trop facile à automatiser) : on passe au mode clavier.
      e.preventDefault();
      hint.textContent = m.sliderKeyboard;
      showKeys();
    });

    // —— Clavier ——
    const total = spec.holds.length;
    const results: Array<{ t: number; h: number }> = [];
    let phase: 'press' | 'hold' | 'release' | 'done' = 'press';
    let pressedAt = 0;
    let early = 0;
    let spokeIntro = false;
    const seconds = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const isLetter = (e: KeyboardEvent) => e.key.toUpperCase() === spec.letter || e.code === `Key${spec.letter}`;
    // À l'écran, la consigne seule ; à voix haute, précédée de la phrase de protection au premier tour.
    const say = (text: string, spoken = text) => { live.textContent = text; speak(spoken); };
    const show = (state: 'press' | 'hold' | 'release' | 'done') => {
      key.classList.toggle('obf-demo', state === 'press');
      key.classList.toggle('obf-down', state === 'hold' || state === 'release');
      key.classList.toggle('obf-go', state === 'release');
      // Pendant l'appui, la consigne annoncée reste en place (masquée) : rien n'est lu.
      live.classList.toggle('obf-sr', state === 'hold');
      holding.hidden = state !== 'hold';
      bar.hidden = state !== 'hold';
      if (state !== 'hold') { clearInterval(tick); count.textContent = ''; barFill.style.width = '0'; }
      [...dots.children].forEach((d, i) => d.classList.toggle('obf-on', i < results.length));
    };
    const prompt = () => {
      phase = 'press';
      show('press');
      stepText.textContent = fill(m.step, { n: results.length + 1, total });
      const press = fill(m.press, { k: spec.letter });
      say(press, spokeIntro ? press : `${m.protection} ${press}`);
      spokeIntro = true;
    };
    const showKeys = () => {
      slidePane.hidden = true;
      keysPane.hidden = false;
      zone.focus();
      if (!results.length && phase === 'press') prompt();
    };
    toKeys.addEventListener('click', showKeys);
    toSlide.addEventListener('click', () => { keysPane.hidden = true; slidePane.hidden = false; thumb.focus(); });
    audio.addEventListener('change', () => { if (audio.checked) { spokeIntro = false; prompt(); zone.focus(); } });
    const tooEarly = () => {
      clearTimeout(timer);
      early++;
      phase = 'press';
      show('press');
      say(fill(m.early, { k: spec.letter }));
    };
    zone.addEventListener('keydown', (e) => {
      if (!isLetter(e) || !real(e)) return;
      e.preventDefault();
      if (e.repeat || phase !== 'press') return;
      phase = 'hold';
      pressedAt = now();
      const target = spec.holds[results.length]!;
      holding.textContent = fill(m.holding, { k: spec.letter });
      show('hold');
      const update = () => {
        const left = Math.max(0, target - (now() - pressedAt));
        count.textContent = fill(m.seconds, { s: seconds.format(left / 1000) });
        barFill.style.width = `${Math.min(100, ((target - left) / target) * 100)}%`;
      };
      update();
      tick = setInterval(update, 100);
      timer = setTimeout(() => { phase = 'release'; show('release'); say(fill(m.release, { k: spec.letter })); }, target);
    });
    zone.addEventListener('keyup', (e) => {
      if (!isLetter(e) || !real(e)) return;
      e.preventDefault();
      if (phase === 'hold') return tooEarly();
      if (phase !== 'release') return;
      results.push({ t: spec.holds[results.length]!, h: Math.round(now() - pressedAt) });
      if (results.length < total) return prompt();
      phase = 'done';
      show('done');
      say(m.done);
      setTimeout(() => finish({ m: 'keys', r: results, f: early, au: audio.checked }), 600);
    });
    zone.addEventListener('focus', () => { offZone.textContent = ''; });
    zone.addEventListener('blur', () => {
      if (phase === 'hold') tooEarly();
      // Les touches ne comptent que dans la zone : le dire si on en sort avant la fin.
      if (phase !== 'done' && !keysPane.hidden) offZone.textContent = m.offZone;
    });

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    thumb.focus();
  });
}
