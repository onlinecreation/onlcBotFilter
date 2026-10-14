<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/** Stockage en mémoire (tests, processus long). */
final class MemoryKeyStore implements KeyStore
{
    /** @var array<string, array{record: array<string, mixed>, used: bool, until: int}> */
    private array $items = [];

    /** @param (\Closure(): int)|null $clock millisecondes */
    public function __construct(private readonly ?\Closure $clock = null)
    {
    }

    private function now(): int
    {
        return $this->clock !== null ? ($this->clock)() : (int) floor(microtime(true) * 1000);
    }

    public function save(string $id, array $record, int $ttlSeconds): void
    {
        $this->items[$id] = ['record' => $record, 'used' => false, 'until' => $this->now() + $ttlSeconds * 1000];
    }

    public function consume(string $id): ?array
    {
        $item = $this->items[$id] ?? null;
        if ($item === null || $item['until'] < $this->now()) {
            return null;
        }
        $this->items[$id]['used'] = true;

        /** @phpstan-ignore return.type */
        return ['record' => $item['record'], 'alreadyUsed' => $item['used']];
    }
}
