(function () {
    'use strict';

    /**
     * Live syntax (Livewire-style colon actions)
     *
     * Root [live-root]:
     *   live-state   signed snapshot
     *   live-url     POST endpoint
     *   live-csrf    token
     *
     * Actions (colon requires CSS escape in selectors):
     *   live:click="methodName"
     */
    var CLICK = '[live\\:click]';

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

        var state = root.getAttribute('live-state');
        var url = root.getAttribute('live-url');
        var csrf = root.getAttribute('live-csrf');
        var method = actionEl.getAttribute('live:click');
        if (!state || !url || !csrf || !method) {
            return;
        }

        event.preventDefault();

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                _csrf: csrf,
                snapshot: state,
                action: method,
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
