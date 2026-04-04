<?php

declare(strict_types=1);

namespace Vortex\Live;

use JsonException;
use ReflectionClass;
use Vortex\Http\Csrf;
use Vortex\Http\Response;

final class Dispatcher
{
    public function handle(array $body): Response
    {
        if (! Csrf::validate()) {
            return Response::json(['ok' => false, 'error' => 'csrf_invalid'], 419);
        }

        $snapshotRaw = $body['snapshot'] ?? null;
        $action = $body['action'] ?? null;
        if (! is_string($snapshotRaw) || $snapshotRaw === '' || ! is_string($action) || $action === '') {
            return Response::json(['ok' => false, 'error' => 'invalid_request'], 422);
        }

        try {
            $decoded = Snapshot::decode($snapshotRaw);
        } catch (\InvalidArgumentException | JsonException) {
            return Response::json(['ok' => false, 'error' => 'invalid_snapshot'], 422);
        }

        $class = $decoded['class'];
        $state = $decoded['state'];

        if (! LiveHtml::isAllowed($class) || ! is_subclass_of($class, Component::class)) {
            return Response::json(['ok' => false, 'error' => 'component_not_allowed'], 422);
        }

        /** @var Component $component */
        $component = new $class();
        $component->hydrate($state);

        $invoke = $this->resolveAction($class, $action);
        if ($invoke === null) {
            return Response::json(['ok' => false, 'error' => 'invalid_action'], 422);
        }

        $invoke($component);

        try {
            $html = LiveHtml::renderAfterUpdate($component);
        } catch (\Throwable) {
            return Response::json(['ok' => false, 'error' => 'render_failed'], 500);
        }

        return Response::json(['ok' => true, 'html' => $html]);
    }

    /**
     * @param class-string<Component> $class
     * @return (callable(Component): void)|null
     */
    private function resolveAction(string $class, string $action): ?callable
    {
        if (! preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $action)) {
            return null;
        }

        $ref = new ReflectionClass($class);
        if (! $ref->hasMethod($action)) {
            return null;
        }

        $method = $ref->getMethod($action);
        if (! $method->isPublic() || $method->isStatic() || $method->isAbstract()) {
            return null;
        }

        if ($method->getDeclaringClass()->getName() === Component::class) {
            return null;
        }

        if (str_starts_with($method->getName(), '__')) {
            return null;
        }

        if ($method->getNumberOfRequiredParameters() > 0) {
            return null;
        }

        return static function (Component $instance) use ($method): void {
            $name = $method->getName();
            $instance->{$name}();
        };
    }
}
