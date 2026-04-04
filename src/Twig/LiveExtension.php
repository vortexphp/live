<?php

declare(strict_types=1);

namespace Vortex\Live\Twig;

use Twig\Extension\AbstractExtension;
use Twig\Markup;
use Twig\TwigFunction;
use Vortex\Live\LiveHtml;

final class LiveExtension extends AbstractExtension
{
    public function getFunctions(): array
    {
        return [
            new TwigFunction(
                'live_mount',
                static function (string $class, array $props = []): Markup {
                    $html = LiveHtml::mount($class, $props);

                    return new Markup($html, 'UTF-8');
                },
                ['is_safe' => ['html']],
            ),
        ];
    }
}
