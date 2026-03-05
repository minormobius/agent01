// Bluesky handle typeahead — auto-attaches to inputs with [data-bsky-typeahead].
// Uses searchActorsTypeahead API. Injects its own styles using host page CSS vars.
(function () {
  var API = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead';
  var DEBOUNCE = 200;
  var LIMIT = 6;

  // Inject styles once
  var style = document.createElement('style');
  style.textContent =
    '.bsky-ta-wrap{position:relative;flex:1 1 35%;min-width:120px}' +
    '.bsky-ta-wrap input{width:100%;min-width:0}' +
    '.bsky-ta-drop{position:absolute;top:100%;left:0;right:0;background:var(--bg);' +
      'border:1px solid var(--rule);border-top:none;z-index:100;display:none;' +
      'max-height:280px;overflow-y:auto}' +
    '.bsky-ta-drop.open{display:block}' +
    '.bsky-ta-item{display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;' +
      'cursor:pointer;font-family:var(--mono);font-size:0.8rem}' +
    '.bsky-ta-item:hover,.bsky-ta-item.active{background:var(--rule)}' +
    '.bsky-ta-av{width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0}' +
    '.bsky-ta-av-ph{width:22px;height:22px;border-radius:50%;background:var(--rule);flex-shrink:0}' +
    '.bsky-ta-info{min-width:0;overflow:hidden}' +
    '.bsky-ta-name{color:var(--text);font-size:0.78rem;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '.bsky-ta-handle{color:var(--muted);font-size:0.65rem;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}';
  document.head.appendChild(style);

  function attach(input) {
    // Wrap input for positioning
    var wrap = document.createElement('div');
    wrap.className = 'bsky-ta-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var drop = document.createElement('div');
    drop.className = 'bsky-ta-drop';
    wrap.appendChild(drop);

    var timer = null;
    var activeIdx = -1;
    var actors = [];

    function render() {
      drop.innerHTML = '';
      for (var i = 0; i < actors.length; i++) {
        var a = actors[i];
        var item = document.createElement('div');
        item.className = 'bsky-ta-item' + (i === activeIdx ? ' active' : '');

        if (a.avatar) {
          var img = document.createElement('img');
          img.className = 'bsky-ta-av';
          img.src = a.avatar;
          img.alt = '';
          img.loading = 'lazy';
          item.appendChild(img);
        } else {
          var ph = document.createElement('div');
          ph.className = 'bsky-ta-av-ph';
          item.appendChild(ph);
        }

        var info = document.createElement('div');
        info.className = 'bsky-ta-info';
        if (a.displayName) {
          var name = document.createElement('div');
          name.className = 'bsky-ta-name';
          name.textContent = a.displayName;
          info.appendChild(name);
        }
        var handle = document.createElement('div');
        handle.className = 'bsky-ta-handle';
        handle.textContent = '@' + a.handle;
        info.appendChild(handle);
        item.appendChild(info);

        item.setAttribute('data-idx', i);
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectActor(actors[parseInt(this.getAttribute('data-idx'))]);
        });
        drop.appendChild(item);
      }
      drop.classList.toggle('open', actors.length > 0);
    }

    function selectActor(actor) {
      input.value = actor.handle;
      close();
      input.focus();
      // Fire input event so any listeners know the value changed
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function close() {
      actors = [];
      activeIdx = -1;
      drop.classList.remove('open');
    }

    function search(q) {
      if (q.length < 2) { close(); return; }
      fetch(API + '?q=' + encodeURIComponent(q) + '&limit=' + LIMIT)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          actors = data.actors || [];
          activeIdx = -1;
          render();
        })
        .catch(function () {});
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim().replace(/^@/, '');
      timer = setTimeout(function () { search(q); }, DEBOUNCE);
    });

    input.addEventListener('keydown', function (e) {
      if (!drop.classList.contains('open')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, actors.length - 1);
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        render();
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        e.stopPropagation();
        selectActor(actors[activeIdx]);
      } else if (e.key === 'Escape') {
        close();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(close, 120);
    });
  }

  // Auto-init on load
  document.querySelectorAll('[data-bsky-typeahead]').forEach(attach);
})();
