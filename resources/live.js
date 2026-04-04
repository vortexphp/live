(function () {
    'use strict';

    /**
     * Root [live-root]: live-state, live-url, live-csrf
     * live:click, live:args | live:submit (merge via FormData + live:model.* fields)
     * live:model.local — no auto POST; value ships on the next click/submit/sync from the DOM.
     *   Pair with live-display="prop" on another node to mirror the current control value in the DOM as the user edits.
     * live:model.live — debounced input → POST { sync:true, merge:{ prop: value } } (re-render, no action)
     * live:model.lazy — change → sync when the control commits (e.g. textarea/input after edit)
     * live-error="field" — validation_failed errors
     */
    var CLICK = '[live\\:click]';
    var MODEL_SEL = '[live\\:model\\.local], [live\\:model\\.live], [live\\:model\\.lazy]';

    function applyLiveErrors(root, errors) {
        var nodes = root.querySelectorAll('[live-error]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var field = el.getAttribute('live-error');
            if (!field) {
                el.textContent = '';
                continue;
            }
            var msg = errors[field];
            el.textContent = msg ? msg : '';
        }
    }

    function initLiveBindings(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        var nodes = root.querySelectorAll(MODEL_SEL);
        for (var i = 0; i < nodes.length; i++) {
            bindOneModel(root, nodes[i]);
        }
    }

    function replaceRoot(root, html) {
        var template = document.createElement('template');
        template.innerHTML = html.trim();
        var next = template.content.firstElementChild;
        if (next && root.parentNode) {
            root.parentNode.replaceChild(next, root);
            initLiveBindings(next);
        }
    }

    function readLiveContext(root) {
        return {
            state: root.getAttribute('live-state'),
            url: root.getAttribute('live-url'),
            csrf: root.getAttribute('live-csrf'),
        };
    }

    function getLiveModelBinding(el) {
        var loc = el.getAttribute('live:model.local');
        if (loc !== null && loc !== '') {
            return { mode: 'local', prop: loc };
        }
        var live = el.getAttribute('live:model.live');
        if (live !== null && live !== '') {
            return { mode: 'live', prop: live };
        }
        var lazy = el.getAttribute('live:model.lazy');
        if (lazy !== null && lazy !== '') {
            return { mode: 'lazy', prop: lazy };
        }
        return null;
    }

    function formatLocalDisplayValue(v) {
        if (v === null || v === undefined) {
            return '';
        }
        if (typeof v === 'boolean') {
            return v ? 'true' : 'false';
        }
        return String(v);
    }

    function updateLocalDomDisplays(root, prop, rawValue) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        var text = formatLocalDisplayValue(rawValue);
        var nodes = root.querySelectorAll('[live-display]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('live-display') === prop) {
                nodes[i].textContent = text;
            }
        }
    }

    function readControlValue(el) {
        var tag = el.tagName;
        if (tag === 'INPUT') {
            var type = (el.type || '').toLowerCase();
            if (type === 'checkbox') {
                return !!el.checked;
            }
            if (type === 'radio') {
                return el.checked ? el.value : null;
            }
            return el.value;
        }
        if (tag === 'TEXTAREA') {
            return el.value;
        }
        if (tag === 'SELECT') {
            return el.value;
        }
        return el.value != null ? String(el.value) : '';
    }

    function mergeFromBoundInside(container) {
        var nodes = container.querySelectorAll ? container.querySelectorAll(MODEL_SEL) : [];
        var out = {};
        for (var i = 0; i < nodes.length; i++) {
            var b = getLiveModelBinding(nodes[i]);
            if (!b) {
                continue;
            }
            var v = readControlValue(nodes[i]);
            if (v === null) {
                continue;
            }
            out[b.prop] = v;
        }
        return out;
    }

    function mergeModelFieldsFromRoot(root, base) {
        return Object.assign({}, mergeFromBoundInside(root), base || {});
    }

    function formDataToMerge(form) {
        var fd = new FormData(form);
        var merge = {};
        fd.forEach(function (value, name) {
            if (typeof File !== 'undefined' && value instanceof File) {
                return;
            }
            merge[name] = typeof value === 'string' ? value : String(value);
        });
        return merge;
    }

    function parseArgs(actionEl) {
        var raw = actionEl.getAttribute('live:args');
        if (raw === null || raw === '') {
            return [];
        }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function postLive(root, action, args, merge, options) {
        options = options || {};
        var sync = options.sync === true;
        var ctx = readLiveContext(root);
        if (!ctx.state || !ctx.url || !ctx.csrf) {
            return;
        }
        if (!sync && (!action || action === '')) {
            return;
        }
        if (!Array.isArray(args)) {
            args = [];
        }
        var userMerge = merge && typeof merge === 'object' ? merge : {};
        var mergePayload;
        if (sync) {
            mergePayload = userMerge;
        } else {
            mergePayload = mergeModelFieldsFromRoot(root, userMerge);
        }

        fetch(ctx.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                _csrf: ctx.csrf,
                snapshot: ctx.state,
                action: sync ? '' : action,
                args: args,
                merge: mergePayload,
                sync: sync,
            }),
            credentials: 'same-origin',
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { res: res, data: data };
                });
            })
            .then(function (result) {
                var data = result.data;
                if (!data || typeof data !== 'object') {
                    return;
                }
                if (data.ok === true && typeof data.html === 'string') {
                    replaceRoot(root, data.html);
                    return;
                }
                if (data.error === 'validation_failed' && data.errors && typeof data.errors === 'object') {
                    applyLiveErrors(root, data.errors);
                }
            })
            .catch(function () {});
    }

    function bindOneModel(root, el) {
        if (el.getAttribute('data-live-model-bound') === '1') {
            return;
        }
        el.setAttribute('data-live-model-bound', '1');

        var binding = getLiveModelBinding(el);
        if (!binding) {
            return;
        }

        if (binding.mode === 'local') {
            function pushLocalToDom() {
                updateLocalDomDisplays(root, binding.prop, readControlValue(el));
            }
            var tagLoc = el.tagName;
            var typeLoc = (el.type || '').toLowerCase();
            if (tagLoc === 'INPUT' && (typeLoc === 'checkbox' || typeLoc === 'radio')) {
                el.addEventListener('change', pushLocalToDom);
            } else if (tagLoc === 'SELECT') {
                el.addEventListener('change', pushLocalToDom);
            } else {
                el.addEventListener('input', pushLocalToDom);
                el.addEventListener('change', pushLocalToDom);
            }
            pushLocalToDom();
            return;
        }

        if (binding.mode === 'live') {
            var debounceMs = 220;
            var timer = null;
            var syncField = function () {
                var payload = {};
                payload[binding.prop] = readControlValue(el);
                postLive(root, '', [], payload, { sync: true });
            };
            var tag = el.tagName;
            var type = (el.type || '').toLowerCase();
            if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
                el.addEventListener('change', syncField);
            } else if (tag === 'SELECT') {
                el.addEventListener('change', syncField);
            } else {
                el.addEventListener('input', function () {
                    clearTimeout(timer);
                    timer = setTimeout(syncField, debounceMs);
                });
            }
            return;
        }

        if (binding.mode === 'lazy') {
            var lazySync = function () {
                var pl = {};
                pl[binding.prop] = readControlValue(el);
                if (pl[binding.prop] === null) {
                    return;
                }
                postLive(root, '', [], pl, { sync: true });
            };
            var tagL = el.tagName;
            var typeL = (el.type || '').toLowerCase();
            if (tagL === 'INPUT' && (typeL === 'checkbox' || typeL === 'radio')) {
                el.addEventListener('change', lazySync);
            } else if (tagL === 'SELECT') {
                el.addEventListener('change', lazySync);
            } else {
                el.addEventListener('change', lazySync);
            }
        }
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }
        var actionEl = target.closest(CLICK);
        if (!actionEl) {
            return;
        }
        var root = actionEl.closest('[live-root]');
        if (!root) {
            return;
        }

        var method = actionEl.getAttribute('live:click');
        var args = parseArgs(actionEl);
        if (args === null) {
            return;
        }

        event.preventDefault();
        postLive(root, method, args, {});
    });

    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || form.nodeName !== 'FORM' || !form.getAttribute) {
            return;
        }
        var method = form.getAttribute('live:submit');
        if (!method) {
            return;
        }
        var root = form.closest('[live-root]');
        if (!root) {
            return;
        }
        event.preventDefault();
        var merge = Object.assign({}, mergeFromBoundInside(form), formDataToMerge(form));
        postLive(root, method, [], merge);
    });

    function boot() {
        var roots = document.querySelectorAll('[live-root]');
        for (var i = 0; i < roots.length; i++) {
            initLiveBindings(roots[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
