<?php

declare(strict_types=1);

namespace Vortex\Live\Tests\Stubs;

use Vortex\Live\Component;
use Vortex\Live\LiveRedirectException;

final class RedirectLiveComponent extends Component
{
    public int $count = 0;

    public function view(): string
    {
        return 'live.counter';
    }

    public function leave(): void
    {
        throw new LiveRedirectException('https://example.com/done');
    }
}
