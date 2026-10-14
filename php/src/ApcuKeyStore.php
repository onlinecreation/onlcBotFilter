<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/** Stockage APCu (un seul serveur) : la marque d'usage est posée par `apcu_add`, donc atomique. */
final class ApcuKeyStore implements KeyStore
{
    public function __construct(private readonly string $prefix = 'onlc-bot-filter_')
    {
    }

    public function save(string $id, array $record, int $ttlSeconds): void
    {
        apcu_store($this->prefix.'k_'.$id, $record, $ttlSeconds);
    }

    public function consume(string $id): ?array
    {
        $record = apcu_fetch($this->prefix.'k_'.$id, $found);
        if (!$found || !is_array($record)) {
            return null;
        }
        $first = apcu_add($this->prefix.'u_'.$id, 1, 7 * 86400);

        return ['record' => $record, 'alreadyUsed' => !$first];
    }
}
