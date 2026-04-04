<?php

declare(strict_types=1);

namespace Vortex\Live;

use ReflectionClass;
use ReflectionNamedType;
use ReflectionProperty;
use ReflectionUnionType;

/**
 * Merges a request `merge` object into snapshot state for public, non-static, writable properties.
 */
final class FormStateMerge
{
    /**
     * @param class-string<Component> $class
     * @param array<string, mixed>    $state from snapshot
     * @param array<mixed>            $merge from client (only string keys kept)
     *
     * @return array<string, mixed>
     */
    public static function apply(string $class, array $state, array $merge): array
    {
        if ($merge === []) {
            return $state;
        }

        $ref = new ReflectionClass($class);
        $out = $state;

        foreach ($merge as $key => $value) {
            if (! is_string($key) || ! $ref->hasProperty($key)) {
                continue;
            }
            $prop = $ref->getProperty($key);
            if (! $prop->isPublic() || $prop->isStatic()) {
                continue;
            }
            if ($prop->isReadOnly()) {
                continue;
            }
            $coerced = self::coerce($prop, $value);
            if ($coerced === self::skip()) {
                continue;
            }
            $out[$key] = $coerced;
        }

        return $out;
    }

    private static ?object $skip = null;

    private static function skip(): object
    {
        return self::$skip ??= new \stdClass();
    }

    private static function unionContainsNull(ReflectionUnionType $u): bool
    {
        foreach ($u->getTypes() as $t) {
            if ($t instanceof ReflectionNamedType && $t->getName() === 'null') {
                return true;
            }
        }

        return false;
    }

    private static function coerce(ReflectionProperty $prop, mixed $raw): mixed
    {
        $type = $prop->getType();
        if ($type === null) {
            return $raw;
        }

        if ($type instanceof ReflectionUnionType) {
            if (($raw === null || $raw === '') && self::unionContainsNull($type)) {
                return null;
            }

            foreach ($type->getTypes() as $t) {
                if ($t instanceof ReflectionNamedType && $t->getName() === 'null') {
                    continue;
                }
                if ($t instanceof ReflectionNamedType && $t->isBuiltin()) {
                    $try = self::coerceNamedBuiltin($t, $raw);
                    if ($try !== self::skip()) {
                        return $try;
                    }
                }
            }

            return self::skip();
        }

        if (! $type instanceof ReflectionNamedType) {
            return self::skip();
        }

        if ($type->allowsNull() && ($raw === null || $raw === '')) {
            return null;
        }

        return self::coerceNamedBuiltin($type, $raw);
    }

    private static function coerceNamedBuiltin(ReflectionNamedType $type, mixed $raw): mixed
    {
        $name = $type->getName();

        if ($name === 'mixed') {
            return $raw;
        }

        if ($name === 'string') {
            if (is_string($raw)) {
                return $raw;
            }
            if ($raw === null) {
                return '';
            }
            if (is_scalar($raw)) {
                return (string) $raw;
            }

            return self::skip();
        }

        if ($name === 'int') {
            if (is_int($raw)) {
                return $raw;
            }
            if (is_string($raw) && is_numeric($raw)) {
                return (int) $raw;
            }
            if (is_float($raw)) {
                return (int) $raw;
            }

            return self::skip();
        }

        if ($name === 'float') {
            if (is_float($raw) || is_int($raw)) {
                return (float) $raw;
            }
            if (is_string($raw) && is_numeric($raw)) {
                return (float) $raw;
            }

            return self::skip();
        }

        if ($name === 'bool') {
            if (is_bool($raw)) {
                return $raw;
            }
            if ($raw === 1 || $raw === '1' || $raw === 'true' || $raw === 'on' || $raw === 'yes') {
                return true;
            }
            if ($raw === 0 || $raw === '0' || $raw === 'false' || $raw === '' || $raw === 'off' || $raw === 'no') {
                return false;
            }

            return self::skip();
        }

        return self::skip();
    }
}
