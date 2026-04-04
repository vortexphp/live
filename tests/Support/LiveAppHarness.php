<?php

declare(strict_types=1);

namespace Vortex\Live\Tests\Support;

use Vortex\AppContext;
use Vortex\Config\Repository;
use Vortex\Container;
use Vortex\Http\Csrf;
use Vortex\Http\NullSessionStore;
use Vortex\Http\Request;
use Vortex\Http\Response;
use Vortex\Http\Session;
use Vortex\Routing\Router;
use Vortex\View\Factory;
use Vortex\View\View;

final class LiveAppHarness
{
    public static function csrfToken(): string
    {
        return 'live-test-csrf';
    }

    /**
     * Boots Repository, Session, Csrf, Router ({@code live.message}), {@see AppContext}, and Twig {@see View}.
     */
    public static function boot(): void
    {
        $configDir = dirname(__DIR__) . '/fixtures/config';
        $viewsDir = dirname(__DIR__) . '/fixtures/views';

        Repository::setInstance(new Repository($configDir));

        $sessionStore = new NullSessionStore();
        Session::setInstance(new Session($sessionStore));
        Session::start();
        Session::put('_csrf_token', self::csrfToken());
        Csrf::setInstance(new Csrf());

        $container = new Container();
        $router = new Router($container);
        $container->instance(Router::class, $router);
        $router->post('/live/message', static fn (): Response => Response::json([]))->name('live.message');
        AppContext::set($container);

        View::useFactory(new Factory($viewsDir, true));
    }

    /**
     * Active request whose body exposes {@code _csrf} for {@see Csrf::validate()}.
     *
     * @param array<string, mixed> $body
     */
    public static function setJsonRequestBody(array $body): void
    {
        Request::setCurrent(new Request(
            'POST',
            '/live/message',
            [],
            array_merge(['_csrf' => self::csrfToken()], $body),
            [],
            [],
        ));
    }
}
