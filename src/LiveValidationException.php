<?php

declare(strict_types=1);

namespace Vortex\Live;

use RuntimeException;
use Vortex\Validation\ValidationResult;

final class LiveValidationException extends RuntimeException
{
    public function __construct(
        private readonly ValidationResult $result,
    ) {
        parent::__construct('Validation failed.');
    }

    public function result(): ValidationResult
    {
        return $this->result;
    }
}
