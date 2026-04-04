<?php

declare(strict_types=1);

namespace Vortex\Live\Tests;

use PHPUnit\Framework\TestCase;
use Vortex\Live\Snapshot;

final class SnapshotTest extends TestCase
{
    public function testRoundTripPreservesClassAndState(): void
    {
        $token = Snapshot::encode('App\\Demo\\Widget', ['count' => 3, 'tag' => 'x']);
        $decoded = Snapshot::decode($token);

        self::assertSame('App\\Demo\\Widget', $decoded['class']);
        self::assertSame(['count' => 3, 'tag' => 'x'], $decoded['state']);
    }

    public function testEncodeSortsStateKeysRecursivelyForStableSignatures(): void
    {
        $token = Snapshot::encode('App\\Demo\\Widget', [
            'z' => 1,
            'a' => ['n' => 2, 'm' => 3],
        ]);
        $decoded = Snapshot::decode($token);

        self::assertSame([
            'a' => ['m' => 3, 'n' => 2],
            'z' => 1,
        ], $decoded['state']);
    }

    public function testDifferentAppKeyFailsVerification(): void
    {
        $token = Snapshot::encode('App\\Demo\\Widget', ['n' => 1]);
        $prev = $_ENV['APP_KEY'];
        try {
            $_ENV['APP_KEY'] = 'base64:' . base64_encode(random_bytes(32));
            putenv('APP_KEY=' . $_ENV['APP_KEY']);

            $this->expectException(\InvalidArgumentException::class);
            $this->expectExceptionMessage('signature mismatch');
            Snapshot::decode($token);
        } finally {
            $_ENV['APP_KEY'] = $prev;
            putenv('APP_KEY=' . $prev);
        }
    }
}
