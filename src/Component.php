<?php

declare(strict_types=1);

namespace Vortex\Live;

use ReflectionClass;
use ReflectionProperty;

abstract class Component
{
    abstract public function view(): string;

    /**
     * @return array<string, mixed>
     */
    public function dehydrate(): array
    {
        $ref = new ReflectionClass($this);
        $out = [];
        foreach ($ref->getProperties(ReflectionProperty::IS_PUBLIC) as $prop) {
            if ($prop->isStatic()) {
                continue;
            }
            $out[$prop->getName()] = $prop->getValue($this);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $state
     */
    public function hydrate(array $state): void
    {
        $ref = new ReflectionClass($this);
        foreach ($state as $key => $value) {
            if (! is_string($key)) {
                continue;
            }
            if (! $ref->hasProperty($key)) {
                continue;
            }
            $prop = $ref->getProperty($key);
            if (! $prop->isPublic() || $prop->isStatic()) {
                continue;
            }
            $prop->setValue($this, $value);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function dataset(): array
    {
        return $this->dehydrate();
    }
}
