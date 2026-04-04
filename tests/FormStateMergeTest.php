<?php

declare(strict_types=1);

namespace Vortex\Live\Tests;

use PHPUnit\Framework\TestCase;
use Vortex\Live\Component;
use Vortex\Live\FormStateMerge;

final class FormStateMergeTest extends TestCase
{
    public function testMergesAllowedPublicFieldsAndCoercesTypes(): void
    {
        $stub = new class extends Component {
            public string $a = 'old';
            public int $b = 0;
            public function view(): string
            {
                return '';
            }
        };

        $out = FormStateMerge::apply($stub::class, ['a' => 'old', 'b' => 0], [
            'a' => 'hello',
            'b' => '42',
            'nope' => 'x',
        ]);

        self::assertSame(['a' => 'hello', 'b' => 42], $out);
    }

    public function testEmptyStringForNullablePropertyBecomesNull(): void
    {
        $stub = new class extends Component {
            public ?string $opt = 'was';
            public function view(): string
            {
                return '';
            }
        };

        $out = FormStateMerge::apply($stub::class, ['opt' => 'was'], ['opt' => '']);

        self::assertArrayHasKey('opt', $out);
        self::assertNull($out['opt']);
    }
}
