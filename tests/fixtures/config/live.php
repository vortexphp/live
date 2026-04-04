<?php

declare(strict_types=1);

use Vortex\Live\Tests\Stubs\CounterLiveComponent;
use Vortex\Live\Tests\Stubs\RedirectLiveComponent;
use Vortex\Live\Tests\Stubs\ValidatingLiveComponent;

return [
    'components' => [
        CounterLiveComponent::class,
        RedirectLiveComponent::class,
        ValidatingLiveComponent::class,
    ],
];
