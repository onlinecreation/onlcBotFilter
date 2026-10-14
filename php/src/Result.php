<?php

declare(strict_types=1);

namespace OnlineCreation\BotFilter;

/**
 * Décision. Codes : `OK` ; refus définitifs `MALFORMED`, `BAD_SIGNATURE`, `UNKNOWN_KEY`,
 * `REPLAYED`, `ACTION_MISMATCH`, `TOO_FAST`, `EXPIRED`, `CLOCK_INCOHERENT`, `CHALLENGE_FAILED` ;
 * `CHALLENGE_REQUIRED` : recommencer avec le défi (`seal({ force: true })` côté client).
 */
final class Result
{
    /** @param list<string> $reasons signaux relevés, sans donnée personnelle */
    public function __construct(
        public readonly bool $ok,
        public readonly string $code,
        public readonly array $reasons = [],
        public readonly ?string $challenge = null,
    ) {
    }

    /** @param list<string> $reasons */
    public static function fail(string $code, array $reasons = []): self
    {
        return new self(false, $code, $reasons);
    }
}
