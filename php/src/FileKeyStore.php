<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/**
 * Stockage en fichiers, pour un site PHP simple sans cache partagé : un fichier par clé, verrou
 * exclusif à la consommation. Les fichiers périmés sont purgés de temps à autre.
 */
final class FileKeyStore implements KeyStore
{
    public function __construct(private readonly string $directory)
    {
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('onlcBotFilter : dossier des clés inaccessible.');
        }
    }

    private function path(string $id): ?string
    {
        return preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $id) === 1 ? $this->directory.'/'.$id.'.json' : null;
    }

    public function save(string $id, array $record, int $ttlSeconds): void
    {
        $path = $this->path($id) ?? throw new \InvalidArgumentException('Identifiant de clé invalide.');
        file_put_contents($path, json_encode(['record' => $record, 'used' => false, 'until' => time() + $ttlSeconds], JSON_THROW_ON_ERROR), LOCK_EX);
        if (random_int(1, 100) === 1) {
            $this->purge();
        }
    }

    public function consume(string $id): ?array
    {
        $path = $this->path($id);
        if ($path === null || !is_file($path)) {
            return null;
        }
        $h = fopen($path, 'c+');
        if ($h === false) {
            return null;
        }
        try {
            flock($h, LOCK_EX);
            $item = json_decode((string) stream_get_contents($h), true);
            if (!is_array($item) || ($item['until'] ?? 0) < time()) {
                return null;
            }
            $used = (bool) $item['used'];
            $item['used'] = true;
            ftruncate($h, 0);
            rewind($h);
            fwrite($h, json_encode($item, JSON_THROW_ON_ERROR));

            return ['record' => $item['record'], 'alreadyUsed' => $used];
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    public function purge(): void
    {
        foreach (glob($this->directory.'/*.json') ?: [] as $file) {
            $item = json_decode((string) @file_get_contents($file), true);
            if (!is_array($item) || ($item['until'] ?? 0) < time() - 60) {
                @unlink($file);
            }
        }
    }
}
