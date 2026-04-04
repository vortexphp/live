/**
 * vortexphp/live — client runtime (one file, no bundler).
 * Product: Livewire-like POST + snapshot + actions; Alpine-like live:model.local, live-display,
 * live:scope templates — see live/ROADMAP.md.
 *
 * Architecture (top → bottom):
 *   SEL                    — attribute / selector constants
 *   Controls               — read/write form controls, FormData → merge
 *   Context                — [live-root], snapshot URL + CSRF
 *   Binding meta           — live:model.* detection, merge from DOM
 *   Validation UI          — live-error nodes; live:error-class on inputs
 *   Local mirrors          — live-display text sync
 *   Conditional visibility  — live:show / live:hide from bound prop truthiness
 *   Scope templates        — live:scope + <template live:for-each>
 *   Transport              — parseArgs, POST /live/message, replaceRoot; loading (live:panel + live:busy-class)
 *   Model binders          — bindOneModel, initLiveBindings
 *   Document events        — delegated click (+ live:exit) + submit
 *   Boot                   — DOMContentLoaded
 */

(function () {
    'use strict';

    // --- SEL -------------------------------------------------------------------

    var SEL = {
        CLICK: '[live\\:click]',
        MODEL: '[live\\:model\\.local], [live\\:model\\.live], [live\\:model\\.lazy]',
        SCOPE: '[live\\:scope]',
        SHOW: '[live\\:show]',
        HIDE: '[live\\:hide]',
    };

    var templateUid = 0;

    function prefersReducedMotion() {
        try {
            return (
                window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches
            );
        } catch (e) {
            return false;
        }
    }

    // --- Controls -------------------------------------------------------------

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

    // --- Context --------------------------------------------------------------

    function readLiveContext(root) {
        return {
            state: root.getAttribute('live-state'),
            url: root.getAttribute('live-url'),
            csrf: root.getAttribute('live-csrf'),
        };
    }

    // --- Binding meta ---------------------------------------------------------

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

    function mergeFromBoundInside(container) {
        var nodes = container.querySelectorAll ? container.querySelectorAll(SEL.MODEL) : [];
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

    // --- Validation UI --------------------------------------------------------

    function findLiveModelControlsForField(root, field) {
        if (!root || !field || !root.querySelectorAll) {
            return [];
        }
        var p = String(field).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var sel =
            '[live\\:model\\.local="' +
            p +
            '"],[live\\:model\\.live="' +
            p +
            '"],[live\\:model\\.lazy="' +
            p +
            '"]';
        var nodes = root.querySelectorAll(sel);
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var tag = n.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                out.push(n);
            }
        }
        return out;
    }

    function liveErrorClassTokens(el) {
        var raw = el.getAttribute('live:error-class');
        if (raw == null || String(raw).trim() === '') {
            return [];
        }
        return String(raw)
            .trim()
            .split(/\s+/)
            .filter(function (t) {
                return t !== '';
            });
    }

    function applyLiveErrorFieldState(root, field, hasError) {
        var controls = findLiveModelControlsForField(root, field);
        for (var i = 0; i < controls.length; i++) {
            var c = controls[i];
            var tokens = liveErrorClassTokens(c);
            for (var t = 0; t < tokens.length; t++) {
                if (hasError) {
                    c.classList.add(tokens[t]);
                } else {
                    c.classList.remove(tokens[t]);
                }
            }
            if (hasError) {
                c.setAttribute('aria-invalid', 'true');
            } else {
                c.removeAttribute('aria-invalid');
            }
        }
    }

    function applyLiveErrors(root, errors) {
        errors = errors && typeof errors === 'object' ? errors : {};
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
            var bad = !!(msg && String(msg).trim() !== '');
            applyLiveErrorFieldState(root, field, bad);
        }
    }

    var LIVE_SERVER_ERR_ID = 'live-server-error-banner';

    function clearLiveServerError(root) {
        if (!root || !root.querySelector) {
            return;
        }
        var wrap = root.querySelector('#' + LIVE_SERVER_ERR_ID);
        if (wrap) {
            wrap.parentNode.removeChild(wrap);
        }
    }

    function friendlyLiveServerMessage(raw) {
        if (raw == null) {
            return '';
        }
        var s = String(raw);
        if (/SQLSTATE|PDOException|Integrity constraint|syntax error/i.test(s)) {
            return 'Could not save your changes. Please try again.';
        }
        if (s.length > 280) {
            return s.slice(0, 277) + '…';
        }
        return s;
    }

    function showLiveServerError(root, rawMessage) {
        if (!root || !root.querySelector) {
            return;
        }
        clearLiveServerError(root);
        var text = friendlyLiveServerMessage(rawMessage);
        if (!text) {
            text = 'Something went wrong. Please try again.';
        }
        var wrap = document.createElement('div');
        wrap.id = LIVE_SERVER_ERR_ID;
        wrap.setAttribute('role', 'alert');
        wrap.className =
            'mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200';
        wrap.textContent = text;
        root.insertBefore(wrap, root.firstChild);
    }

    // --- Local mirrors (live-display) ----------------------------------------

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

    function isLiveTruthy(raw) {
        if (raw === null || raw === undefined) {
            return false;
        }
        if (raw === false) {
            return false;
        }
        if (typeof raw === 'string' && raw.trim() === '') {
            return false;
        }
        if (typeof raw === 'number' && raw === 0) {
            return false;
        }
        return true;
    }

    function syncLiveShowHideForProp(root, prop) {
        if (!root || !prop) {
            return;
        }
        var nodes = root.querySelectorAll(SEL.SHOW + ', ' + SEL.HIDE);
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var sp = el.getAttribute('live:show');
            var hp = el.getAttribute('live:hide');
            if (sp === prop) {
                var v = readLocalSingleProp(root, prop);
                el.hidden = !isLiveTruthy(v);
            }
            if (hp === prop) {
                var v2 = readLocalSingleProp(root, prop);
                el.hidden = isLiveTruthy(v2);
            }
        }
    }

    function syncLiveShowHide(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        var props = {};
        var nodes = root.querySelectorAll(SEL.SHOW + ', ' + SEL.HIDE);
        for (var i = 0; i < nodes.length; i++) {
            var sp = nodes[i].getAttribute('live:show');
            var hp = nodes[i].getAttribute('live:hide');
            if (sp) {
                props[sp] = true;
            }
            if (hp) {
                props[hp] = true;
            }
        }
        for (var p in props) {
            if (Object.prototype.hasOwnProperty.call(props, p)) {
                syncLiveShowHideForProp(root, p);
            }
        }
    }

    // --- Local read helpers (live:show / live:hide) ---------------------------

    function queryLocalByProp(root, prop) {
        var nodes = root.querySelectorAll('[live\\:model\\.local]');
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('live:model.local') === prop) {
                out.push(nodes[i]);
            }
        }
        return out;
    }

    function readLocalSingleProp(root, prop) {
        var nodes = queryLocalByProp(root, prop);
        if (!nodes.length) {
            return undefined;
        }
        var first = nodes[0];
        var tag = first.tagName;
        var type = (first.type || '').toLowerCase();
        if (tag === 'INPUT' && type === 'radio') {
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].checked) {
                    return nodes[i].value;
                }
            }
            return null;
        }
        return readControlValue(first);
    }

    // --- Scope templates (live:scope) ------------------------------------------

    function formatScopeValue(v) {
        if (v === null || v === undefined) {
            return '';
        }
        if (typeof v === 'object') {
            try {
                return JSON.stringify(v);
            } catch (e) {
                return String(v);
            }
        }
        return String(v);
    }

    function fillScopeSlots(frag, key, value, index) {
        var nodes = frag.querySelectorAll('[live\\:slot]');
        for (var i = 0; i < nodes.length; i++) {
            var slot = nodes[i].getAttribute('live:slot');
            if (!slot) {
                continue;
            }
            var text = '';
            if (slot === 'value') {
                text = formatScopeValue(value);
            } else if (slot === 'key' || slot === 'name' || slot === 'label') {
                text = String(key);
            } else if (slot === 'index') {
                text = String(index);
            } else {
                continue;
            }
            nodes[i].textContent = text;
        }
    }

    function resolveScopePath(data, path) {
        if (!data || typeof data !== 'object' || !path) {
            return null;
        }
        var parts = path.split('.');
        var cur = data;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') {
                return null;
            }
            cur = cur[parts[i]];
        }
        return cur;
    }

    function stripTemplateClones(template) {
        var tid = template.getAttribute('data-live-template-id');
        if (!tid) {
            return;
        }
        var parent = template.parentNode;
        if (!parent) {
            return;
        }
        var n = template.nextSibling;
        while (n) {
            var next = n.nextSibling;
            if (n.nodeType !== 1) {
                n = next;
                continue;
            }
            if (n.getAttribute('data-live-from-template') === tid) {
                parent.removeChild(n);
                n = next;
                continue;
            }
            break;
        }
    }

    function expandDataLiveForTemplate(template, scopeData) {
        var path = template.getAttribute('live:for-each');
        if (!path) {
            return;
        }
        var obj = resolveScopePath(scopeData, path);
        if (obj == null || typeof obj !== 'object') {
            return;
        }
        var parent = template.parentNode;
        if (!parent) {
            return;
        }
        var tid = template.getAttribute('data-live-template-id');
        if (!tid) {
            tid = 'live-tpl-' + ++templateUid;
            template.setAttribute('data-live-template-id', tid);
        }
        stripTemplateClones(template);

        var last = template;
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
                var frag = document.importNode(template.content, true);
                fillScopeSlots(frag, String(i), obj[i], i);
                var ins = frag.firstElementChild;
                if (ins) {
                    ins.setAttribute('data-live-from-template', tid);
                }
                parent.insertBefore(frag, last.nextSibling);
                last = frag.lastElementChild || last;
            }
        } else {
            var keys = Object.keys(obj);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                var frag2 = document.importNode(template.content, true);
                fillScopeSlots(frag2, k, obj[k], j);
                var ins2 = frag2.firstElementChild;
                if (ins2) {
                    ins2.setAttribute('data-live-from-template', tid);
                }
                parent.insertBefore(frag2, last.nextSibling);
                last = frag2.lastElementChild || last;
            }
        }
    }

    function readScopePayload(holder) {
        var raw = holder.getAttribute('live:scope');
        if (raw == null || String(raw).trim() === '') {
            return null;
        }
        try {
            var data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : null;
        } catch (e) {
            return null;
        }
    }

    function expandLiveScopesIn(container) {
        if (!container || !container.querySelectorAll) {
            return;
        }
        var holders = container.querySelectorAll(SEL.SCOPE);
        for (var h = 0; h < holders.length; h++) {
            var holder = holders[h];
            var data = readScopePayload(holder);
            if (!data) {
                continue;
            }
            var templates = holder.querySelectorAll('template[live\\:for-each]');
            for (var t = 0; t < templates.length; t++) {
                expandDataLiveForTemplate(templates[t], data);
            }
        }
    }

    // --- Transport ------------------------------------------------------------

    function parseArgs(actionEl) {
        var liveRaw = actionEl.getAttribute('live:args');
        if (liveRaw !== null && String(liveRaw).trim() !== '') {
            try {
                var parsed = JSON.parse(liveRaw);
                return Array.isArray(parsed) ? parsed : null;
            } catch (e) {
                return null;
            }
        }
        return [];
    }

    function captureLiveFocusMeta(root) {
        var active = document.activeElement;
        if (!active || !root.contains(active)) {
            return null;
        }
        var tag = active.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
            return null;
        }
        var binding = getLiveModelBinding(active);
        return {
            tag: tag,
            bindingProp: binding ? binding.prop : null,
            id: active.id || '',
            selStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
            selEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
        };
    }

    function restoreLiveFocus(next, meta) {
        if (!meta || !next || !next.querySelector) {
            return;
        }
        var el = null;
        if (meta.bindingProp) {
            var p = meta.bindingProp.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            el = next.querySelector(
                '[live\\:model\\.local="' +
                    p +
                    '"],[live\\:model\\.live="' +
                    p +
                    '"],[live\\:model\\.lazy="' +
                    p +
                    '"]',
            );
        }
        if (!el && meta.id) {
            var cand = document.getElementById(meta.id);
            if (cand && next.contains(cand)) {
                el = cand;
            }
        }
        if (!el || el.tagName !== meta.tag) {
            return;
        }
        el.focus();
        if (
            meta.selStart != null &&
            meta.selEnd != null &&
            typeof el.setSelectionRange === 'function'
        ) {
            try {
                el.setSelectionRange(meta.selStart, meta.selEnd);
            } catch (e) {}
        }
    }

    function replaceRoot(root, html) {
        var focusMeta = captureLiveFocusMeta(root);
        var template = document.createElement('template');
        template.innerHTML = html.trim();
        var next = template.content.firstElementChild;
        if (next && root.parentNode) {
            root.parentNode.replaceChild(next, root);
            expandLiveScopesIn(next);
            initLiveBindings(next);
            restoreLiveFocus(next, focusMeta);
        }
    }

    var LIVE_LOADING_SURFACE_CLASS = 'live-loading-surface';

    function liveLoadingSurfaceEl(root) {
        if (!root || !root.querySelector) {
            return null;
        }
        var marked = root.querySelector('[live\\:panel]');
        if (marked && marked.nodeType === 1) {
            return marked;
        }
        if (root.firstElementChild && root.firstElementChild.nodeType === 1) {
            return root.firstElementChild;
        }
        return null;
    }

    function adjustLiveRootLoading(root, delta) {
        if (!root || !root.setAttribute || delta === 0) {
            return;
        }
        var cur = parseInt(root.getAttribute('live:requests') || '0', 10);
        if (isNaN(cur)) {
            cur = 0;
        }
        cur = Math.max(0, cur + delta);
        root.setAttribute('live:requests', String(cur));
        var surface = liveLoadingSurfaceEl(root);
        if (cur > 0) {
            root.setAttribute('aria-busy', 'true');
            if (surface && surface.classList) {
                surface.classList.add(LIVE_LOADING_SURFACE_CLASS);
            }
        } else {
            root.removeAttribute('aria-busy');
            root.removeAttribute('live:requests');
            if (surface && surface.classList) {
                surface.classList.remove(LIVE_LOADING_SURFACE_CLASS);
            }
        }
    }

    function readLiveBusyFromElement(el) {
        if (!el || !el.getAttribute) {
            return { busyEl: null, busyClass: '' };
        }
        var cls = el.getAttribute('live:busy-class');
        if (cls == null || String(cls).trim() === '') {
            return { busyEl: null, busyClass: '' };
        }
        return { busyEl: el, busyClass: String(cls).trim() };
    }

    function readLiveBusyFromForm(form, submitEvent) {
        if (!form || !form.getAttribute) {
            return { busyEl: null, busyClass: '' };
        }
        var cls = form.getAttribute('live:busy-class');
        if (cls == null || String(cls).trim() === '') {
            return { busyEl: null, busyClass: '' };
        }
        var busyClass = String(cls).trim();
        var submitter =
            submitEvent &&
            typeof submitEvent.submitter !== 'undefined' &&
            submitEvent.submitter
                ? submitEvent.submitter
                : null;
        var busyEl = submitter && submitter.form === form ? submitter : null;
        if (!busyEl) {
            busyEl = form.querySelector('button[type="submit"]');
        }
        if (!busyEl) {
            busyEl = form.querySelector('[type="submit"]');
        }
        return { busyEl: busyEl, busyClass: busyClass };
    }

    function postLive(root, action, args, merge, options) {
        options = options || {};
        var sync = options.sync === true;
        var skipLoading = options.skipLoading === true || sync === true;
        var busyEl = options.busyEl || null;
        var busyClass =
            options.busyClass && String(options.busyClass).trim() !== ''
                ? String(options.busyClass).trim()
                : '';
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

        if (!skipLoading) {
            adjustLiveRootLoading(root, 1);
        }
        if (busyEl && busyClass) {
            busyEl.classList.add.apply(busyEl.classList, busyClass.split(/\s+/).filter(Boolean));
        }

        function finishRequest() {
            if (!skipLoading) {
                adjustLiveRootLoading(root, -1);
            }
            if (busyEl && busyClass && busyEl.classList) {
                var tokens = busyClass.split(/\s+/).filter(Boolean);
                for (var bi = 0; bi < tokens.length; bi++) {
                    busyEl.classList.remove(tokens[bi]);
                }
            }
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
                return res.text().then(function (text) {
                    var data = null;
                    if (text) {
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            data = {
                                ok: false,
                                error: 'invalid_response',
                                message: text.length > 200 ? text.slice(0, 200) + '…' : text,
                            };
                        }
                    }
                    return { res: res, data: data };
                });
            })
            .then(function (result) {
                var data = result.data;
                var res = result.res;
                if (!res.ok && (!data || typeof data !== 'object')) {
                    showLiveServerError(
                        root,
                        'Request failed (' + res.status + '). Please try again.',
                    );
                    return;
                }
                if (!data || typeof data !== 'object') {
                    showLiveServerError(root, '');
                    return;
                }
                if (data.ok === true && typeof data.redirect === 'string' && data.redirect !== '') {
                    window.location.assign(data.redirect);
                    return;
                }
                if (data.ok === true && typeof data.html === 'string') {
                    replaceRoot(root, data.html);
                    return;
                }
                if (data.error === 'validation_failed' && data.errors && typeof data.errors === 'object') {
                    clearLiveServerError(root);
                    applyLiveErrors(root, data.errors);
                    return;
                }
                if (data.ok === false) {
                    var msg =
                        typeof data.message === 'string' && data.message !== ''
                            ? data.message
                            : typeof data.error === 'string'
                              ? data.error
                              : '';
                    showLiveServerError(root, msg);
                    return;
                }
            })
            .catch(function () {
                showLiveServerError(root, 'Network error. Check your connection and try again.');
            })
            .finally(finishRequest);
    }

    // --- Model binders ---------------------------------------------------------

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
                syncLiveShowHideForProp(root, binding.prop);
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
            function tickShowHide() {
                syncLiveShowHideForProp(root, binding.prop);
            }
            var syncField = function () {
                var payload = {};
                payload[binding.prop] = readControlValue(el);
                postLive(root, '', [], payload, { sync: true });
            };
            var tag = el.tagName;
            var type = (el.type || '').toLowerCase();
            if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
                el.addEventListener('change', function () {
                    tickShowHide();
                    syncField();
                });
            } else if (tag === 'SELECT') {
                el.addEventListener('change', function () {
                    tickShowHide();
                    syncField();
                });
            } else {
                el.addEventListener('input', function () {
                    tickShowHide();
                    clearTimeout(timer);
                    timer = setTimeout(syncField, debounceMs);
                });
            }
            return;
        }

        if (binding.mode === 'lazy') {
            var lazySync = function () {
                syncLiveShowHideForProp(root, binding.prop);
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

    function initLiveBindings(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        var nodes = root.querySelectorAll(SEL.MODEL);
        for (var i = 0; i < nodes.length; i++) {
            bindOneModel(root, nodes[i]);
        }
        syncLiveShowHide(root);
    }

    function handleLiveDocumentClick(event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }
        var actionEl = target.closest(SEL.CLICK);
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

        var clickBusy = readLiveBusyFromElement(actionEl);

        var exitSelRaw = actionEl.getAttribute('live:exit');
        if (exitSelRaw != null && String(exitSelRaw).trim() !== '') {
            var exitNode = actionEl.closest(String(exitSelRaw).trim());
            if (exitNode && root.contains(exitNode)) {
                if (prefersReducedMotion()) {
                    postLive(root, method, args, {}, clickBusy);
                    return;
                }
                var exitClassRaw = actionEl.getAttribute('live:exit-class');
                var exitClass =
                    exitClassRaw != null && String(exitClassRaw).trim() !== ''
                        ? String(exitClassRaw).trim()
                        : 'live-exit-pending';
                exitNode.classList.add(exitClass);
                var finished = false;
                var maxWaitMs = 500;
                function done() {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    window.clearTimeout(failSafe);
                    exitNode.removeEventListener('animationend', onAnimEnd);
                    postLive(root, method, args, {}, clickBusy);
                }
                function onAnimEnd(e) {
                    if (e.target !== exitNode) {
                        return;
                    }
                    done();
                }
                var failSafe = window.setTimeout(done, maxWaitMs);
                exitNode.addEventListener('animationend', onAnimEnd);
                return;
            }
        }

        postLive(root, method, args, {}, clickBusy);
    }

    function handleLiveDocumentSubmit(event) {
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
        var formBusy = readLiveBusyFromForm(form, event);
        postLive(root, method, [], merge, formBusy);
    }

    document.addEventListener('click', handleLiveDocumentClick);
    document.addEventListener('submit', handleLiveDocumentSubmit);

    function boot() {
        expandLiveScopesIn(document.body);
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
