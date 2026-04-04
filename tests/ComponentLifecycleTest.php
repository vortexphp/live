<?php

declare(strict_types=1);

namespace Vortex\Live\Tests;

use PHPUnit\Framework\TestCase;
use Vortex\Live\Component;

final class ComponentLifecycleTest extends TestCase
{
    public function testHydrateInvokesHooksAndMergeOrder(): void
    {
        $log = [];

        $c = new class ($log) extends Component {
            /**
             * @param list<string> $log
             */
            public function __construct(private array &$log)
            {
            }

            public string $a = '';

            public function view(): string
            {
                return '';
            }

            protected function hydrating(array $state): void
            {
                $this->log[] = 'hydrating';
            }

            protected function hydrated(): void
            {
                $this->log[] = 'hydrated';
            }

            protected function updating(string $name, mixed $newValue): void
            {
                $this->log[] = 'updating:' . $name;
            }

            protected function updated(string $name, mixed $newValue): void
            {
                $this->log[] = 'updated:' . $name;
            }

            protected function dehydrating(): void
            {
                $this->log[] = 'dehydrating';
            }

            protected function dehydrated(): void
            {
                $this->log[] = 'dehydrated';
            }
        };

        $c->hydrate(['a' => 'hi']);
        self::assertSame('hi', $c->a);
        self::assertSame([
            'hydrating',
            'updating:a',
            'updated:a',
            'hydrated',
        ], $log);

        $log = [];
        $out = $c->dehydrate();
        self::assertSame(['a' => 'hi'], $out);
        self::assertSame(['dehydrating', 'dehydrated'], $log);
    }

    public function testValidateUsesRawPublicStateWithoutDehydrateHooks(): void
    {
        $log = [];

        $c = new class ($log) extends Component {
            /**
             * @param list<string> $log
             */
            public function __construct(private array &$log)
            {
            }

            public string $email = 'a@b.co';

            public function view(): string
            {
                return '';
            }

            protected function dehydrating(): void
            {
                $this->log[] = 'dehydrating';
            }

            public function runValidate(): void
            {
                $this->validate(['email' => 'email']);
            }
        };

        $c->runValidate();
        self::assertSame([], $log);
    }
}
