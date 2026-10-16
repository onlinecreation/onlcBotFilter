/**
 * Erreur levée par le client. Codes : `KEY_UNAVAILABLE` (clé non obtenue), `ALREADY_SUBMITTED`
 * (`seal()` déjà en cours ou déjà appelé sans `reset()`), `CANCELLED` (défi annulé par la
 * personne), `DETACHED` (instance détachée).
 */
export class BotFilterError extends Error {
  constructor(readonly code: 'KEY_UNAVAILABLE' | 'ALREADY_SUBMITTED' | 'CANCELLED' | 'DETACHED', message: string) {
    super(message);
  }
}
