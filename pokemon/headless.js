// Headless game runner.
// Loads pokemon/{data,render,overworld,battle,game}.js into a Node vm context
// with a stubbed DOM, then exposes a tick API + script runner.
//
//   const { makeRunner } = require('./headless.js');
//   const r = makeRunner();
//   r.runScript(`
//     z          # start title
//     z          # advance any opening dialog
//     down 3     # walk south
//   `);
//   console.log(r.summary());

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

function makeRunner(opts = {}) {
  const noop = () => {};

  // Fake 2D context — every method is a no-op, every property accepts writes.
  const fakeCtx = new Proxy(
    { canvas: null },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: noop });
        }
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return noop;
      },
      set(target, prop, value) { target[prop] = value; return true; },
    },
  );
  const fakeCanvas = { width: 480, height: 432, getContext: () => fakeCtx };
  fakeCtx.canvas = fakeCanvas;

  const sandbox = {
    window:   { addEventListener: noop, removeEventListener: noop },
    document: { getElementById: () => fakeCanvas, addEventListener: noop, createElement: () => fakeCanvas },
    requestAnimationFrame: noop,            // never schedules a frame
    cancelAnimationFrame:  noop,
    localStorage: {
      _s: {},
      getItem(k)        { return this._s[k] ?? null; },
      setItem(k, v)     { this._s[k] = String(v); },
      removeItem(k)     { delete this._s[k]; },
      clear()           { this._s = {}; },
    },
    Image: function () {},
    setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
    console, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RangeError, TypeError, Symbol, Map, Set, WeakMap, WeakSet,
    Promise, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite,
    Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Float64Array,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);

  // top-level const/let in vm scripts don't persist across runInContext calls,
  // so concat all sources into one script and append explicit globalThis exports.
  const FILES = ['data.js', 'render.js', 'overworld.js', 'battle.js', 'game.js'];
  const exportNames = [
    'TILE', 'TILE_PROPS', 'PAL', 'TYPES', 'TYPE_CHART', 'MOVES', 'SPECIES',
    'ENCOUNTER_TABLES', 'TRAINERS', 'ITEMS', 'MAPS',
    'SCREEN_W', 'SCREEN_H', 'SCREEN_TILES_X', 'SCREEN_TILES_Y', 'TILE_SIZE',
    'Overworld', 'Battle', 'Game',
    'createCritter', 'rollEncounter',
  ];
  let combined = '';
  for (const f of FILES) {
    combined += `\n//=== ${f} ===\n` + fs.readFileSync(path.join(__dirname, f), 'utf8');
  }
  combined += '\n//=== headless exports ===\n';
  for (const name of exportNames) {
    combined += `try { globalThis.${name} = ${name}; } catch (_) {}\n`;
  }
  vm.runInContext(combined, ctx, { filename: 'pokemon/<combined>' });

  // Don't call Game.init() — it would addEventListener + start rAF.
  // Just initialise the keystate buckets; mode is already 'title'.
  const G = sandbox.Game;
  G.keys = {};
  G.keyPressed = {};

  // Map our action vocabulary to the keys getInput() looks for.
  const KEY = {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    z: 'z', x: 'x', enter: 'Enter',
    confirm: 'z', cancel: 'x', start: 'Enter',
  };

  // One tick. press = single-frame keydown; hold = key remains down this frame.
  function tick({ press = null, hold = null } = {}) {
    G.keys = {};
    G.keyPressed = {};
    if (press) {
      const k = KEY[press] || press;
      G.keyPressed[k] = true;
      G.keys[k] = true;
    }
    if (hold) {
      const k = KEY[hold] || hold;
      G.keys[k] = true;
    }
    const input = G.getInput();
    const held  = G.getHeld();
    G.update(input, held);
    // We deliberately skip G.render() — fakeCtx is fine, but cycles aren't free.
    if (opts.render) G.render();
  }

  // --- High-level actions --------------------------------------------------

  // Walk exactly one tile in dir, accounting for animation + transitions.
  //
  // Game.update finishes a tile-move AND starts the next one in the same frame
  // when the direction is held, so naive "hold until idle" chains forever.
  // We instead:
  //   1. Tick once with the direction held to trigger the move (or transition).
  //   2. Tick (moveSpeed - 1) more times holding to advance the animation.
  //   3. Tick once with the key released; the moveTimer snaps and stays idle.
  function moveOneTile(dir) {
    const ow = sandbox.Overworld;
    const startMap = ow.currentMapId;
    const speed = ow.moveSpeed || 8;

    const settleTransition = () => {
      let safety = 200;
      while (ow.transitioning && safety-- > 0) tick();
    };

    // Frame 1: trigger.
    tick({ hold: dir });

    if (ow.transitioning || ow.currentMapId !== startMap) {
      settleTransition();
      return { crossed: ow.currentMapId !== startMap };
    }

    // No move started => blocked, or busy with dialog/menu/etc.
    if (!ow.moving) return { blocked: true };

    // Frames 2..speed: hold through the animation.
    for (let i = 0; i < speed - 1; i++) {
      tick({ hold: dir });
      if (ow.transitioning || ow.currentMapId !== startMap) {
        settleTransition();
        return { crossed: ow.currentMapId !== startMap };
      }
    }

    // Frame speed+1: release so moveTimer snaps without queuing the next tile.
    tick();
    return { ok: true };
  }

  function step(action) {
    if (typeof action === 'string') action = parseAction(action);
    if (!action) return;
    switch (action.type) {
      case 'wait':    for (let i = 0; i < (action.n || 1); i++) tick(); return;
      case 'press':   tick({ press: action.key }); return;
      case 'move': {
        const n = action.n || 1;
        for (let i = 0; i < n; i++) {
          const r = moveOneTile(action.dir);
          if (r.crossed) return; // hand control back after a map change
        }
        return;
      }
      case 'noop': return;
    }
  }

  function parseAction(s) {
    s = s.replace(/#.*/, '').trim();
    if (!s) return null;
    if (s === 'z' || s === 'confirm') return { type: 'press', key: 'z' };
    if (s === 'x' || s === 'cancel')  return { type: 'press', key: 'x' };
    if (s === 'start' || s === 'enter') return { type: 'press', key: 'enter' };
    let m;
    if ((m = s.match(/^wait\s+(\d+)$/))) return { type: 'wait', n: +m[1] };
    if ((m = s.match(/^(up|down|left|right)(?:\s+(\d+))?$/))) {
      return { type: 'move', dir: m[1], n: +(m[2] || 1) };
    }
    if ((m = s.match(/^press\s+(\w+)$/))) return { type: 'press', key: m[1] };
    throw new Error('headless: unknown action: ' + JSON.stringify(s));
  }

  function runScript(script) {
    if (Array.isArray(script)) {
      for (const line of script) step(line);
      return;
    }
    // Strip comments per source line first (so `;` inside a comment is ignored),
    // then split each line on `;` for inline action chains.
    for (const rawLine of script.split('\n')) {
      const noComment = rawLine.replace(/#.*/, '').trim();
      if (!noComment) continue;
      for (const piece of noComment.split(';')) {
        const a = piece.trim();
        if (a) step(a);
      }
    }
  }

  // --- Observation API -----------------------------------------------------

  function getState() {
    const ow = sandbox.Overworld;
    const Battle = sandbox.Battle;
    const inBattle = Battle && Battle.active;
    return {
      mode: G.state.mode,
      mapId: ow.currentMapId,
      mapName: (ow.currentMap && ow.currentMap.name) || null,
      x: ow.playerX, y: ow.playerY, dir: ow.playerDir,
      moving: !!ow.moving,
      transitioning: !!ow.transitioning,
      dialogActive: !!ow.dialogActive,
      dialog: ow.dialogActive ? {
        index: ow.dialogIndex,
        line: (ow.dialogLines || [])[ow.dialogIndex] || '',
        all: ow.dialogLines || [],
      } : null,
      menuOpen: !!G.menuOpen,
      menuSubState: G.menuSubState,
      shopOpen: !!G.shopOpen,
      hasStarter: !!G.state.hasStarter,
      party: (G.state.party || []).map((c) => ({
        species: c.species, name: c.name, level: c.level,
        hp: c.hp, maxHp: c.maxHp, status: c.status,
        moves: (c.moves || []).map((m) => ({ id: m.id, pp: m.pp, maxPp: m.maxPp })),
      })),
      bag: G.state.bag,
      money: G.state.money,
      badges: G.state.badges,
      defeatedTrainers: G.state.defeatedTrainers,
      battle: inBattle ? {
        active: true,
        playerActiveIdx: Battle.playerActive,
        enemy: Battle.enemy ? {
          name: Battle.enemy.name, level: Battle.enemy.level,
          hp: Battle.enemy.hp, maxHp: Battle.enemy.maxHp,
        } : null,
        message: Battle.message || null,
      } : { active: false },
    };
  }

  function summary() {
    const s = getState();
    const lines = [];
    lines.push(`[${s.mode}] ${s.mapName || s.mapId || '?'} @ (${s.x},${s.y}) facing ${s.dir}`);
    if (s.dialogActive)  lines.push(`  dialog: "${s.dialog.line}" (${s.dialog.index + 1}/${s.dialog.all.length})`);
    if (s.menuOpen)      lines.push(`  menu: ${s.menuSubState || 'main'}`);
    if (s.shopOpen)      lines.push(`  shop open`);
    if (s.battle.active) {
      const e = s.battle.enemy;
      lines.push(`  battle: vs ${e ? `${e.name} L${e.level} ${e.hp}/${e.maxHp}` : '?'}${s.battle.message ? ` — "${s.battle.message}"` : ''}`);
    }
    if (s.party.length) {
      lines.push(`  party: ${s.party.map((p) => `${p.name} L${p.level} ${p.hp}/${p.maxHp}`).join(', ')}`);
    } else {
      lines.push(`  party: (empty)`);
    }
    lines.push(`  $${s.money}  bag=${s.bag.map((b) => `${b.id}x${b.count}`).join(',') || '-'}  badges=${s.badges.length}`);
    return lines.join('\n');
  }

  return { tick, step, runScript, getState, summary, sandbox, parseAction };
}

module.exports = { makeRunner };
