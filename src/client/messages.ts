/** Textes du défi. `{k}` : touche ; `{n}`, `{total}` : tour. Remplaçables via l'option `messages`. */
export interface Messages {
  title: string;
  protection: string;
  slide: string;
  sliderSlow: string;
  sliderLabel: string;
  sliderRetry: string;
  sliderKeyboard: string;
  useKeyboard: string;
  useSlider: string;
  keyboardIntro: string;
  zone: string;
  step: string;
  press: string;
  holding: string;
  seconds: string;
  release: string;
  offZone: string;
  early: string;
  audio: string;
  done: string;
  cancel: string;
  unavailable: string;
}

const fr: Messages = {
  title: 'Vérification',
  protection: 'Ceci est une protection contre les robots malveillants.',
  slide: 'Faites glisser lentement le curseur jusqu’à droite.',
  sliderSlow: 'Trop vite : faites glisser le curseur plus lentement.',
  sliderLabel: 'Curseur de vérification',
  sliderRetry: 'Pas tout à fait : faites glisser lentement le curseur jusqu’au bout.',
  sliderKeyboard: 'Au clavier, utilisez le mode clavier.',
  useKeyboard: 'Utiliser le clavier',
  useSlider: 'Utiliser le curseur',
  keyboardIntro: 'Trois fois de suite : appuyez sur une touche de votre clavier, gardez-la enfoncée, puis relâchez-la quand on vous le demande.',
  zone: 'Zone de vérification au clavier : placez-vous ici et suivez les consignes.',
  step: 'Étape {n} sur {total}.',
  press: 'Appuyez et maintenez la touche {k} de votre clavier.',
  holding: 'Maintenez la touche {k}…',
  seconds: 'Encore {s} s',
  release: 'Relâchez la touche {k}.',
  offZone: 'Revenez dans la zone de vérification (touche Tab) pour continuer.',
  early: 'Trop tôt : gardez la touche {k} enfoncée jusqu’à ce qu’on vous demande de la relâcher.',
  audio: 'Lire les consignes à voix haute',
  done: 'Merci, vérification terminée.',
  cancel: 'Annuler',
  unavailable: 'Vérification indisponible. Rechargez la page et réessayez.',
};

const en: Messages = {
  title: 'Verification',
  protection: 'This is a protection against malicious robots.',
  slide: 'Slowly drag the slider all the way to the right.',
  sliderSlow: 'Too fast: drag the slider more slowly.',
  sliderLabel: 'Verification slider',
  sliderRetry: 'Not quite: slowly drag the slider all the way.',
  sliderKeyboard: 'With a keyboard, use keyboard mode.',
  useKeyboard: 'Use the keyboard',
  useSlider: 'Use the slider',
  keyboardIntro: 'Three times in a row: press a key on your keyboard, keep it down, then release it when asked.',
  zone: 'Keyboard verification area: place your focus here and follow the instructions.',
  step: 'Step {n} of {total}.',
  press: 'Press and hold the {k} key on your keyboard.',
  holding: 'Keep holding the {k} key…',
  seconds: '{s} s left',
  release: 'Release the {k} key.',
  offZone: 'Go back to the verification area (Tab key) to continue.',
  early: 'Too early: keep the {k} key down until you are asked to release it.',
  audio: 'Read the instructions aloud',
  done: 'Thank you, verification complete.',
  cancel: 'Cancel',
  unavailable: 'Verification unavailable. Reload the page and try again.',
};

const es: Messages = {
  title: 'Verificación',
  protection: 'Esto es una protección contra los robots maliciosos.',
  slide: 'Deslice lentamente el cursor hasta la derecha.',
  sliderSlow: 'Demasiado rápido: deslice el cursor más despacio.',
  sliderLabel: 'Cursor de verificación',
  sliderRetry: 'No del todo: deslice lentamente el cursor hasta el final.',
  sliderKeyboard: 'Con el teclado, utilice el modo teclado.',
  useKeyboard: 'Usar el teclado',
  useSlider: 'Usar el cursor',
  keyboardIntro: 'Tres veces seguidas: pulse una tecla de su teclado, manténgala pulsada y suéltela cuando se le indique.',
  zone: 'Zona de verificación con teclado: sitúese aquí y siga las instrucciones.',
  step: 'Paso {n} de {total}.',
  press: 'Pulse y mantenga la tecla {k} de su teclado.',
  holding: 'Mantenga pulsada la tecla {k}…',
  seconds: 'Quedan {s} s',
  release: 'Suelte la tecla {k}.',
  offZone: 'Vuelva a la zona de verificación (tecla Tab) para continuar.',
  early: 'Demasiado pronto: mantenga pulsada la tecla {k} hasta que se le indique que la suelte.',
  audio: 'Leer las instrucciones en voz alta',
  done: 'Gracias, verificación completada.',
  cancel: 'Cancelar',
  unavailable: 'Verificación no disponible. Recargue la página e inténtelo de nuevo.',
};

