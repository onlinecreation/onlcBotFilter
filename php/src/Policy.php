<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/** Réglages du vérificateur ; mêmes noms et mêmes valeurs par défaut que `src/server/policy.ts`. */
final class Policy
{
    public function __construct(
        /** Sous ce temps passé, le défi est exigé (s). */
        public readonly int $minSeconds = 3,
        /** Sous ce temps passé, refus même avec défi (s). */
        public readonly int $hardMinSeconds = 1,
        /** Durée de vie d'une clé (s) : au-delà, probablement collectée pour être rejouée. */
        public readonly int $maxSeconds = 7200,
        public readonly int $minInteractions = 3,
        /** Temps de focus minimal d'un champ rempli à la main, quand la liste des champs remplis est fournie (ms). */
        public readonly int $minFieldMs = 1000,
        /** Écart toléré entre horloge murale et horloge monotone du terminal (ms). */
        public readonly int $clockDrift = 2000,
        /** Écart toléré entre l'horloge du terminal et celle du serveur (ms) : au-delà, défi exigé. */
        public readonly int $maxSkew = 48 * 3600 * 1000,
        public readonly int $holdRounds = 3,
        public readonly int $holdMin = 2000,
        public readonly int $holdMax = 4000,
        public readonly int $reactMin = 80,
        public readonly int $reactMax = 8000,
        public readonly string $letters = 'DFJKLS',
    ) {
    }

    /** @param array<string, int|string> $values */
    public static function fromArray(array $values): self
    {
        return new self(...$values);
    }
}
