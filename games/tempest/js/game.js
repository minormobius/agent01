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
  // Asking the solver "is this still winnable" is real work. Twice a second is
  // plenty for a light that only ever tells you bad news.
  const ORACLE_EVERY = 30;

  const $ = (id) => document.getElementById(id);

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
    held: 0, // -1 ccw, +1 cw
    firing: false,
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
  }

  function say(title, body, action) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = body;
    $('overlay-action').textContent = action || 'press space';
  }

  // ----------------------------------------------------------------- waves --

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
    const fire = state.firing || keys.has('Space') || keys.has('KeyZ') || keys.has('KeyK');
    return { dir, fire };
  }

  function actionFor(snapshot) {
    const { dir, fire } = readInput();
    // One action per tick. Firing wins when it is actually available,
    // because a shot you can take now is never worth deferring; otherwise
    // keep walking.
    if (fire && snapshot.canFire) return Tempest.ACTION.fire;
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

    const zone = (el, on) => {
      const set = (v) => (e) => {
        e.preventDefault();
        on(v);
      };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
    };
    zone($('pad-left'), (v) => (state.held = v ? -1 : 0));
    zone($('pad-right'), (v) => (state.held = v ? 1 : 0));
    zone($('pad-fire'), (v) => (state.firing = v));
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
    addEventListener('resize', () => state.view && state.view.resize());
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
          '<p><b>← →</b> walk the rim · <b>space</b> fire · <b>O</b> oracle · <b>P</b> proof</p>' +
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

  boot();
})();
