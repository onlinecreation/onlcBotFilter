/**
 * onlcBotFilter, côté navigateur.
 *
 * À l'association avec un formulaire : ajout du champ caché, demande d'une clé unique au serveur,
 * décompte des interactions avec le formulaire (appuis, touchers, frappes, mouvements, saisies,
 * focus, collages, défilements — des nombres, jamais le contenu, les touches ni les positions).
 * Juste avant l'envoi : le champ reçoit un JSON (décompte, heures, identifiant de la clé) signé avec
 * la clé unique (HMAC-SHA256). Trop peu d'interactions ou de temps : défi de repli (curseur ou
 * clavier). Un second envoi est bloqué tant que `reset()` n'a pas été appelé.
 *
 * Deux usages : `mode: 'form'` (défaut) intercepte l'envoi d'un formulaire classique ;
 * `mode: 'manual'` laisse l'application appeler `seal()` puis transmettre la valeur (en-tête, champ).
 */
import { hmacSha256 } from '../shared/hmac';
import { FIELD_NAME, interactionCount, MAX_FIELDS, type Counts, type FieldInfo, type KeyResponse, type Payload } from '../shared/protocol';
import { runChallenge } from './challenge';
import { BotFilterError } from './errors';
import { messagesFor, type Messages } from './messages';

export type { KeyResponse, Messages };

export interface Options {
  /** Action protégée (`contact`, `login`…), liée à la clé par le serveur. */
  action: string;
  /** Adresse qui délivre les clés (`GET …?action=`), ou fonction qui s'en charge. */
  endpoint?: string;
  fetchKey?: (action: string) => Promise<KeyResponse>;
  /** Nom du champ ajouté au formulaire. */
  fieldName?: string;
  mode?: 'form' | 'manual';
  /** Langue du défi (`fr`, `en`, `es`, `nl`, `de`) ; par défaut celle de la page. */
  lang?: string;
  messages?: Partial<Messages>;
  /** Mode formulaire : erreur avant l'envoi (clé indisponible). Par défaut, message dans le formulaire. */
  onError?: (error: BotFilterError) => void;
  /** `false` : ne pas injecter la feuille de style du défi ; charger `dist/onlc-bot-filter.css` (CSP stricte). */
  injectStyle?: boolean;
  /** Défi imposé dès le premier envoi (formulaire réaffiché après `CHALLENGE_REQUIRED`). */
  forceChallenge?: boolean;
  /** Compter aussi les événements fabriqués par un script (`isTrusted: false`). Réservé aux tests. */
  allowUntrusted?: boolean;
}

export { BotFilterError };

interface HeldKey extends KeyResponse { receivedAt: number; receivedWall: number }

const MOVE_CAP = 100_000;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const IGNORED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

export class BotFilter {
  readonly field: HTMLInputElement;
  private readonly counts: Counts = { ptr: 0, mv: 0, tch: 0, key: 0, inp: 0, foc: 0, pst: 0, scr: 0 };
  private pointerType: string | null = null;
  private readonly attachedAt = performance.now();
  /** Par champ : temps de focus, focus reçu, saisies au clavier (ou dictée, plage braille). */
  private readonly timing = new Map<string, { d: number; since: number | null; focused: boolean; typed: number }>();
  private current: Promise<HeldKey>;
  private next: Promise<HeldKey> | null = null;
  private refresh: ReturnType<typeof setTimeout> | undefined;
  private locked = false;
  private passing = false;
  private sent = false;
  private detached = false;
  private readonly off: Array<() => void> = [];
  private readonly m: Messages;
  private readonly lang: string;

  constructor(readonly form: HTMLFormElement, private readonly opts: Options) {
    ({ m: this.m, lang: this.lang } = messagesFor(opts.lang, opts.messages));
    const name = opts.fieldName ?? 'onlc-bot-filter';
    this.field = (form.querySelector(`input[type=hidden][name="${name}"]`) as HTMLInputElement | null)
      ?? Object.assign(document.createElement('input'), { type: 'hidden', name });
    if (!this.field.isConnected) form.append(this.field);
    this.listen();
    this.current = this.fetchKey();
    this.current.catch(() => undefined);
  }

