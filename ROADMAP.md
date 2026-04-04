# vortexphp/live — roadmap

Ordered by impact. Items are proposals, not commitments.

## Livewire × Alpine (merged shape)

**Intent:** one stack where **server-owned state and actions** feel like **Livewire**, and **browser-first UI** feels like **Alpine**—without shipping two frameworks simultaneously.

| If you know… | In vortexphp/live |
|--------------|-------------------|
| `wire:click`, `$wire` | `live:click` + signed snapshot round-trip |
| `wire:submit`, form merge | `live:submit` + `FormStateMerge` → action |
| `wire:model` / `wire:model.live` | `live:model.live` (debounced sync, re-render) |
| `wire:model` lazy / blur | `live:model.lazy` |
| Local / `entangle` / draft UI | `live:model.local` + DOM merge on next action, or never (pure client) |
| `x-model` / `x-data` text state | `live:model.local` + optional `live-display="prop"` |
| `x-data` + `x-for="(v,k) in obj"` | **`data-live-scope`** or **`live:scope`** (JSON) + **`<template data-live-for-each="path">`**; **`<span data-live-slot="key|value|index">`** in the template. Objects iterate key order; arrays iterate indices. Expansion runs at boot and after each root swap; ad-hoc re-run from JS is roadmap. |
| `x-for` + server round-trip lists | Flat snapshot props + Twig `{% for %}`, `data-live-args`, or matching flat `live:model.local` keys |
| Imperative Alpine stores | **Roadmap:** imperative `live:model.local` batch helpers on the same island |
| `x-on:click` that only touches JS | Small page/partial script today; general **`.local` actions** on `live:click` / `live:submit` are roadmap |

**Still roadmap (for closer parity):** DOM morph instead of swapping `[live-root]`, `wire:ignore`-style subtrees, multipart uploads, nested component trees, true `x-data`-style reactive expressions (today: JSON snapshot + one-shot template expansion at boot and after swap; patching `live:scope` JSON ad-hoc is awkward without a client hook).

## Done (baseline)

- **Three-way interaction model (local / live / lazy) — product rule** — The same three explicit modes are meant to apply to **everything** in Live (fields, clicks, form submit, future `live:keydown` / etc.), not only `live:model.*`:
  - **Local** — work stays in the browser until the user chooses a moment that triggers a round-trip (or never, if the feature is purely client-side).
  - **Live** — talk to the backend **immediately** (or with tight debouncing where needed), keep server state and HTML in sync.
  - **Lazy** — talk to the backend **later** (commit, blur, debounce window, explicit “flush”), not on every micro-interaction.
  Today, **`live:model.local` / `.live` / `.lazy`** are the first place this is fully expressed in markup; **`live:click`** effectively behaves like **live** (always POSTs on click). Generalizing `.local` / `.live` / `.lazy` (or equivalent) for **clicks, submits, and other actions** is roadmap work below.
- **Markup syntax:** root `[live-root]` + `live-state` / `live-url` / `live-csrf`; actions **`live:click="method"`** (colon attrs, same spirit as `wire:click`).
- **`live:args`** — optional JSON array on the action node; **`data-live-args`** is the same payload as a standard HTML data attribute; **`data-live-arg`** is a single JSON value and becomes a one-element `args` array (good for `loop.index0` in foreach). POST `args` → `ReflectionMethod::invokeArgs` (arity must match; no variadic).
- Signed snapshots (`Crypt`), CSRF on `/live/message`, config allowlist (`live.components`).
- Twig `live_mount()`, vanilla `resources/live.js`, lifecycle: `mount`, `hydrating` / `hydrated`, `updating` / `updated`, `dehydrate` + `dehydrating` / `dehydrated`, `render` / `rendered`.
- Single-pass `dehydrate` for snapshot + view data.
- **Tests** — PHPUnit in package: `Snapshot` round-trip + wrong `APP_KEY` rejects token (`composer test` in `live/`).
- **Validation** — `Component::validate()` + `LiveValidationException`; dispatcher responds with `Response::validationFailed()` (422, `errors`); `live.js` maps `errors` to `[live-error="field"]` nodes.
- **Forms** — `<form live:submit="method">` serializes named controls into JSON `merge`; `FormStateMerge` applies typed values to snapshot state before `hydrate()`, then the action runs (for file inputs see roadmap).
- **`live:model.*` (first-class three-way bindings)** — Same semantics as the rule above, for controls only (see **Near term** for clicks/submits):
  - **`live:model.local`** — no auto HTTP while editing; value merges on the next action from the DOM. Optional **`live-display="prop"`** sibling nodes in the same `[live-root]` get their `textContent` updated client-side as the local control changes (no request).
  - **`live:scope` / `data-live-scope`** — JSON on a container; **`<template data-live-for-each="dot.path">`** expands **object** keys or **array** elements into siblings; **`data-live-slot="key|value|index"`** fills text (**Alpine-like `x-for (value, key)`**). Runs on `document.body` at boot and after each root swap before **`initLiveBindings`** (see local examples).
  - **`live:model.live`** — debounced `input` / `change` → `sync: true` + `merge` → re-render, no component action.
  - **`live:model.lazy`** — `change` / commit → same sync path as `live`, different timing.
  - Model **lazy** is about binding latency; **Medium term** “lazy load” for components is unrelated.

## Near term
- **local / live / lazy for all directives** — Apply the same three modes to **`live:click`**, **`live:submit`**, and future event bindings (e.g. `live:keydown`): optional `.local` (queue / no request until flush), `.live` (immediate POST), `.lazy` (debounced or commit-based POST); align semantics and naming with `live:model.*` so the mental model is one system-wide.
- **Tests** — expand: `Dispatcher` + allowlist (bootstrapped app), lifecycle order with a stub component.
- **Docs** — install steps (route, config, Twig extension, sync JS), security notes, lifecycle table.
- **Redirect / non-HTML responses** — e.g. action returns `Response::redirect()`; JSON envelope signals full navigation or `Location` header.

## Medium term

- **DOM morphing** — optional morphdom (or similar) to reduce flicker vs replacing the `[live-root]` island.
- **Partial updates** — render only a named fragment/slot when requested (smaller payloads).
- **File uploads** — multipart requests + temporary snapshot or separate upload endpoint.
- **Lazy / deferred** — load component HTML after first paint (placeholder + second request).
- **Polling / refresh** — interval-driven re-fetch for time-sensitive UI.

## Longer term

- **Nested components** — stable IDs, multiple roots or tree in one snapshot (high complexity).
- **URL / query sync** — optional pushState or query params reflecting public state.
- **Dev tooling** — debug headers, timeline of lifecycle, optional strict mode.
- **Publish & versioning** — Packagist release, changelog, SemVer; remove reliance on path repo for adopters.
