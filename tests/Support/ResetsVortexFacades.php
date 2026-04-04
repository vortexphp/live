<?php

declare(strict_types=1);

namespace Vortex\Live\Tests\Support;

use ReflectionClass;
use ReflectionException;
use Vortex\AppContext;
use Vortex\Config\Repository;
use Vortex\Http\Request;
use Vortex\Http\Session;
use Vortex\Http\Csrf;
use Vortex\View\View;

trait ResetsVortexFacades
{
    protected function tearDownVortexFacades(): void
    {
        Repository::forgetInstance();
        Request::forgetCurrent();
        View::forgetFactory();
        $this->forceStaticProperty(Csrf::class, 'instance', null);
        $this->forceStaticProperty(Session::class, 'instance', null);
        $this->forceStaticProperty(AppContext::class, 'container', null);
    }

    /**
     * @param class-string $class
     */
    private function forceStaticProperty(string $class, string $property, mixed $value): void
    {
        try {
            $ref = new ReflectionClass($class);
            $prop = $ref->getProperty($property);
            $prop->setAccessible(true);
            $prop->setValue(null, $value);
        } catch (ReflectionException) {
        }
    }
}
