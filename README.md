# vortexphp/live

Server-driven Live components (Livewire-style POST + signed snapshot) with a small vanilla client runtime (`resources/live.js`). Public markup uses the `live:*` attribute namespace documented below.

For product direction and parity notes, see [ROADMAP.md](ROADMAP.md).

## Installation

- Require **`vortexphp/framework` ^0.12** and this package.
- Allowlist component FQCNs in app config (`live.components`).
- Register **`Vortex\Live\LivePackage`** in **`config/app.php`** under **`packages`** (it adds the `live_mount` Twig extension and `POST /live/message`).
- Publish the client script: **`php vortex publish:assets`** (declared by **`LivePackage::publicAssets()`** → `public/js/live.js`). Run after **`composer install/update`**, or add a Composer script that calls it.

**Config (example)**

```php
// config/app.php (merge)
'packages' => [
    \Vortex\Live\LivePackage::class,
],

// config/live.php
return [
    'components' => [
        \Vortex\vortex\app\Components\Live\Counter::class,
    ],
];
```

**Layout**

```html
<script src="/js/live.js" defer></script>
```

(`publish:assets` places `resources/live.js` there.)

If you do not use application packages, register **`Vortex\Live\Twig\LiveExtension`** via **`app.twig_extensions`**, wire **`POST /live/message`** to **`LiveController::message`**, and copy **`resources/live.js`** into **`public/js/`** yourself.

## Component island (server-rendered root)

`live_mount('App\\Live\\Components\\MyComponent', props)` wraps the view in a root element with:


| Attribute    | Purpose                                                  |
| ------------ | -------------------------------------------------------- |
| `live-root`  | Marks the island boundary.                               |
| `live-state` | Signed snapshot token (HMAC).                            |
| `live-url`   | POST endpoint for actions / sync (e.g. `/live/message`). |
| `live-csrf`  | CSRF token for POST JSON body.                           |


**Twig**

```twig
{{ live_mount('App\\Live\\Components\\Counter', { count: 0 }) }}
```

**Rough HTML shape** (attributes are emitted by PHP; don’t paste `live-state` by hand)

```html
<div class="live-root" live-root live-state="…" live-url="/live/message" live-csrf="…">
  {# your component twig #}
</div>
```

All `live:click`, `live:submit`, and `live:model.live` / `live:model.lazy` behavior applies **inside** this subtree.

## Actions (server)


| Syntax                     | Meaning                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `live:click="methodName"`  | On click, POST `action: methodName` with `args` from `live:args`. Element must be inside `[live-root]`.           |
| `live:submit="methodName"` | On form submit, POST that action; merge includes bound fields + `FormData`.                                       |
| `live:args='[1,"a"]'`      | Optional JSON **array** only. Invalid JSON or non-array → action is not sent. Single argument: `live:args='[0]'`. |


Methods are invoked on the PHP component with `ReflectionMethod::invokeArgs` — arity must match.

**Button + args**

```html
<button type="button" live:click="increment">+1</button>
<button type="button" live:click="add" live:args="[5]">+5</button>
<button type="button" live:click="pickRow" live:args='[0]'>First row</button>
```

**Twig loop**

```twig
{% for item in items %}
  <button type="button" live:click="remove" live:args='[{{ item.id }}]'>Remove</button>
{% endfor %}
```

**Form**

```html
<form live:submit="save">
  <input name="title" />
  <button type="submit">Save</button>
</form>
```

## Model binding modes


| Attribute                 | Behavior                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `live:model.local="prop"` | Client-only until the next server round-trip; value is merged from the DOM when an action/submit/sync runs. |
| `live:model.live="prop"`  | Debounced `POST` with `sync: true` (re-render, no named action).                                            |
| `live:model.lazy="prop"`  | Sync on `change` / commit-style events.                                                                     |


Supported controls: `input` (text, checkbox, radio, number, …), `textarea`, `select`.

**Examples**

```html
<input type="text" live:model.live="title" value="{{ title }}" />
<textarea live:model.lazy="body">{{ body }}</textarea>
<input type="checkbox" live:model.local="agree" />
<select live:model.local="theme">
  <option value="light">Light</option>
  <option value="dark">Dark</option>
</select>
```

## Validation


| Syntax                   | Meaning                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `live-error="fieldName"` | Node whose `textContent` is filled when the server returns `validation_failed` + `errors[fieldName]`. |


**Example**

```html
<form live:submit="save" novalidate>
  <textarea live:model.lazy="note" name="note"></textarea>
  <p live-error="note"></p>
  <button type="submit">Save</button>
</form>
```

## Local mirrors


| Syntax                | Meaning                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `live-display="prop"` | Text node mirroring the formatted value of `live:model.local="prop"` on the same island (updated as the user types). |


**Example**

```html
<input type="text" live:model.local="scratch" value="" />
<span live-display="scratch"></span>
```

## Conditional visibility (`live:show` / `live:hide`)

Inside a **`live-root`** island, toggle `hidden` from the current value of any bound property (`live:model.local` | `.live` | `.lazy` with the same name).

| Syntax | Meaning |
|--------|---------|
| `live:show="prop"` | Visible when `prop` is **truthy** (non-empty string, non-zero number, `true`, checked checkbox, etc.). |
| `live:hide="prop"` | Hidden when `prop` is **truthy**. |

Use **one** of the two per element (not both on the same node). Updates run when the bound control changes and once after bindings init.

**Falsy:** `null`, `undefined`, `false`, `''` / whitespace-only string, `0`.

**Example**

```html
<input type="checkbox" live:model.local="agree" />
<div live:show="agree">Thanks for agreeing.</div>
<div live:hide="agree">Please check the box.</div>
```

## Scope templates (JSON in DOM)


| Attribute                               | Meaning                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `live:scope='{"path":{"nested":true}}'` | JSON object on a container.                                                       |
| `<template live:for-each="dot.path">`   | For each object key or array index at `path`, clone template content as siblings. |
| `live:slot="key"` | `value` | `index`   | Text slots inside the cloned row.                                                 |


Runs on load and after each Live HTML swap on the new root. Add `live:model.local` inside cloned nodes if you need bindings.

**Example**

```html
<ul live:scope='{"car":{"make":"Jeep","model":"Wrangler"}}'>
  <template live:for-each="car">
    <li><span live:slot="key"></span>: <span live:slot="value"></span></li>
  </template>
</ul>
```

### Arrays / lists in local state

There is no single `live:model` for a JSON array. Use one of:

1. **Flat props** — `item0_title`, `item1_title`, … plus Twig `{% for %}` and `live:model.local="item{{ i }}_title"`.
2. **`live:scope` JSON** — client-side templated list; good for display/expansion; binding to snapshot still uses flat props if you merge to the server.

**Twig: fixed slots**

```twig
{% for i in 0..2 %}
  <input type="text" live:model.local="row{{ i }}_label" value="{{ attribute(_context, 'row' ~ i ~ '_label') }}" />
{% endfor %}
```

## Internal attributes (do not hand-author)

The runtime may set `data-live-model-bound`, `data-live-template-id`, and `data-live-from-template` on nodes it manages.

## Source file

- Client: `resources/live.js` (single IIFE, no bundler).

