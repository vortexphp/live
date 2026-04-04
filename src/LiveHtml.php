<?php

declare(strict_types=1);

namespace Vortex\Live;

use Vortex\Config\Repository;
use Vortex\Http\Csrf;
use Vortex\View\View;

final class LiveHtml
{
    /**
     * @param array<string, mixed> $initialProps
     */
    public static function mount(string $class, array $initialProps = []): string
    {
        if (! self::isAllowed($class)) {
            throw new \InvalidArgumentException('Live component is not allowed: ' . $class);
        }

        if (! is_subclass_of($class, Component::class)) {
            throw new \InvalidArgumentException('Live component must extend ' . Component::class);
        }

        /** @var Component $component */
        $component = new $class();
        if ($initialProps !== []) {
            $component->hydrate($initialProps);
        }

        $snapshot = Snapshot::encode($class, $component->dehydrate());
        $inner = View::render($component->view(), $component->dataset());

        return self::wrap($inner, $snapshot);
    }

    public static function renderAfterUpdate(Component $component): string
    {
        $class = $component::class;
        $snapshot = Snapshot::encode($class, $component->dehydrate());
        $inner = View::render($component->view(), $component->dataset());

        return self::wrap($inner, $snapshot);
    }

    public static function isAllowed(string $class): bool
    {
        /** @var mixed $list */
        $list = Repository::get('live.components', []);
        if (! is_array($list)) {
            return false;
        }

        foreach ($list as $allowed) {
            if (is_string($allowed) && $allowed === $class) {
                return true;
            }
        }

        return false;
    }

    private static function wrap(string $innerHtml, string $snapshotToken): string
    {
        $endpoint = e(\route('live.message'));
        $tokenAttr = htmlspecialchars($snapshotToken, ENT_QUOTES, 'UTF-8');
        $csrf = htmlspecialchars(Csrf::token(), ENT_QUOTES, 'UTF-8');

        return <<<HTML
<div class="live-root" data-live-root data-live-snapshot="{$tokenAttr}" data-live-endpoint="{$endpoint}" data-live-csrf="{$csrf}">
{$innerHtml}
</div>
HTML;
    }
}
