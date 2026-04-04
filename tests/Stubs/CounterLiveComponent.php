<?php

declare(strict_types=1);

namespace Vortex\Live\Tests\Stubs;

use Vortex\Live\Component;

final class CounterLiveComponent extends Component
{
    public int $count = 0;

    public function view(): string
    {
        return 'live.counter';
    }

    public function increment(): void
    {
        $this->count++;
    }

    public function incrementBy(int $n): void
    {
        $this->count += $n;
    }
}