  /** Clé reçue (ou erreur de récupération). */
  get ready(): Promise<void> {
    return this.current.then(() => undefined);
  }

  private on<K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, capture = true) {
    const h = ((e: Event) => { if (e.isTrusted || this.opts.allowUntrusted || type === 'submit') fn(e as HTMLElementEventMap[K]); }) as EventListener;
    const o = { capture, passive: type !== 'submit' };
    target.addEventListener(type, h, o);
    this.off.push(() => target.removeEventListener(type, h, o));
  }

  private listen() {
    const c = this.counts;
    this.on(this.form, 'pointerdown', (e) => { c.ptr++; this.pointerType = e.pointerType || this.pointerType; });
    this.on(this.form, 'pointermove', () => { if (c.mv < MOVE_CAP) c.mv++; });
    this.on(this.form, 'touchstart', () => { c.tch++; });
    this.on(this.form, 'keydown', () => { c.key++; });
    this.on(this.form, 'input', (e) => {
      c.inp++;
      // Frappe, dictée, plage braille : un `InputEvent` typé. Le remplissage automatique envoie un
      // simple `Event` ou `insertReplacementText` ; la restauration d'un formulaire, rien du tout.
      const type = (e as InputEvent).inputType;
      const name = this.controlName(e.target);
      if (!name || !type || type === 'insertReplacementText') return;
      this.clock(name).typed++;
    });
    this.on(this.form, 'focusin', (e) => {
      c.foc++;
      const name = this.controlName(e.target);
      if (!name) return;
      const t = this.clock(name);
      t.focused = true;
      t.since = performance.now();
    });
    this.on(this.form, 'focusout', (e) => { const name = this.controlName(e.target); if (name) this.settle(name); });
    this.on(this.form, 'paste', () => { c.pst++; });
    this.on(window, 'wheel', () => { c.scr++; });
    this.on(window, 'scroll', () => { c.scr++; });
    if ((this.opts.mode ?? 'form') === 'form') this.on(this.form, 'submit', (e) => this.onSubmit(e as SubmitEvent));
    // Retour arrière servi depuis le cache de pages : la page revit telle qu'à l'envoi (verrouillée,
    // clé consommée). Nouvelle clé, envoi de nouveau permis.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted && !this.detached) this.reset(); };
    window.addEventListener('pageshow', onShow);
    this.off.push(() => window.removeEventListener('pageshow', onShow));
  }

  private clock(name: string) {
    let t = this.timing.get(name);
    if (!t) this.timing.set(name, (t = { d: 0, since: null, focused: false, typed: 0 }));
    return t;
  }

  private controlName(t: EventTarget | null): string | null {
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return null;
    if (t === this.field || (t instanceof HTMLInputElement && IGNORED_TYPES.has(t.type))) return null;
    return t.name && FIELD_NAME.test(t.name) ? t.name : null;
  }

  /**
   * Valeur de chaque champ nommé, actuelle ou par défaut (celle du HTML : la restauration d'un
   * formulaire par le navigateur, au retour arrière, ne la change pas). Groupes de cases et de
   * boutons radio réunis. Jamais envoyée.
   */
  private values(byDefault = false): Map<string, string> {
    const out = new Map<string, string>();
    for (const el of Array.from(this.form.elements) as Control[]) {
      const name = this.controlName(el);
      if (!name) continue;
      let v: string;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) v = (byDefault ? el.defaultChecked : el.checked) ? el.value : '';
      else if (el instanceof HTMLSelectElement) {
        const options = Array.from(el.options);
        const chosen = byDefault ? options.filter((o) => o.defaultSelected) : Array.from(el.selectedOptions);
        v = (chosen.length || el.multiple ? chosen : options.slice(0, 1)).map((o) => o.value).join('\u0000');
      } else v = byDefault ? el.defaultValue : el.value;
      out.set(name, out.has(name) ? `${out.get(name)}\u0001${v}` : v);
    }
    return out;
  }

  /** Arrête le chronomètre d'un champ et cumule ; appelé à la perte du focus comme à l'envoi. */
  private settle(name: string) {
    const t = this.timing.get(name);
    if (t?.since == null) return;
    t.d += performance.now() - t.since;
    t.since = null;
  }

  private fieldReport(): Record<string, FieldInfo> {
    const active = this.controlName(document.activeElement);
    if (active) { this.settle(active); const t = this.timing.get(active); if (t) t.since = performance.now(); }
    const f: Record<string, FieldInfo> = {};
    const defaults = this.values(true);
    for (const [name, value] of this.values()) {
      if (Object.keys(f).length >= MAX_FIELDS) break;
      const t = this.timing.get(name);
      const edited = value !== (defaults.get(name) ?? '');
      const d = Math.round(t?.d ?? 0);
      if (!edited && d < 1) continue;
      // Rempli sans aucune frappe : remplissage automatique, gestionnaire de mots de passe,
      // formulaire restauré par le navigateur ou prérempli par la page.
      f[name] = { d, e: edited ? 1 : 0, a: edited && !t?.typed ? 1 : 0 };
    }
    return f;
  }

  private async fetchKey(): Promise<HeldKey> {
    const { action, endpoint, fetchKey } = this.opts;
    let k: KeyResponse;
    try {
      if (fetchKey) k = await fetchKey(action);
      else if (endpoint) {
        const r = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}action=${encodeURIComponent(action)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        k = (await r.json()) as KeyResponse;
      } else throw new Error('endpoint ou fetchKey requis');
      if (k?.v !== 2 || typeof k.id !== 'string' || typeof k.key !== 'string' || !Array.isArray(k.holds)) throw new Error('réponse inattendue');
    } catch (e) {
      throw new BotFilterError('KEY_UNAVAILABLE', `onlcBotFilter : clé indisponible (${(e as Error).message})`);
    }
    const held: HeldKey = { ...k, receivedAt: performance.now(), receivedWall: Date.now() };
    clearTimeout(this.refresh);
    // Une clé trop ancienne serait refusée : la remplacer avant son expiration si rien n'est parti.
    this.refresh = setTimeout(() => { if (!this.locked && !this.detached) { this.current = this.fetchKey(); this.current.catch(() => undefined); } }, Math.max(60, k.expiresIn * 0.9) * 1000);
    return held;
  }

  /**
   * Compose la preuve (avec défi si nécessaire), la place dans le champ et la renvoie. Verrouille
   * l'envoi : un second appel échoue jusqu'à `reset()`. `force` impose le défi (réponse
   * `CHALLENGE_REQUIRED` du serveur).
   */
  async seal(options: { force?: boolean } = {}): Promise<string> {
    if (this.detached) throw new BotFilterError('DETACHED', 'onlcBotFilter : formulaire détaché');
    if (this.locked) throw new BotFilterError('ALREADY_SUBMITTED', 'onlcBotFilter : envoi déjà en cours');
    this.locked = true;
    try {
      const k = await this.current;
      const elapsed = performance.now() - k.receivedAt;
      const wd = typeof navigator !== 'undefined' && navigator.webdriver === true;
      const f = this.fieldReport();
      const minField = k.minFieldMs ?? 1000;
      const typedTooFast = Object.values(f).some((x) => x.e === 1 && x.a === 0 && x.d < minField);
      const needsChallenge = options.force || this.opts.forceChallenge || wd || typedTooFast
        || elapsed < k.minSeconds * 1000 || interactionCount(this.counts) < k.minInteractions;
      const ch = needsChallenge ? await runChallenge({ letter: k.letter, holds: k.holds }, this.m, this.lang, { allowUntrusted: this.opts.allowUntrusted, injectStyle: this.opts.injectStyle }) : undefined;
      const payload: Payload = {
        v: 2, id: k.id, a: this.opts.action,
        t0: k.receivedWall, t1: Date.now(), el: Math.round(performance.now() - k.receivedAt), ft: Math.round(performance.now() - this.attachedAt),
        tz: new Date().getTimezoneOffset(), c: { ...this.counts }, f: ch ? this.fieldReport() : f, env: { pt: this.pointerType, wd },
        ...(ch ? { ch } : {}),
      };
      const d = JSON.stringify(payload);
      const value = JSON.stringify({ d, s: await hmacSha256(k.key, d) });
      this.field.value = value;
      // La clé ne sert qu'une fois : la suivante se prépare déjà (nouvel essai après une erreur).
      this.next = this.fetchKey();
      this.next.catch(() => undefined);
      return value;
    } catch (e) {
      this.locked = false;
      throw e;
    }
  }

  /** Après une réponse du serveur : nouvelle clé, envoi de nouveau permis. */
  reset(): void {
    this.current = this.next ?? this.fetchKey();
    this.current.catch(() => undefined);
    this.next = null;
    this.locked = false;
    this.sent = false;
    this.field.value = '';
    for (const b of this.submitButtons()) { b.disabled = false; b.removeAttribute('aria-disabled'); }
  }

  detach(): void {
    this.detached = true;
    clearTimeout(this.refresh);
    for (const f of this.off.splice(0)) f();
    this.field.remove();
  }

  private submitButtons(): Array<HTMLButtonElement | HTMLInputElement> {
    return [...this.form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([type]), button[type=submit], input[type=submit]')];
  }

  private onSubmit(e: SubmitEvent) {
    if (this.passing) {
      // Envoi accompagné de la preuve : on le laisse partir, puis on bloque les suivants.
      this.passing = false;
      this.sent = true;
      setTimeout(() => { for (const b of this.submitButtons()) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } });
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.sent || this.locked) return;
    const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null;
    this.seal().then(() => {
      this.passing = true;
      // Tâche suivante : Chrome ignore sans bruit un `requestSubmit()` appelé dans la suite d'une
      // promesse WebCrypto née de l'événement d'envoi (constaté le 09/10/2026).
      setTimeout(() => {
        if (typeof this.form.requestSubmit === 'function') this.form.requestSubmit(submitter ?? undefined);
        else { this.passing = false; this.sent = true; this.form.submit(); }
      });
    }, (err: BotFilterError) => {
      if (err.code === 'CANCELLED') return;
      if (this.opts.onError) return this.opts.onError(err);
      let p = this.form.querySelector<HTMLElement>('.obf-error');
      if (!p) { p = Object.assign(document.createElement('p'), { className: 'obf-error' }); p.setAttribute('role', 'alert'); this.form.append(p); }
      p.textContent = this.m.unavailable;
      this.reset();
    });
  }
}

export function attach(form: HTMLFormElement, options: Options): BotFilter {
  return new BotFilter(form, options);
}

/**
 * `<form data-onlc-bot-filter="contact" data-onlc-bot-filter-endpoint="/onlc-bot-filter/key">` : association automatique.
 * `data-onlc-bot-filter-challenge` : défi imposé (formulaire réaffiché après `CHALLENGE_REQUIRED`).
 * `data-onlc-bot-filter-nostyle` : la page charge `onlc-bot-filter.css` elle-même (CSP stricte).
 */
export function autoAttach(root: ParentNode = document): BotFilter[] {
  return [...root.querySelectorAll<HTMLFormElement>('form[data-onlc-bot-filter]')].map((form) => attach(form, {
    action: form.dataset.onlcBotFilter!,
    endpoint: form.dataset.onlcBotFilterEndpoint ?? '/onlc-bot-filter/key',
    lang: form.dataset.onlcBotFilterLang,
    forceChallenge: form.dataset.onlcBotFilterChallenge !== undefined,
    injectStyle: form.dataset.onlcBotFilterNostyle === undefined,
  }));
}
