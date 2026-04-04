<?php

declare(strict_types=1);

namespace Vortex\Live\Tests\Stubs;

use Vortex\Live\Component;

final class ValidatingLiveComponent extends Component
{
    public string $email = 'bad';

    public function view(): string
    {
        return 'live.validating';
    }

    public function save(): void
    {
        $this->validate(['email' => 'email']);
    }
}
