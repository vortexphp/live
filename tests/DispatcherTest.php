<?php

declare(strict_types=1);

namespace Vortex\Live\Tests;

use PHPUnit\Framework\TestCase;
use Vortex\Live\Dispatcher;
use Vortex\Live\Snapshot;
use Vortex\Live\Tests\Stubs\CounterLiveComponent;
use Vortex\Live\Tests\Stubs\RedirectLiveComponent;
use Vortex\Live\Tests\Stubs\ValidatingLiveComponent;
use Vortex\Live\Tests\Support\LiveAppHarness;
use Vortex\Live\Tests\Support\ResetsVortexFacades;

final class DispatcherTest extends TestCase
{
    use ResetsVortexFacades;

    protected function setUp(): void
    {
        parent::setUp();
        LiveAppHarness::boot();
    }

    protected function tearDown(): void
    {
        $this->tearDownVortexFacades();
        parent::tearDown();
    }

    public function testCsrfInvalid(): void
    {
        LiveAppHarness::setJsonRequestBody(['_csrf' => 'wrong']);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 0]),
            'action' => 'increment',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(419, $res->httpStatus());
        self::assertStringContainsString('csrf_invalid', $res->body());
    }

    public function testInvalidRequestWhenActionMissingAndNotSync(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 0]),
            'action' => '',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        self::assertStringContainsString('invalid_request', $res->body());
    }

    public function testInvalidSnapshot(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => 'not-a-token',
            'action' => 'increment',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        self::assertStringContainsString('invalid_snapshot', $res->body());
    }

    public function testComponentNotAllowed(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(\stdClass::class, []),
            'action' => 'noop',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        self::assertStringContainsString('component_not_allowed', $res->body());
    }

    public function testInvalidAction(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 0]),
            'action' => 'notAMethod',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        self::assertStringContainsString('invalid_action', $res->body());
    }

    public function testInvalidActionWhenArityMismatch(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 0]),
            'action' => 'incrementBy',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        self::assertStringContainsString('invalid_action', $res->body());
    }

    public function testActionRunsAndReturnsWrappedHtml(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $snap = Snapshot::encode(CounterLiveComponent::class, ['count' => 0]);
        $res = $d->handle([
            'snapshot' => $snap,
            'action' => 'increment',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(200, $res->httpStatus());
        $data = json_decode($res->body(), true);
        self::assertIsArray($data);
        self::assertTrue($data['ok']);
        self::assertIsString($data['html']);
        self::assertStringContainsString('data-count', $data['html']);
        self::assertStringContainsString('>1<', $data['html']);
        self::assertStringContainsString('live-root', $data['html']);
    }

    public function testActionPassesArgs(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 1]),
            'action' => 'incrementBy',
            'args' => [4],
            'merge' => [],
        ]);

        self::assertSame(200, $res->httpStatus());
        $data = json_decode($res->body(), true);
        self::assertIsArray($data);
        self::assertStringContainsString('>5<', $data['html']);
    }

    public function testSyncReRendersWithoutAction(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(CounterLiveComponent::class, ['count' => 0]),
            'action' => '',
            'args' => [],
            'merge' => ['count' => '7'],
            'sync' => true,
        ]);

        self::assertSame(200, $res->httpStatus());
        $data = json_decode($res->body(), true);
        self::assertIsArray($data);
        self::assertTrue($data['ok']);
        self::assertStringContainsString('>7<', $data['html']);
    }

    public function testValidationFailedEnvelope(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(ValidatingLiveComponent::class, ['email' => 'x']),
            'action' => 'save',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(422, $res->httpStatus());
        $data = json_decode($res->body(), true);
        self::assertIsArray($data);
        self::assertSame('validation_failed', $data['error']);
        self::assertArrayHasKey('errors', $data);
        self::assertArrayHasKey('email', $data['errors']);
    }

    public function testRedirectResponse(): void
    {
        LiveAppHarness::setJsonRequestBody([]);
        $d = new Dispatcher();
        $res = $d->handle([
            'snapshot' => Snapshot::encode(RedirectLiveComponent::class, ['count' => 0]),
            'action' => 'leave',
            'args' => [],
            'merge' => [],
        ]);

        self::assertSame(200, $res->httpStatus());
        $data = json_decode($res->body(), true);
        self::assertIsArray($data);
        self::assertTrue($data['ok']);
        self::assertSame('https://example.com/done', $data['redirect']);
    }
}
