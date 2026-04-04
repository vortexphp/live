<?php

declare(strict_types=1);

namespace Vortex\Live\Http;

use Vortex\Http\Controller;
use Vortex\Http\Request;
use Vortex\Http\Response;
use Vortex\Live\Dispatcher;

final class LiveController extends Controller
{
    public function message(): Response
    {
        return (new Dispatcher())->handle(Request::body());
    }
}
