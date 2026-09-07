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

  // --- how fast the game runs ------------------------------------------------
  //
  // Ticks per second, and the honest way to make the game quicker.
  //
  // The obvious way — make the claw cover more ground per tick — was tried and
  // measured, and it quietly wrecks the game. Lane travel cost IS the thing
  // the solver certifies against and the thing the whole design is about, so a
  // faster claw means the web's shape matters less: at 1.5x claw speed the
  // balance sweep showed waves landing in their difficulty band falling from
  // 97% to 60%, "the web decides" falling from 84% to 51%, and — the tell that
  // settled it — the deliberately blind `flat-web` control, which plays every
  // web as a circle, closing from 1.4-against-1.9 to 2.6-against-3.0. If you
  // can get anywhere cheaply, the shape is scenery.
  //
  // The tick is an internal unit. Running more of them per second makes
  // everything faster in the hand while leaving every ratio, every
  // certificate and every seed exactly as they were.
  const TICKS_PER_SEC = 90;
  const TICK_MS = 1000 / TICKS_PER_SEC;
  const LIVES = 3;

  // --- touch feel -----------------------------------------------------------
  //
  // The wheel is a POSITION control, not a velocity one. Turn it a quarter and
  // the claw goes a quarter of the way round, as fast as it can walk; jam it
  // half a turn and it sets off for the far side of the web. A velocity
  // control — hold this way to keep walking — was the first attempt and it
  // felt like steering something heavy, because the amount you turned carried
  // no information at all.
  //
  // What it does NOT do is route for you. The target follows your *accumulated*
  // rotation, so if you turn clockwise past the halfway point the claw walks
  // clockwise the whole way, the long way, exactly as you asked. That matters
  // more here than in most games: which way round the web you go is the thing
  // this game exists to measure, and a control that quietly picked the short
  // route would be answering the question for you.
  const TURN_LANES = 1.0; // one full turn of the wheel = one lap of the web
  const AIM_DEAD = 0.35; // lanes of slop before the claw bothers to move
  const DIAL_DEAD_R = 18; // px from the hub where the angle stops meaning anything
  const DRAG_PX_PER_LANE = 20; // dragging the web itself, for one-thumb play
  const TAP_PX = 12; // a touch that moves less than this…
  const TAP_MS = 300; // …and ends this quickly is a shot, not a drag
  const FIRE_PULSE = 10; // ticks a tapped shot stays queued waiting for cooldown

  // Asking the solver "is this still winnable" is real work. Twice a second is
  // plenty for a light that only ever tells you bad news.
  const ORACLE_EVERY = Math.round(TICKS_PER_SEC / 2);

  const $ = (id) => document.getElementById(id);

  const isTouch = () =>
    globalThis.matchMedia && matchMedia('(pointer: coarse)').matches;

  /** Tell the player about the controls they actually have. */
  function controlsHelp() {
    return isTouch()
      ? '<p><b>Turn the wheel</b> to walk the rim · <b>FIRE</b> to shoot.<br>' +
        'One thumb on each, like the cabinet had.</p>' +
        '<p class="fine">Turn it a quarter and the claw goes a quarter of the way ' +
        'round; jam it and it keeps going after you let go. Grab it again to stop. ' +
        'You can also drag the web itself, and tap it to fire.</p>'
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
    // Where the player has pointed a positional control, as a SIGNED lane
    // number that keeps counting past the wrap. Signed is what lets "you
    // turned clockwise past the far side" mean the long way round rather than
    // the short way back.
    aim: null,
    signed: 0, // the claw's own signed position, tracked the same way
    lastLane: 0,
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

  const dial = {
    id: null, // the pointer currently on the wheel
    cx: 0,
    cy: 0, // hub, in client coords
    angle: 0, // last thumb angle
    turned: 0, // total rotation since this thumb went down — unwrapped
    spin: 0, // total rotation ever, for the visual
    base: 0, // the claw's signed position when the thumb went down
  };

  /** Shortest way round between two angles, so ±π does not read as a lurch. */
  const wrapAngle = (a) =>
    ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

  /**
   * Follow the claw's position as a signed number that keeps counting past the
   * wrap, so "three lanes clockwise from here" is always a bigger number than
   * "here" — even when that crosses lane 0.
   */
  function trackLane(lane) {
    const web = levelData().web;
    let d = lane - state.lastLane;
    if (web.closed) {
      if (d > web.lanes / 2) d -= web.lanes;
      else if (d < -web.lanes / 2) d += web.lanes;
    }
    state.signed += d;
    state.lastLane = lane;
  }

  /** Keep an aim inside a strip, which has no way round the back. */
  function clampAim(v) {
    const web = levelData().web;
    if (web.closed) return v;
    const first = state.signed - state.lastLane;
    return Math.min(Math.max(v, first), first + web.lanes - 1);
  }

  /** Which way the claw should walk to reach where the player pointed. */
  function aimDir() {
    if (state.aim === null) return 0;
    const d = state.aim - state.signed;
    if (d > AIM_DEAD) return 1;
    if (d < -AIM_DEAD) return -1;
    return 0;
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
    // The words are wrapped so a narrow HUD can drop them and keep the
    // numbers. On a phone the full labels pushed the row onto a second line,
    // which cost ~50px of web to say "level" and "wave".
    $('hud-level').innerHTML = `<span class="lbl">level </span>${lvl.index}`;
    $('hud-wave').innerHTML =
      `<span class="lbl">wave </span>${state.wave + 1}/${lvl.waves.length}`;
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

  /**
   * Forget where the player had pointed, and nothing else.
   *
   * It deliberately does NOT clear whether a thumb is on the fire button or
   * the wheel: those belong to the pointer, not to the game, and resetting
   * them here is exactly what made the gun go dead when you held fire through
   * a wave break. A thumb that is down stays down until the browser says
   * otherwise.
   */
  function clearAim() {
    state.aim = null;
    state.firePulse = 0;
  }

  function startWave(keepLane) {
    const lvl = levelData();
    const wave = waveData();
    if (state.run) state.run.dispose();
    if (!keepLane) state.lane = 0;
    state.run = new Tempest.Run(lvl.web, wave, state.lane);
    // The signed cursor restarts wherever the claw restarts, and any aim from
    // the last wave is void.
    state.signed = state.lane;
    state.lastLane = state.lane;
    state.aim = null;
    dial.id = null;
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
    clearAim();
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
    clearAim();
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
    // A key press takes the wheel back off the claw: two things steering at
    // once is worse than either alone.
    if (dir !== 0) state.aim = null;
    else dir = aimDir();
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

    // --- the fire button ---
    //
    // Held, not clicked: `click` lands on release, a whole beat late at sixty
    // ticks a second. And the held state is the POINTER's state, not something
    // the game gets to reset — an earlier version cleared it whenever a wave
    // ended, so holding fire through a wave break left the gun dead until you
    // lifted your thumb and pressed again. If a thumb is down, it is down.
    const fireBtn = $('t-fire');
    let firePointer = null;
    const firePress = (e) => {
      e.preventDefault();
      if (state.phase !== 'playing') {
        advance();
        return;
      }
      firePointer = e.pointerId;
      try {
        fireBtn.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the release handlers still fire without it */
      }
      fireBtn.classList.add('down');
      state.firing = true;
    };
    const fireRelease = (e) => {
      if (e && firePointer !== null && e.pointerId !== firePointer) return;
      firePointer = null;
      fireBtn.classList.remove('down');
      state.firing = false;
    };
    fireBtn.addEventListener('pointerdown', firePress);
    fireBtn.addEventListener('pointerup', fireRelease);
    fireBtn.addEventListener('pointercancel', fireRelease);
    fireBtn.addEventListener('lostpointercapture', fireRelease);
    fireBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- the wheel ---
    const dialEl = $('dial');
    const ringEl = $('dial-ring');
    const nubEl = $('dial-nub');

    const dialTrack = (e) => {
      const dx = e.clientX - dial.cx;
      const dy = e.clientY - dial.cy;
      const r = Math.hypot(dx, dy);
      // Close to the hub the angle is mostly noise — a thumb wobbling over the
      // centre would spin the wheel wildly — so it holds its last reading.
      if (r < DIAL_DEAD_R) return;
      const a = Math.atan2(dy, dx);
      const da = wrapAngle(a - dial.angle);
      dial.angle = a;
      dial.turned += da;
      dial.spin += da;
      const web = levelData().web;
      state.aim = clampAim(
        dial.base + (dial.turned / (2 * Math.PI)) * web.lanes * TURN_LANES
      );
      paintDial(a, r);
    };

    function paintDial(a, r) {
      // The knurling turns exactly as far as the thumb does. This is the whole
      // feedback loop: you can see the wheel turning.
      ringEl.style.transform = `rotate(${dial.spin * (180 / Math.PI)}deg)`;
      if (a === undefined) {
        nubEl.style.transform = 'translate(0px, 0px)';
        return;
      }
      const reach = Math.min(r, dialEl.clientWidth / 2 - 16);
      nubEl.style.transform = `translate(${Math.cos(a) * reach}px, ${Math.sin(a) * reach}px)`;
    }

    dialEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (state.phase !== 'playing') {
        advance();
        return;
      }
      const box = dialEl.getBoundingClientRect();
      dial.cx = box.left + box.width / 2;
      dial.cy = box.top + box.height / 2;
      dial.id = e.pointerId;
      dial.angle = Math.atan2(e.clientY - dial.cy, e.clientX - dial.cx);
      dial.turned = 0;
      // Taking hold of the wheel re-references it to where the claw actually
      // is, so picking it up never makes the claw jump — and putting a thumb
      // back on it is how you cancel a throw you have changed your mind about.
      dial.base = state.signed;
      state.aim = state.signed;
      dialEl.setPointerCapture(e.pointerId);
      dialEl.classList.add('live');
      dialTrack(e);
    });
    dialEl.addEventListener('pointermove', (e) => {
      if (dial.id !== e.pointerId) return;
      e.preventDefault();
      dialTrack(e);
    });
    const dialRelease = (e) => {
      if (e && dial.id !== e.pointerId) return;
      dial.id = null;
      dialEl.classList.remove('live');
      // The aim SURVIVES the release: throw the wheel and the claw finishes
      // the journey. That is the whole point of a position control — you say
      // where, not how long to hold. The knurling keeps its rotation like a
      // real spinner; only the thumb marker springs home.
      paintDial();
    };
    dialEl.addEventListener('pointerup', dialRelease);
    dialEl.addEventListener('pointercancel', dialRelease);
    dialEl.addEventListener('lostpointercapture', dialRelease);
    dialEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- dragging the web itself, for one-thumb play ---
    const stage = $('stage');
    let spin = null;
    stage.addEventListener('pointerdown', (e) => {
      if (state.phase !== 'playing' || dial.id !== null) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      spin = {
        id: e.pointerId,
        anchor: e.clientX,
        base: state.signed,
        moved: 0,
        t0: performance.now(),
      };
      state.aim = state.signed;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!spin || e.pointerId !== spin.id) return;
      const dx = e.clientX - spin.anchor;
      spin.moved = Math.max(spin.moved, Math.abs(dx));
      state.aim = clampAim(spin.base + dx / DRAG_PX_PER_LANE);
    });
    const endSpin = (e) => {
      if (!spin || (e && e.pointerId !== spin.id)) return;
      const quick = performance.now() - spin.t0 < TAP_MS;
      if (spin.moved < TAP_PX && quick) {
        state.firePulse = FIRE_PULSE;
        state.aim = null; // a tap is a shot, not a move
      }
      spin = null;
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
      // At 90 ticks a second on a 60Hz display that is 1.5 ticks a frame; the
      // cap is only here so a backgrounded tab does not come back and
      // simulate a minute of game in one frame.
      let guard = 0;
      while (state.acc >= TICK_MS && guard++ < 12) {
        state.acc -= TICK_MS;
        const outcome = state.run.step(actionFor(snapshot));
        snapshot = state.run.state();
        trackLane(snapshot.lane);
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