const nl: Messages = {
  title: 'Verificatie',
  protection: 'Dit is een bescherming tegen kwaadaardige robots.',
  slide: 'Sleep de schuifknop langzaam helemaal naar rechts.',
  sliderSlow: 'Te snel: sleep de schuifknop langzamer.',
  sliderLabel: 'Verificatieschuifknop',
  sliderRetry: 'Nog niet helemaal: sleep de schuifknop langzaam tot het einde.',
  sliderKeyboard: 'Met het toetsenbord: gebruik de toetsenbordmodus.',
  useKeyboard: 'Toetsenbord gebruiken',
  useSlider: 'Schuifknop gebruiken',
  keyboardIntro: 'Drie keer na elkaar: druk een toets op uw toetsenbord in, houd hem ingedrukt en laat hem los wanneer daarom wordt gevraagd.',
  zone: 'Verificatiezone voor het toetsenbord: plaats de focus hier en volg de instructies.',
  step: 'Stap {n} van {total}.',
  press: 'Druk de toets {k} op uw toetsenbord in en houd hem ingedrukt.',
  holding: 'Houd de toets {k} ingedrukt…',
  seconds: 'Nog {s} s',
  release: 'Laat de toets {k} los.',
  offZone: 'Ga terug naar de verificatiezone (Tab-toets) om verder te gaan.',
  early: 'Te vroeg: houd de toets {k} ingedrukt tot u wordt gevraagd hem los te laten.',
  audio: 'Instructies voorlezen',
  done: 'Bedankt, verificatie voltooid.',
  cancel: 'Annuleren',
  unavailable: 'Verificatie niet beschikbaar. Laad de pagina opnieuw en probeer het nog eens.',
};

const de: Messages = {
  title: 'Überprüfung',
  protection: 'Dies ist ein Schutz vor bösartigen Robotern.',
  slide: 'Ziehen Sie den Schieberegler langsam ganz nach rechts.',
  sliderSlow: 'Zu schnell: Ziehen Sie den Schieberegler langsamer.',
  sliderLabel: 'Prüf-Schieberegler',
  sliderRetry: 'Nicht ganz: Ziehen Sie den Schieberegler langsam bis zum Ende.',
  sliderKeyboard: 'Mit der Tastatur: Verwenden Sie den Tastaturmodus.',
  useKeyboard: 'Tastatur verwenden',
  useSlider: 'Schieberegler verwenden',
  keyboardIntro: 'Dreimal hintereinander: Drücken Sie eine Taste Ihrer Tastatur, halten Sie sie gedrückt und lassen Sie sie los, wenn Sie dazu aufgefordert werden.',
  zone: 'Prüfbereich für die Tastatur: Setzen Sie den Fokus hierher und folgen Sie den Anweisungen.',
  step: 'Schritt {n} von {total}.',
  press: 'Drücken und halten Sie die Taste {k} Ihrer Tastatur.',
  holding: 'Halten Sie die Taste {k} gedrückt…',
  seconds: 'Noch {s} s',
  release: 'Lassen Sie die Taste {k} los.',
  offZone: 'Kehren Sie zum Prüfbereich zurück (Tab-Taste), um fortzufahren.',
  early: 'Zu früh: Halten Sie die Taste {k} gedrückt, bis Sie zum Loslassen aufgefordert werden.',
  audio: 'Anweisungen vorlesen',
  done: 'Danke, Überprüfung abgeschlossen.',
  cancel: 'Abbrechen',
  unavailable: 'Überprüfung nicht verfügbar. Laden Sie die Seite neu und versuchen Sie es erneut.',
};

export const MESSAGES: Record<string, Messages> = { fr, en, es, nl, de };

export function messagesFor(lang: string | undefined, overrides?: Partial<Messages>): { lang: string; m: Messages } {
  const code = (lang ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '').slice(0, 2).toLowerCase();
  const base = MESSAGES[code] ? code : 'en';
  return { lang: base, m: { ...MESSAGES[base]!, ...overrides } };
}

export function fill(s: string, v: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`));
}
