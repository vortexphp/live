(function () {
    'use strict';

    /**
     * Root [live-root]: live-state, live-url, live-csrf
     * live:click="method" + optional live:args JSON array
     * live:submit="method" on <form> — serializes named fields into body.merge (scalar values only; files skipped)
     * live-error="fieldName" — validation messages for error validation_failed
     */
    var CLICK = '[live\\:click]';

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

    function replaceRoot(root, html) {
        var template = document.createElement('template');
        template.innerHTML = html.trim();
        var next = template.content.firstElementChild;
        if (next && root.parentNode) {
            root.parentNode.replaceChild(next, root);
        }
    }

    function readLiveContext(root) {
        return {
            state: root.getAttribute('live-state'),
            url: root.getAttribute('live-url'),
            csrf: root.getAttribute('live-csrf'),
        };
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

    function postLive(root, action, args, merge) {
        var ctx = readLiveContext(root);
        if (!ctx.state || !ctx.url || !ctx.csrf || !action) {
            return;
        }
        if (!Array.isArray(args)) {
            args = [];
        }
        if (!merge || typeof merge !== 'object') {
            merge = {};
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
                action: action,
                args: args,
                merge: merge,
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
        postLive(root, method, [], formDataToMerge(form));
    });
})();
