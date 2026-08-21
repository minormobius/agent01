// game.js — the loop, the input, and the part that shows you the proof.
//
// The unusual thing on screen is the certificate strip. Every wave in
// levels.json was proved holdable from every lane before it shipped, and the
// proof carries numbers: how many ticks of margin perfect play has, and what
// going the wrong way round the web costs. Those are printed while you play,
// because they are the most interesting thing about this game and hiding them
// would be a waste of them.

(function () {
  'use strict';

  const TICK_MS = 1000 / 60;
  const LIVES = 3;

  // --- touch feel -----------------------------------------------------------
  // Dragging on the web is a spinner, the way the arcade cabinet's knob was:
  // the control is RELATIVE, so it means "spin this way", not "put the claw
  // under my thumb". That matters because on a ring, clockwise is rightward at
  // the top of the web and leftward at the bottom — an absolute mapping would
  // reverse itself as you walked round. Relative matches the keyboard, and it
  // is the one mapping that stays true wherever the claw is.
  const DEAD_ZONE = 15; // px of thumb travel before you start walking
  const STICK_MAX = 58; // the anchor trails the thumb, so stopping is cheap
  const TAP_PX = 12; // a touch that moves less than this…
  const TAP_MS = 300; // …and ends this quickly is a shot, not a drag
  const FIRE_PULSE = 10; // ticks a tapped shot stays queued waiting for cooldown
  // Asking the solver "is this still winnable" is real work. Twice a second is
  // plenty for a light that only ever tells you bad news.
  const ORACLE_EVERY = 30;

  const $ = (id) => document.getElementById(id);

  const isTouch = () =>
    globalThis.matchMedia && matchMedia('(pointer: coarse)').matches;

  /** Tell the player about the controls they actually have. */
  function controlsHelp() {
    return isTouch()
      ? '<p><b>Drag</b> the web to walk the rim · <b>tap</b> it to fire.<br>' +
        'Or use the buttons below — <b>◀ ▶</b> walk, <b>FIRE</b> holds down.</p>'
      : '<p><b>← →</b> walk the rim · <b>space</b> fire · ' +
        '<b>O</b> oracle · <b>P</b> proof</p>';
  }

  const state = {
    pack: null,
    level: 0,
    wave: 0,
    lives: LIVES,
    score: 0,
    run: null,
    view: null,
    phase: 'loading',
    lane: 0,
    acc: 0,
    last: 0,
    held: 0, // -1 ccw, +1 cw — from the on-screen buttons
    drag: 0, // -1 ccw, +1 cw — from the spinner
    firing: false,
    firePulse: 0, // a tapped shot, waiting for the gun to be ready
    oracle: false,
    doomed: false,
    lastOracle: -999,
  };

  const keys = new Set();

  function levelData() {
    return state.pack.levels[state.level];
  }
  function waveData() {
    return levelData().waves[state.wave];
  }

  // ---------------------------------------------------------------- chrome --

  function setPhase(p) {
    state.phase = p;
    document.body.dataset.phase = p;
  }

  function fmtOpen(cert) {
    const o = cert.openSlack;
    const cell = (name, v) =>
      `<span class="op ${v < 0 ? 'dead' : ''}">${name} <b>${v < 0 ? '✕' : v}</b></span>`;
    return cell('cw', o.cw) + cell('ccw', o.ccw) + cell('stand', o.stand);
  }

  function renderCert() {
    const lvl = levelData();
    const cert = waveData().cert;
    $('hud-level').textContent = `level ${lvl.index}`;
    $('hud-wave').textContent = `wave ${state.wave + 1}/${lvl.waves.length}`;
    $('hud-lives').textContent = '▮'.repeat(Math.max(0, state.lives));
    $('hud-score').textContent = state.score;
    $('web-name').textContent = `${lvl.web.shape} · ${lvl.web.lanes} lanes · ${lvl.web.character}`;
    $('cert-slack').textContent = cert.slack;
    $('cert-cost').textContent = cert.wrongWayCost;
    $('cert-openings').innerHTML = fmtOpen(cert);
    $('cert-verdict').textContent = cert.commits
      ? 'the web decides this one'
      : 'either way round works here';
    $('cert-verdict').classList.toggle('hot', !!cert.commits);
    $('hud-cert').innerHTML =
      `slack <b>${cert.slack}</b> · wrong way <b>${cert.wrongWayCost}</b>` +
      (cert.commits ? ' <span class="decides">· the web decides</span>' : '');
    // Narrow screens get the same two numbers with the words taken out rather
    // than losing the certificate altogether — it is the point of the game.
    $('hud-cert-short').innerHTML =
      `<b>${cert.slack}</b>◷ <b>${cert.wrongWayCost}</b>↺` +
      (cert.commits ? ' <span class="decides">•</span>' : '');
  }

  function say(title, body, action) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = body;
    $('overlay-action').textContent = action || 'press space';
  }

  // ----------------------------------------------------------------- waves --

  function releaseControls() {
    state.held = 0;
    state.drag = 0;
    state.firing = false;
    state.firePulse = 0;
    for (const id of ['t-ccw', 't-cw', 't-fire']) {
      const el = $(id);
      if (el) el.classList.remove('down');
    }
  }

  function startWave(keepLane) {
    const lvl = levelData();
    const wave = waveData();
    if (state.run) state.run.dispose();
    if (!keepLane) state.lane = 0;
    state.run = new Tempest.Run(lvl.web, wave, state.lane);
    state.view.setWeb(lvl.web);
    state.view.resize();
    state.doomed = false;
    state.lastOracle = -999;
    renderCert();
    setPhase('playing');
  }

  function startLevel(i, keepLane) {
    state.level = Math.max(0, Math.min(state.pack.levels.length - 1, i));
    state.wave = 0;
    state.lives = LIVES;
    startWave(keepLane);
    history.replaceState(null, '', `?level=${levelData().index}`);
  }

  function waveCleared() {
    releaseControls();
    const cert = waveData().cert;
    // Scoring rewards playing tighter than the proof needed you to.
    state.score += 100 + Math.max(0, cert.slack) + waveData().threats.length * 25;
    state.lane = state.run.state().lane;
    state.wave += 1;
    if (state.wave >= levelData().waves.length) {
      setPhase('between');
      if (state.level + 1 >= state.pack.levels.length) {
        say(
          'the whole pack held',
          `You cleared every certified level. Final score <b>${state.score}</b>.`,
          'press space to start again'
        );
        state.phase = 'won';
        document.body.dataset.phase = 'won';
      } else {
        say(
          `level ${levelData().index} held`,
          `Score <b>${state.score}</b>. Next web: <b>${
            state.pack.levels[state.level + 1].web.shape
          }</b>, ${state.pack.levels[state.level + 1].web.character}.`,
          'press space for the next level'
        );
      }
    } else {
      setPhase('playing');
      startWave(true);
    }
  }

  function breached() {
    const a = state.run.autopsy();
    state.lives -= 1;
    state.held = 0;
    state.drag = 0;
    state.firing = false;
    state.firePulse = 0;
    if (navigator.vibrate) navigator.vibrate(state.lives > 0 ? 30 : [30, 60, 90]);
    const lost =
      a.lostAt >= 0
        ? `<p class="verdict">${a.verdict.replace(/\n/g, '<br>')}</p>`
        : `<p class="verdict">The rim was still holdable when it fell — that one was a mis-play, not a trap.</p>`;
    if (state.lives > 0) {
      say(
        'the rim broke',
        lost + `<p>${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.</p>`,
        'press space to retake the wave'
      );
      setPhase('dead');
    } else {
      say(
        'the web won',
        lost + `<p>Final score <b>${state.score}</b>.</p>`,
        'press space to start this level again'
      );
      setPhase('gameover');
    }
  }

  function advance() {
    if (state.phase === 'between') {
      state.level += 1;
      state.wave = 0;
      state.lives = LIVES;
      startWave(true);
      history.replaceState(null, '', `?level=${levelData().index}`);
    } else if (state.phase === 'won') {
      state.score = 0;
      startLevel(0, false);
    } else if (state.phase === 'dead') {
      startWave(true);
    } else if (state.phase === 'gameover') {
      state.score = 0;
      state.lives = LIVES;
      state.wave = 0;
      startWave(false);
    } else if (state.phase === 'title') {
      const want = Number(new URLSearchParams(location.search).get('level') || 1);
      const idx = state.pack.levels.findIndex((l) => l.index === want);
      startLevel(idx >= 0 ? idx : 0, false);
    }
  }

  // ----------------------------------------------------------------- input --

  function readInput() {
    let dir = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dir -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dir += 1;
    if (state.held) dir = state.held;
    if (state.drag) dir = state.drag;
    const fire =
      state.firing ||
      state.firePulse > 0 ||
      keys.has('Space') ||
      keys.has('KeyZ') ||
      keys.has('KeyK');
    return { dir, fire };
  }

  function actionFor(snapshot) {
    const { dir, fire } = readInput();
    if (state.firePulse > 0) state.firePulse -= 1;
    // One action per tick. Firing wins when it is actually available,
    // because a shot you can take now is never worth deferring; otherwise
    // keep walking.
    if (fire && snapshot.canFire) {
      // A tapped shot is spent the moment it goes off, so one tap is one shot.
      state.firePulse = 0;
      return Tempest.ACTION.fire;
    }
    if (dir > 0) return Tempest.ACTION.cw;
    if (dir < 0) return Tempest.ACTION.ccw;
    return Tempest.ACTION.hold;
  }

  function bindInput() {
    addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && state.phase !== 'playing') {
        advance();
        return;
      }
      if (e.code === 'KeyO') toggleOracle();
      if (e.code === 'KeyP') $('proof').classList.toggle('open');
      keys.add(e.code);
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());

    // --- the on-screen buttons ---
    // Held, not clicked: `click` fires on release, which is a whole beat too
    // late for a game measured in ticks. These also double as "continue" while
    // an overlay is up, so a touch player never has to find the small print.
    const holdButton = (el, on) => {
      const press = (e) => {
        e.preventDefault();
        if (state.phase !== 'playing') {
          advance();
          return;
        }
        el.classList.add('down');
        on(true);
      };
      const release = (e) => {
        if (e) e.preventDefault();
        el.classList.remove('down');
        on(false);
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      // Touch keeps the pointer captured on the element it started on, so a
      // thumb that slides off still has to be released here.
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    holdButton($('t-ccw'), (v) => (state.held = v ? -1 : 0));
    holdButton($('t-cw'), (v) => (state.held = v ? 1 : 0));
    holdButton($('t-fire'), (v) => (state.firing = v));

    // --- the spinner ---
    // Drag anywhere on the web to walk; tap it to shoot. That gives one-thumb
    // play without any of it sitting on top of the thing you are looking at.
    const stage = $('stage');
    let spin = null;
    stage.addEventListener('pointerdown', (e) => {
      if (state.phase !== 'playing') return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      spin = { id: e.pointerId, anchor: e.clientX, moved: 0, t0: performance.now() };
      state.drag = 0;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!spin || e.pointerId !== spin.id) return;
      let dx = e.clientX - spin.anchor;
      spin.moved = Math.max(spin.moved, Math.abs(dx));
      // Let the anchor trail the thumb. Without this, a long drag one way
      // leaves you having to haul the thumb all the way back to stop, which
      // is exactly the moment you most need to stop.
      if (dx > STICK_MAX) spin.anchor = e.clientX - (dx = STICK_MAX);
      else if (dx < -STICK_MAX) spin.anchor = e.clientX - (dx = -STICK_MAX);
      state.drag = dx > DEAD_ZONE ? 1 : dx < -DEAD_ZONE ? -1 : 0;
    });
    const endSpin = (e) => {
      if (!spin || (e && e.pointerId !== spin.id)) return;
      const quick = performance.now() - spin.t0 < TAP_MS;
      if (spin.moved < TAP_PX && quick) state.firePulse = FIRE_PULSE;
      spin = null;
      state.drag = 0;
    };
    stage.addEventListener('pointerup', endSpin);
    stage.addEventListener('pointercancel', endSpin);
    stage.addEventListener('contextmenu', (e) => e.preventDefault());

    // The overlay sits on top of everything while it is showing, so the tap
    // that dismisses it has to be bound there — a listener on the canvas
    // underneath never sees it, and on a phone that means the game cannot be
    // started at all.
    document.querySelector('.overlay').addEventListener('pointerdown', (e) => {
      if (state.phase !== 'playing') {
        e.preventDefault();
        advance();
      }
    });
    $('oracle-toggle').addEventListener('click', toggleOracle);
    $('proof-toggle').addEventListener('click', () => $('proof').classList.toggle('open'));

    // Rotating a phone changes the canvas box; so does a keyboard appearing.
    // `orientationchange` can land before the new size is readable, hence the
    // second pass on the next frame.
    const relayout = () => {
      if (!state.view) return;
      state.view.resize();
      requestAnimationFrame(() => state.view && state.view.resize());
    };
    addEventListener('resize', relayout);
    addEventListener('orientationchange', relayout);
    if (globalThis.visualViewport) {
      visualViewport.addEventListener('resize', relayout);
    }
  }

  function toggleOracle() {
    state.oracle = !state.oracle;
    $('oracle-toggle').setAttribute('aria-pressed', String(state.oracle));
    $('oracle-light').hidden = !state.oracle;
    state.lastOracle = -999;
  }

  // ------------------------------------------------------------------ loop --

  function loop(now) {
    requestAnimationFrame(loop);
    if (!state.view) return;
    const dt = Math.min(now - state.last, 200);
    state.last = now;

    if (state.phase === 'playing') {
      state.acc += dt;
      let snapshot = state.run.state();
      let guard = 0;
      while (state.acc >= TICK_MS && guard++ < 8) {
        state.acc -= TICK_MS;
        const outcome = state.run.step(actionFor(snapshot));
        snapshot = state.run.state();
        if (outcome === 'cleared') {
          waveCleared();
          return;
        }
        if (outcome === 'breached' || outcome === 'stalled') {
          breached();
          return;
        }
      }
      if (state.oracle && snapshot.tick - state.lastOracle >= ORACLE_EVERY) {
        state.lastOracle = snapshot.tick;
        state.doomed = !state.run.holdable();
        $('oracle-light').dataset.state = state.doomed ? 'lost' : 'live';
        $('oracle-light').textContent = state.doomed
          ? 'already lost'
          : 'still holdable';
      }
      state.view.frame(snapshot, { doomed: state.oracle && state.doomed });
    } else if (state.run) {
      state.view.frame(state.run.state(), { doomed: state.oracle && state.doomed });
    } else {
      // Before the first wave there is nothing to draw but the web — which is
      // the right thing to be looking at while reading what the game is.
      state.view.idle();
    }
  }

  // ------------------------------------------------------------------ boot --

  async function boot() {
    try {
      const [packRes, wasm] = await Promise.all([
        fetch('./levels.json'),
        Tempest.load('./tempest.wasm'),
      ]);
      if (!packRes.ok) throw new Error(`levels.json: ${packRes.status}`);
      state.pack = await packRes.json();
      if (state.pack.epoch !== wasm.epoch) {
        throw new Error(
          `levels.json was generated for seed epoch ${state.pack.epoch} but ` +
            `tempest.wasm is epoch ${wasm.epoch}. Regenerate both.`
        );
      }
      state.view = new Tempest.View($('stage'), state.pack.levels[0].web);
      state.view.resize();
      bindInput();
      setPhase('title');
      say(
        'tempest',
        '<p>The gun only fires down the lane you are standing in. Everything ' +
          'climbing the web is trying to reach the rim.</p>' +
          controlsHelp() +
          '<p class="fine">Every wave here was proved holdable — from every lane ' +
          'you could be standing in — before it shipped.</p>',
        'press space to begin'
      );
      requestAnimationFrame((t) => {
        state.last = t;
        loop(t);
      });
    } catch (err) {
      setPhase('error');
      say('it did not load', `<p class="fine">${String(err.message || err)}</p>`, '');
    }
  }

  // A read-only window into the running game: for the selftest, for the
  // browser console, and for anyone who would rather check the numbers than
  // take the HUD's word for them.
  globalThis.Tempest = Object.assign(globalThis.Tempest || {}, {
    inspect() {
      if (!state.run) return { phase: state.phase };
      const snap = state.run.state();
      return {
        phase: state.phase,
        level: levelData().index,
        wave: state.wave,
        lives: state.lives,
        score: state.score,
        cert: waveData().cert,
        ...snap,
      };
    },
  });

  boot();
})();
