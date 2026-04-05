<?php

declare(strict_types=1);

namespace Vortex\Live;

use Vortex\Container;
use Vortex\Live\Http\LiveController;
use Vortex\Live\Twig\LiveExtension;
use Vortex\Package\Package;
use Vortex\Routing\Route;
use Vortex\View\Factory;

final class LivePackage extends Package
{
    public function publicAssets(): array
    {
        return [
            'resources/live.js' => 'js/live.js',
        ];
    }

    public function boot(Container $container, string $basePath): void
    {
        $container->make(Factory::class)->addExtension(new LiveExtension());
        Route::post('/live/message', [LiveController::class, 'message'])->name('live.message');
    }
}
