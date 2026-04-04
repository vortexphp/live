<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

$key = 'base64:' . base64_encode(random_bytes(32));
$_ENV['APP_KEY'] = $_ENV['APP_KEY'] ?? $key;
putenv('APP_KEY=' . $_ENV['APP_KEY']);
