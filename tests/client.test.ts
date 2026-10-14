import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attach } from '../src/client';
import { issueKey, MemoryKeyStore, verify } from '../src/server';

let store: MemoryKeyStore;
let clock = 0;

function form(): HTMLFormElement {
  document.body.innerHTML = '<form><label>Nom <input name="nom"></label><button type="submit">Envoyer</button></form>';
  return document.querySelector('form')!;
}

function interact(f: HTMLFormElement) {
  const input = f.querySelector('input')!;
  input.focus();
  for (const k of 'Marie') {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    input.value += k;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: k }));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(1_800_000_000_000);
  store = new MemoryKeyStore(() => Date.now());
  clock = 0;
  // jsdom n'a pas de <dialog> modal complet.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const fetchKey = (action: string) => issueKey(store, action, { now: Date.now() });

describe('onlcBotFilter côté navigateur', () => {
  it('remplit le champ d’un JSON signé, sans aucun contenu saisi, accepté par le serveur', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    interact(f);
    vi.advanceTimersByTime(8000);
    const value = await c.seal();
    expect(f.querySelector<HTMLInputElement>('input[name=onlc-bot-filter]')!.value).toBe(value);
    expect(value).not.toContain('Marie');
    const d = JSON.parse(JSON.parse(value).d);
    expect(d.c).toMatchObject({ key: 5, inp: 5, foc: 1 });
    expect(d.f.nom).toMatchObject({ e: 1, a: 0 });
    expect(d.ft).toBeGreaterThanOrEqual(d.el);
    expect(d.ch).toBeUndefined();
    expect((await verify(value, { action: 'contact', store, now: Date.now(), filled: ['nom'] })).code).toBe('OK');
    // Une seconde preuve sans `reset()` est refusée côté client.
    await expect(c.seal()).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });

  it('formulaire classique : l’envoi part une seule fois, avec la preuve', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, allowUntrusted: true });
    await c.ready;
    interact(f);
    vi.advanceTimersByTime(8000);
    const sent: string[] = [];
    f.addEventListener('submit', (e) => { e.preventDefault(); sent.push(new FormData(f).get('onlc-bot-filter') as string); });
    const button = f.querySelector('button')!;
    button.click();
    button.click();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    button.click();
    vi.advanceTimersByTime(10);
    expect(sent).toHaveLength(1);
    expect(button.disabled).toBe(true);
    expect((await verify(sent[0], { action: 'contact', store, now: Date.now() })).code).toBe('OK');
  });

  it('trop vite : défi au clavier (3 appuis, consignes en texte), accepté par le serveur', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', lang: 'fr', allowUntrusted: true });
    await c.ready;
    const pending = c.seal();
    await vi.waitFor(() => expect(document.querySelector('dialog.obf')).not.toBeNull());
    const dialog = document.querySelector('dialog.obf')!;
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Utiliser le clavier')!.click();
    const zone = dialog.querySelector<HTMLElement>('.obf-zone')!;
    const live = dialog.querySelector('.obf-live')!;
    const letter = /touche (\w)/.exec(live.textContent!)![1]!;
    expect(live.textContent).toBe(`Appuyez et maintenez la touche ${letter} de votre clavier.`);
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe('Ceci est une protection contre les robots malveillants.');
    const key = (type: string) => zone.dispatchEvent(new KeyboardEvent(type, { key: letter.toLowerCase(), bubbles: true }));
    // Relâché trop tôt : refusé, on recommence.
    key('keydown'); vi.advanceTimersByTime(500); key('keyup');
    expect(live.textContent).toContain('Trop tôt');
    for (let i = 0; i < 3; i++) {
      key('keydown');
      // Pendant l'appui : « Maintenez » et compte à rebours affichés, rien d'annoncé.
      vi.advanceTimersByTime(1000);
      const holding = dialog.querySelector<HTMLElement>('.obf-live[aria-hidden=true]')!;
      expect(holding.hidden).toBe(false);
      expect(holding.textContent).toBe(`Maintenez la touche ${letter}…`);
      expect(live.classList.contains('obf-sr')).toBe(true);
      expect(dialog.querySelector('.obf-count')!.textContent).toMatch(/^Encore \d,\d s$/);
      expect(dialog.querySelector('.obf-key')!.classList.contains('obf-down')).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(live.textContent).toBe(`Relâchez la touche ${letter}.`);
      vi.advanceTimersByTime(450 + i * 70);
      key('keyup');
    }
    vi.advanceTimersByTime(700);
    const value = await pending;
    const d = JSON.parse(JSON.parse(value).d);
    expect(d.ch).toMatchObject({ m: 'keys', f: 1, au: false });
    expect(document.querySelector('dialog.obf')).toBeNull();
    expect((await verify(value, { action: 'contact', store, now: Date.now() })).code).toBe('OK');
  });

  it('le curseur ne se déplace pas au clavier : bascule vers le mode clavier', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', lang: 'en', allowUntrusted: true });
    await c.ready;
    void c.seal().catch(() => undefined);
    await vi.waitFor(() => expect(document.querySelector('dialog.obf')).not.toBeNull());
    const thumb = document.querySelector<HTMLElement>('.obf-thumb')!;
    expect(thumb.getAttribute('role')).toBe('slider');
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(thumb.getAttribute('aria-valuenow')).toBe('0');
    expect(document.querySelector<HTMLElement>('.obf-zone')!.closest('div[hidden]')).toBeNull();
    expect(document.querySelector('.obf-live')!.textContent).toMatch(/^Press and hold the [A-Z] key on your keyboard\.$/);
  });

  it('annuler le défi libère l’envoi', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    const pending = c.seal();
    await vi.waitFor(() => expect(document.querySelector('dialog.obf')).not.toBeNull());
    document.querySelector<HTMLDialogElement>('dialog.obf')!.dispatchEvent(new Event('cancel'));
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    interact(f);
    vi.advanceTimersByTime(5000);
    await expect(c.seal()).resolves.toContain('"d"');
  });

  it('champ rempli sans focus : déclaré rempli automatiquement', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    f.querySelector('input')!.value = 'Marie Durand';
    f.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
    f.querySelector('button')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    f.querySelector('button')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(6000);
    const d = JSON.parse(JSON.parse(await c.seal()).d);
    expect(d.f.nom).toEqual({ d: 0, e: 1, a: 1 });
    expect(d.ch).toBeUndefined();
  });

  it('formulaire restauré par le navigateur (retour arrière) : rempli sans frappe, accepté', async () => {
    const f = form();
    // La restauration a lieu avant l'exécution du script : valeur posée, valeur par défaut vide.
    f.querySelector('input')!.value = 'Marie Durand';
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    // Parcours au clavier : tabulation sur le champ, puis Entrée.
    const input = f.querySelector('input')!;
    input.focus();
    for (const key of ['Tab', 'Tab', 'Enter']) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await vi.advanceTimersByTimeAsync(4000);
    const value = await c.seal();
    const d = JSON.parse(JSON.parse(value).d);
    expect(d.f.nom).toMatchObject({ e: 1, a: 1 });
    expect(d.ch).toBeUndefined();
    expect((await verify(value, { action: 'contact', store, now: Date.now(), filled: ['nom'] })).code).toBe('OK');
  });

  it('retour arrière servi depuis le cache de pages : envoi de nouveau permis', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    interact(f);
    await vi.advanceTimersByTimeAsync(5000);
    await c.seal();
    await expect(c.seal()).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await vi.advanceTimersByTimeAsync(5000);
    await expect(c.seal()).resolves.toContain('"d"');
  });

  it('événements fabriqués par un script : ignorés, le défi est exigé', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual' });
    await c.ready;
    interact(f);
    vi.advanceTimersByTime(8000);
    void c.seal().catch(() => undefined);
    await vi.waitFor(() => expect(document.querySelector('dialog.obf')).not.toBeNull());
  });

  it('reset() : nouvelle clé (déjà préparée), nouvel envoi possible', async () => {
    const f = form();
    const c = attach(f, { action: 'contact', fetchKey, mode: 'manual', allowUntrusted: true });
    await c.ready;
    interact(f);
    vi.advanceTimersByTime(5000);
    const first = await c.seal();
    await vi.advanceTimersByTimeAsync(5000);
    c.reset();
    const second = await c.seal();
    expect(JSON.parse(JSON.parse(second).d).id).not.toBe(JSON.parse(JSON.parse(first).d).id);
    expect((await verify(second, { action: 'contact', store, now: Date.now() })).code).toBe('OK');
  });
});
