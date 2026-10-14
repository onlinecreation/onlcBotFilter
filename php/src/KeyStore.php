<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/**
 * Stockage des clés émises. `consume()` doit être atomique : il renvoie l'enregistrement et marque
 * la clé utilisée ; une seconde présentation renvoie `alreadyUsed: true` (rejeu).
 *
 * Enregistrement : `{key: string, action: string, issuedAt: int (ms), letter: string, holds: list<int>}`.
 */
interface KeyStore
{
    /** @param array{key: string, action: string, issuedAt: int, letter: string, holds: list<int>} $record */
    public function save(string $id, array $record, int $ttlSeconds): void;

    /** @return array{record: array{key: string, action: string, issuedAt: int, letter: string, holds: list<int>}, alreadyUsed: bool}|null */
    public function consume(string $id): ?array;
}
