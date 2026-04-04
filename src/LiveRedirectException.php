<?php

declare(strict_types=1);

namespace Vortex\Live;

use RuntimeException;

/**
 * Thrown from a component action to signal a full-page navigation instead of swapping HTML.
 */
final class LiveRedirectException extends RuntimeException
{
    public function __construct(
        public readonly string $to,
    ) {
        parent::__construct('Live redirect.');
    }
}
