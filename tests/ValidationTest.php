<?php

declare(strict_types=1);

namespace Vortex\Live\Tests;

use PHPUnit\Framework\TestCase;
use Vortex\Live\Component;
use Vortex\Live\LiveValidationException;

final class ValidationTest extends TestCase
{
    public function testValidateThrowsWithFieldErrors(): void
    {
        $c = new class extends Component {
            public function view(): string
            {
                return '';
            }

            public string $email = 'not-email';

            public function submit(): void
            {
                $this->validate(['email' => 'email']);
            }
        };

        try {
            $c->submit();
            self::fail('Expected LiveValidationException');
        } catch (LiveValidationException $e) {
            self::assertTrue($e->result()->failed());
            self::assertArrayHasKey('email', $e->result()->errors());
        }
    }

    public function testValidatePasses(): void
    {
        $c = new class extends Component {
            public function view(): string
            {
                return '';
            }

            public string $email = 'a@b.co';

            public function submit(): void
            {
                $this->validate(['email' => 'email']);
            }
        };

        $c->submit();
        self::addToAssertionCount(1);
    }
}
