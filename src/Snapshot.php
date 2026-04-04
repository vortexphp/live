<?php

declare(strict_types=1);

namespace Vortex\Live;

use JsonException;
use Vortex\Crypto\Crypt;

final class Snapshot
{
    /**
     * @param array<string, mixed> $state
     * @throws JsonException
     */
    public static function encode(string $class, array $state): string
    {
        $sortedState = self::ksortDeep($state);
        $canonical = json_encode(
            ['class' => $class, 'state' => $sortedState],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );
        $mac = Crypt::hash($canonical);
        $envelope = json_encode(
            ['class' => $class, 'state' => $sortedState, 'mac' => $mac],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );

        return self::base64UrlEncode($envelope);
    }

    /**
     * @return array{class: string, state: array<string, mixed>}
     */
    public static function decode(string $token): array
    {
        $raw = self::base64UrlDecode($token);
        if ($raw === null) {
            throw new \InvalidArgumentException('Invalid live snapshot encoding.');
        }

        try {
            /** @var mixed $data */
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new \InvalidArgumentException('Invalid live snapshot JSON.');
        }

        if (! is_array($data)) {
            throw new \InvalidArgumentException('Invalid live snapshot shape.');
        }

        $class = $data['class'] ?? null;
        $state = $data['state'] ?? null;
        $mac = $data['mac'] ?? null;

        if (! is_string($class) || $class === '' || ! is_array($state) || ! is_string($mac) || $mac === '') {
            throw new \InvalidArgumentException('Invalid live snapshot fields.');
        }

        /** @var array<string, mixed> $state */
        $sortedState = self::ksortDeep($state);
        $canonical = json_encode(
            ['class' => $class, 'state' => $sortedState],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );

        if (! Crypt::verify($canonical, $mac)) {
            throw new \InvalidArgumentException('Live snapshot signature mismatch.');
        }

        return ['class' => $class, 'state' => $sortedState];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private static function ksortDeep(array $data): array
    {
        ksort($data);
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                /** @var array<string, mixed> $v */
                $data[$k] = self::ksortDeep($v);
            }
        }

        return $data;
    }

    private static function base64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $token): ?string
    {
        $b64 = strtr($token, '-_', '+/');
        $pad = strlen($b64) % 4;
        if ($pad > 0) {
            $b64 .= str_repeat('=', 4 - $pad);
        }
        $raw = base64_decode($b64, true);
        if ($raw === false) {
            return null;
        }

        return $raw;
    }
}
