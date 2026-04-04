<?php

declare(strict_types=1);

namespace Vortex\Live;

use ReflectionClass;
use ReflectionProperty;
use Vortex\Validation\Validator;

abstract class Component
{
    abstract public function view(): string;

    /**
     * Runs once after initial props are merged on first {@see \Vortex\Live\LiveHtml::mount}.
     * Subsequent requests (AJAX) do not call this.
     */
    public function mount(): void {}

    /**
     * Snapshot/state pipeline: {@see hydrating()}, merge public properties (fires {@see updating()} / {@see updated()} per key), then {@see hydrated()}.
     *
     * @param array<string, mixed> $state
     */
    final public function hydrate(array $state): void
    {
        $this->hydrating($state);
        $this->mergePublicState($state);
        $this->hydrated();
    }

    /**
     * Before request/state is applied to public properties.
     *
     * @param array<string, mixed> $state
     */
    protected function hydrating(array $state): void {}

    /**
     * After all keys from {@see $state} have been merged.
     */
    protected function hydrated(): void {}

    /**
     * Called only for Live `sync: true` requests (e.g. live:model.live/lazy) before re-render.
     * Use to drop one-shot UI flags that should not persist across debounced syncs.
     */
    public function resetTransientStateAfterLiveSync(): void {}

    /**
     * Before a public property from the snapshot is written. {@see $newValue} is the incoming value.
     */
    protected function updating(string $name, mixed $newValue): void {}

    /**
     * After a public property was written from the snapshot.
     */
    protected function updated(string $name, mixed $newValue): void {}

    /**
     * Immediately before the Twig view for this component is rendered.
     * Public so the Live runtime can invoke it from outside the component hierarchy.
     */
    public function render(): void {}

    /**
     * Immediately after the Twig view was rendered (skipped if Twig throws).
     */
    public function rendered(): void {}

    /**
     * Before {@see dehydrate()} builds the payload that goes into the signed snapshot.
     */
    protected function dehydrating(): void {}

    /**
     * After {@see dehydrate()} collected public properties.
     */
    protected function dehydrated(): void {}

    /**
     * @return array<string, mixed>
     */
    final public function dehydrate(): array
    {
        $this->dehydrating();
        $out = $this->collectPublicProperties();
        $this->dehydrated();

        return $out;
    }

    /**
     * Run {@see Validator::make()} on current public properties (no dehydrate hooks). On failure throws {@see LiveValidationException}.
     *
     * @param array<string, string|\Vortex\Validation\Rule> $rules
     * @param array<string, string>                         $messages
     * @param array<string, string>                         $attributes
     */
    protected final function validate(
        array $rules,
        array $messages = [],
        array $attributes = [],
    ): void {
        $result = Validator::make($this->collectPublicProperties(), $rules, $messages, $attributes);
        if ($result->failed()) {
            throw new LiveValidationException($result);
        }
    }

    /**
     * View payload (public state). Equivalent to {@see dehydrate()} — runs the full dehydrate pipeline.
     * When the framework renders a component, it calls {@see dehydrate()} once and passes that array to Twig.
     */
    public function dataset(): array
    {
        return $this->dehydrate();
    }

    /**
     * @param array<string, mixed> $state
     */
    private function mergePublicState(array $state): void
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
            $this->updating($key, $value);
            $prop->setValue($this, $value);
            $this->updated($key, $value);
        }
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * @return array<string, mixed>
     */
    private function collectPublicProperties(): array
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
}
