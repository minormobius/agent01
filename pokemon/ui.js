// ui.js — mobile-first wrapper around the existing browser game.
//
// The on-screen d-pad / A / B / START buttons synthesise writes into
// Game.keys + Game.keyPressed so they're indistinguishable from a real
// keyboard. A REC toggle redirects taps into the script editor instead;
// RUN replays the script by holding the matching keys for tile-aligned
// durations. POST opens a Bluesky compose window prefilled with the
// script + a self-link that loads the script back via ?s=...
//
// No game-engine code is touched here — game.js owns the runloop.

(function () {
  // -------------------- DOM refs --------------------------------------------
  const dpad      = document.getElementById('dpad');
  const ab        = document.getElementById('ab');
  const scriptEl  = document.getElementById('script');
  const recBtn    = document.getElementById('rec-btn');
  const runBtn    = document.getElementById('run-btn');
  const resetBtn  = document.getElementById('reset-btn');
  const postBtn   = document.getElementById('post-btn');
  const statusEl  = document.getElementById('status');

  // -------------------- Token <-> physical key ------------------------------
  // keys are what game.js getInput()/getHeld() reads from Game.keys[].
  const KEY_FOR_TOKEN = {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    z: 'z', x: 'x', start: 'Enter', confirm: 'z', cancel: 'x',
  };
  const TOKEN_FOR_KEY = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    z: 'z', x: 'x', Enter: 'start', ' ': 'z',
  };

  function setStatus(msg) { statusEl.textContent = msg; }

  // -------------------- REC toggle ------------------------------------------
  let recording = false;
  recBtn.addEventListener('click', () => {
    recording = !recording;
    recBtn.classList.toggle('on', recording);
    recBtn.setAttribute('aria-pressed', String(recording));
    setStatus(recording
      ? 'REC on — taps append to the script (game ignores them)'
      : 'tap A or START to begin');
  });

  // -------------------- D-pad / button input --------------------------------
  function bindButtons(container) {
    container.querySelectorAll('button[data-key]').forEach((btn) => {
      const key = btn.dataset.key;
      const press = (e) => {
        e.preventDefault();
        if (recording) {
          appendToken(TOKEN_FOR_KEY[key] || key);
          btn.classList.add('held');
          setTimeout(() => btn.classList.remove('held'), 100);
        } else {
          Game.keys[key] = true;
          Game.keyPressed[key] = true;
        }
      };
      const release = (e) => {
        e.preventDefault();
        if (!recording) Game.keys[key] = false;
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }
  bindButtons(dpad);
  bindButtons(ab);

  // -------------------- Append-to-script with run-length collapsing --------
  function appendToken(token) {
    const cur = scriptEl.value.trimEnd();
    if (!cur) {
      scriptEl.value = token;
      return scriptEl.scrollTop = scriptEl.scrollHeight;
    }
    // Collapse "down; down" into "down 2".
    const lines = cur.split('\n');
    const last = lines[lines.length - 1];
    const lastPieces = last.split(';').map((s) => s.trim());
    const lastPiece = lastPieces[lastPieces.length - 1];
    const m = lastPiece.match(/^(up|down|left|right)(?:\s+(\d+))?$/);
    if (m && m[1] === token) {
      const n = parseInt(m[2] || '1', 10) + 1;
      lastPieces[lastPieces.length - 1] = `${token} ${n}`;
      lines[lines.length - 1] = lastPieces.join('; ');
      scriptEl.value = lines.join('\n');
    } else {
      scriptEl.value = cur + '; ' + token;
    }
    scriptEl.scrollTop = scriptEl.scrollHeight;
  }

  // -------------------- Script parser ---------------------------------------
  function parseAction(s) {
    if (s === 'z' || s === 'a' || s === 'confirm') return { type: 'press', key: 'z' };
    if (s === 'x' || s === 'b' || s === 'cancel')  return { type: 'press', key: 'x' };
    if (s === 'start' || s === 'enter')            return { type: 'press', key: 'start' };
    let m;
    if ((m = s.match(/^wait\s+(\d+)$/i))) return { type: 'wait', n: +m[1] };
    if ((m = s.match(/^(up|down|left|right)(?:\s+(\d+))?$/i))) {
      return { type: 'move', dir: m[1].toLowerCase(), n: +(m[2] || 1) };
    }
    return null;
  }
  function parseScript(s) {
    const out = [];
    for (const rawLine of (s || '').split('\n')) {
      const noComment = rawLine.replace(/#.*/, '').trim();
      if (!noComment) continue;
      for (const piece of noComment.split(';')) {
        const a = piece.trim();
        if (!a) continue;
        const action = parseAction(a);
        if (action) out.push(action);
      }
    }
    return out;
  }

  // -------------------- RUN -- replay script as held keys ------------------
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // Overworld.moveSpeed = 8 ticks per tile at ~60fps. Add a small idle gap
  // after each move so the moveTimer can snap and the next action starts
  // from rest (matches the headless runner's hold/release pattern).
  const TILE_MS = (8 * 1000) / 60;

  let running = false;
  async function runScript(text) {
    if (running) return;
    const actions = parseScript(text);
    if (actions.length === 0) {
      setStatus('script is empty');
      return;
    }
    running = true;
    runBtn.disabled = true;
    runBtn.textContent = '… RUNNING';
    setStatus(`running ${actions.length} action(s)…`);
    try {
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        switch (a.type) {
          case 'press': {
            const k = KEY_FOR_TOKEN[a.key];
            Game.keys[k] = true;
            Game.keyPressed[k] = true;
            await sleep(70);
            Game.keys[k] = false;
            await sleep(80);
            break;
          }
          case 'move': {
            const k = KEY_FOR_TOKEN[a.dir];
            Game.keys[k] = true;
            await sleep(TILE_MS * a.n + 60);
            Game.keys[k] = false;
            await sleep(80);
            break;
          }
          case 'wait': {
            await sleep((a.n || 1) * (1000 / 60));
            break;
          }
        }
      }
      setStatus(`done — ran ${actions.length} action(s)`);
    } finally {
      running = false;
      runBtn.disabled = false;
      runBtn.textContent = '▶ RUN';
    }
  }
  runBtn.addEventListener('click', () => runScript(scriptEl.value));

  // -------------------- RESET -----------------------------------------------
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset the game? This wipes your save.')) return;
    try { localStorage.removeItem('critterred_save'); } catch (_) {}
    location.reload();
  });

  // -------------------- POST to Bluesky -------------------------------------
  // Layer 1: open bsky.app intent compose with a prefilled, self-tagging
  // template. Native in-app OAuth swap-in lands in Layer 2 once the
  // existing OAuth worker whitelists this origin.
  const BOT_HANDLE = 'poke.mino.mobi';
  postBtn.addEventListener('click', () => {
    const script = scriptEl.value.trim();
    const params = new URLSearchParams();
    if (script) params.set('s', script);
    const link = location.origin + location.pathname + (script ? '?' + params.toString() : '');
    let body;
    if (script) {
      body = `@${BOT_HANDLE} run this:\n\n${script}\n\n${link}`;
    } else {
      body = `come play with @${BOT_HANDLE}\n\n${link}`;
    }
    // Bluesky soft cap is 300 graphemes; this is good enough for a v0.
    if (body.length > 290) body = body.slice(0, 287) + '…';
    const intent = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(body);
    window.open(intent, '_blank', 'noopener');
  });

  // -------------------- Load script from ?s=... -----------------------------
  try {
    const params = new URLSearchParams(location.search);
    const s = params.get('s');
    if (s) {
      scriptEl.value = s;
      setStatus(`loaded script from URL — ${parseScript(s).length} action(s)`);
    }
  } catch (e) {
    console.warn('failed to load ?s= script', e);
  }

  // -------------------- Stop touch-scroll on game/control areas -------------
  document.addEventListener('touchmove', (e) => {
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  }, { passive: false });
})();
