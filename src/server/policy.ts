/** Réglages du vérificateur. Mêmes noms et mêmes valeurs par défaut côté PHP (`Policy`). */
export interface Policy {
  /** Sous ce temps passé, le défi est exigé (s). */
  minSeconds: number;
  /** Sous ce temps passé, refus même avec défi : aucune personne ne remplit un formulaire aussi vite (s). */
  hardMinSeconds: number;
  /** Durée de vie d'une clé : au-delà, elle a probablement été collectée pour être rejouée (s). */
  maxSeconds: number;
  /** Sous ce nombre d'interactions, le défi est exigé. */
  minInteractions: number;
  /** Temps de focus minimal d'un champ rempli à la main, quand le serveur fournit la liste des champs remplis (ms). */
  minFieldMs: number;
  /** Écart toléré entre l'horloge murale et l'horloge monotone du terminal pendant le remplissage (ms). */
  clockDrift: number;
  /** Écart toléré entre l'horloge du terminal et celle du serveur (ms) : au-delà, défi exigé, jamais refus. */
  maxSkew: number;
  /** Nombre de tours du défi au clavier et bornes des durées imposées (ms). */
  holdRounds: number;
  holdMin: number;
  holdMax: number;
  /** Bornes du temps de réaction à la consigne « relâchez » (ms). */
  reactMin: number;
  reactMax: number;
  /** Touches proposées pour le défi au clavier. */
  letters: string;
}

export const DEFAULT_POLICY: Policy = {
  minSeconds: 3,
  hardMinSeconds: 1,
  maxSeconds: 7200,
  minInteractions: 3,
  minFieldMs: 1000,
  clockDrift: 2000,
  maxSkew: 48 * 3600 * 1000,
  holdRounds: 3,
  holdMin: 2000,
  holdMax: 4000,
  reactMin: 80,
  reactMax: 8000,
  letters: 'DFJKLS',
};
