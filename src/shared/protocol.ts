/**
 * Protocole onlcBotFilter, version 2. Partagé par le client et le vérificateur TypeScript ; le
 * vérificateur PHP (`php/src`) en est la transcription et passe les mêmes vecteurs de test.
 */

/** Réponse du serveur à la demande de clé (`GET …?action=`). */
export interface KeyResponse {
  v: 2;
  /** Identifiant public de la clé, renvoyé dans la preuve. */
  id: string;
  /** Clé unique de signature (HMAC-SHA256). Elle ne repart jamais vers le serveur. */
  key: string;
  /** Heure d'émission, millisecondes depuis l'époque Unix (horloge du serveur). */
  issuedAt: number;
  /** Durée de vie de la clé, en secondes. */
  expiresIn: number;
  /** En deçà de ce temps passé, le client propose le défi. */
  minSeconds: number;
  /** En deçà de ce nombre d'interactions, le client propose le défi. */
  minInteractions: number;
  /** Champ modifié à la main avec moins de focus que cela (ms) : le client propose le défi. */
  minFieldMs: number;
  /** Défi au clavier : touche à maintenir et durées imposées (ms), fixées par le serveur. */
  letter: string;
  holds: number[];
}

/** Décompte des interactions avec le formulaire. Aucun contenu, aucune touche, aucune position. */
export interface Counts {
  /** Appuis (souris, stylet, doigt) */
  ptr: number;
  /** Mouvements de pointeur (plafonnés) */
  mv: number;
  /** Touchers */
  tch: number;
  /** Appuis sur une touche */
  key: number;
  /** Saisies (frappe, dictée, remplissage automatique, plage braille) */
  inp: number;
  /** Prises de focus */
  foc: number;
  /** Collages */
  pst: number;
  /** Défilements */
  scr: number;
}

/**
 * Par champ : temps de focus cumulé (ms), valeur différente
 * de la valeur par défaut du HTML (`e`), et remplie sans aucune frappe (`a` : remplissage automatique,
 * gestionnaire de mots de passe, formulaire restauré au retour arrière, valeur posée par la page).
 * Clé : nom du champ. Jamais la valeur.
 */
export interface FieldInfo {
  d: number;
  e: 0 | 1;
  a: 0 | 1;
}

export const MAX_FIELDS = 20;
export const FIELD_NAME = /^[A-Za-z0-9_.\-\[\]]{1,40}$/;

export interface SlideChallenge {
  m: 'slide';
  /** Type de pointeur employé : `mouse`, `touch`, `pen`. */
  pt: string | null;
  /** Trajet : [ms depuis l'appui, position en millièmes de la course], 200 points au plus. */
  p: Array<[number, number]>;
}

export interface KeysChallenge {
  m: 'keys';
  /** Pour chaque tour : durée imposée (`t`) et durée effective de l'appui (`h`), en ms. */
  r: Array<{ t: number; h: number }>;
  /** Relâchements prématurés */
  f: number;
  /** Consignes lues à voix haute */
  au: boolean;
}

export type Challenge = SlideChallenge | KeysChallenge;

/** Contenu signé. */
export interface Payload {
  v: 2;
  id: string;
  /** Action protégée */
  a: string;
  /** Horloge murale du terminal (ms) à la réception de la clé, puis à la soumission. */
  t0: number;
  t1: number;
  /** Temps écoulé selon l'horloge monotone du terminal, entre les deux (ms). */
  el: number;
  /** Temps passé sur le formulaire depuis l'association (ms) : il couvre les clés successives. */
  ft: number;
  /** Décalage horaire du terminal (minutes, `Date#getTimezoneOffset`), à titre indicatif. */
  tz: number;
  c: Counts;
  f: Record<string, FieldInfo>;
  /** Pointeur principal constaté et `navigator.webdriver`. */
  env: { pt: string | null; wd: boolean };
  ch?: Challenge;
}

/** Valeur du champ : la chaîne signée telle quelle et sa signature (base64url). */
export interface FieldValue {
  d: string;
  s: string;
}

export const FIELD_MAX_BYTES = 8192;

/** Interactions qui supposent une personne. Les mouvements et défilements ne comptent pas. */
export function interactionCount(c: Counts): number {
  return c.ptr + c.tch + c.key + c.inp + c.foc + c.pst;
}
