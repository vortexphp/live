# vortexphp/live — roadmap

Ordered by impact. Items are proposals, not commitments.

## Done (baseline)

- **Markup syntax:** root `[live-root]` + `live-state` / `live-url` / `live-csrf`; actions **`live:click="method"`** (colon attrs, same spirit as `wire:click`).
- Signed snapshots (`Crypt`), CSRF on `/live/message`, config allowlist (`live.components`).
- Twig `live_mount()`, vanilla `resources/live.js`, lifecycle: `mount`, `hydrating` / `hydrated`, `updating` / `updated`, `dehydrate` + `dehydrating` / `dehydrated`, `render` / `rendered`.
- Single-pass `dehydrate` for snapshot + view data.

## Near term

- **Validation** — return 422 + field errors from actions or a dedicated validate step; surface errors in HTML or JSON for JS to show.
- **Tests** — PHPUnit: `Snapshot` round-trip, `Dispatcher` allowlist + bad MAC, lifecycle call order with a stub component.
- **Docs** — install steps (route, config, Twig extension, sync JS), security notes, lifecycle table.
- **`args` in request body** — map JSON `args` to action parameters (typed or validated) instead of zero-arg-only.
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
