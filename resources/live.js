(function () {
    'use strict';

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }
        var actionEl = target.closest('[data-live-action]');
        if (!actionEl) {
            return;
        }
        var root = actionEl.closest('[data-live-root]');
        if (!root) {
            return;
        }

        var snapshot = root.getAttribute('data-live-snapshot');
        var endpoint = root.getAttribute('data-live-endpoint');
        var csrf = root.getAttribute('data-live-csrf');
        var action = actionEl.getAttribute('data-live-action');
        if (!snapshot || !endpoint || !csrf || !action) {
            return;
        }

        event.preventDefault();

        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                _csrf: csrf,
                snapshot: snapshot,
                action: action,
                args: [],
            }),
            credentials: 'same-origin',
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok || !result.data || !result.data.ok || typeof result.data.html !== 'string') {
                    return;
                }
                var template = document.createElement('template');
                template.innerHTML = result.data.html.trim();
                var next = template.content.firstElementChild;
                if (next && root.parentNode) {
                    root.parentNode.replaceChild(next, root);
                }
            })
            .catch(function () {});
    });
})();
