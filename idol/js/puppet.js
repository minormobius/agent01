/* idol — the puppet. Turns time + events into the `st` blob the renderer
   consumes. The layers, in order of the design memo:

     base     — breathing + weight shifts; never stops, ever
     gaze     — THE beguilement organ: saccade-driven pursuit of the cursor,
                eye contact held a beat too long on weighted lines
     face     — expression state machine with fast attack, slow release, and
                emotional LATENCY (the dial that reads as inner life)
     mouth    — visemes while speaking, coupled micro head-motion
     sanctioned wrongness — dead-eyes, pupil, glitch ghost. Only these.

   One rule above all: jank reads as broken software, not unsafe software.
   The spell must be technically immaculate; only semantics may crack. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var I = NS.IDOL = NS.IDOL || {};

  /* expression targets — blended by weight, so transitions are continuous */
  var EXPR = {
    neutral:  { curve: 0.25, browRaise: 0,    browTilt: 0,    lidOpen: 1.0,  squint: 0,   form: "smile", pupil: 0.30, blush: 0,    dead: 0 },
    joy:      { curve: 0.90, browRaise: 0.25, browTilt: 0.1,  lidOpen: 1.0,  squint: 0.5, form: "smile", pupil: 0.40, blush: 0.25, dead: 0 },
    fun:      { curve: 0.80, browRaise: 0.2,  browTilt: 0,    lidOpen: 1.0,  squint: 0.75, form: "w",    pupil: 0.40, blush: 0.30, dead: 0 },
    sorrow:   { curve: -0.5, browRaise: 0,    browTilt: 0.75, lidOpen: 0.8,  squint: 0,   form: "smile", pupil: 0.35, blush: 0,    dead: 0 },
    angry:    { curve: -0.35, browRaise: 0,   browTilt: -0.8, lidOpen: 0.85, squint: 0.1, form: "smile", pupil: 0.25, blush: 0,    dead: 0 },
    surprise: { curve: 0.2,  browRaise: 0.95, browTilt: 0,    lidOpen: 1.15, squint: 0,   form: "o",     pupil: 0.18, blush: 0.1,  dead: 0 },
    serious:  { curve: 0.02, browRaise: 0,    browTilt: -0.18, lidOpen: 0.9, squint: 0,   form: "smile", pupil: 0.28, blush: 0,    dead: 0 },
    menace:   { curve: 0.32, browRaise: 0.12, browTilt: -0.1, lidOpen: 0.60, squint: 0,   form: "smile", pupil: 0.04, blush: 0,    dead: 0.9 },
  };

  var VISEME = {
    A: { open: 0.80, form: "open" },
    I: { open: 0.35, form: "open" },
    U: { open: 0.32, form: "o" },
    E: { open: 0.50, form: "open" },
    O: { open: 0.62, form: "o" },
  };

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function create(genome, canvas, opts) {
    opts = opts || {};
    var D = genome.dials;
    var rng = I.prng.Rand("idol:puppet:" + genome.seed);

    /* ── live state ── */
    var mode = "idle";                       // idle | dance | walk
    var dancePhase = 0, walkPhase = 0, walkDir = 1, leanX = 0;
    var bpm = 108 + (genome.seed % 14);

    // expression FSM
    var weights = { neutral: 1 }, activeEmo = "neutral", emoUntil = 0;

    // gaze: spring + saccades
    var gaze = { x: 0, y: 0 }, gazeV = { x: 0, y: 0 };
    var lookTarget = { x: 0, y: 0 }, cursor = { x: 0, y: 0 }, hasCursor = false;
    var saccadeUntil = 0, nextSaccade = 1;
    var holdGazeUntil = 0;

    // blink
    var lid = 0, blinkT = -1, nextBlink = 1.5 + rng.f() * 2;

    // beats (envelopes)
    var dead = 0, deadT = -1, deadHold = 0;
    var glitch = 0, glitchT = -1, glitchDir = 1;
    var blushBoost = 0, blushT = -1;
    var headTwitch = 0;

    // speech
    var speaking = false, viseme = null, visemeT = 0, mouthOpen = 0;

    // fidgets
    var nextFidget = 4 + rng.f() * 6, fidget = { tilt: 0, tiltV: 0, impulseT: -1, impulse: 0 };

    // hair spring
    var hairX = 0, hairV = 0, prevSway = 0;

    var now = 0;

    /* cursor tracking — her pursuit target */
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
      var px = (e.touches ? e.touches[0].clientX : e.clientX);
      var py = (e.touches ? e.touches[0].clientY : e.clientY);
      cursor.x = clamp((px - cx) / (r.width * 0.45), -1, 1);
      cursor.y = clamp((py - cy) / (r.height * 0.45), -0.8, 0.8);
      hasCursor = true;
    }
    if (typeof window !== "undefined" && canvas && canvas.addEventListener) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("touchmove", onMove, { passive: true });
    }

    /* ── public API ── */
    function setEmotion(emo, holdSec) {
      if (!EXPR[emo]) emo = "neutral";
      activeEmo = emo;
      emoUntil = now + (holdSec != null ? holdSec : 3.0);
    }
    function beat(name, sec) {
      if (name === "deadEyes") { deadT = 0; deadHold = sec != null ? sec : 1.2 + rng.f() * 1.2; headTwitch = (rng.chance(0.5) ? 1 : -1) * (0.02 + genome.persona.glitchy * 0.03); }
      else if (name === "glitch") { glitchT = 0; glitchDir = rng.chance(0.5) ? 1 : -1; }
      else if (name === "holdGaze") { holdGazeUntil = now + (sec != null ? sec : 2.5); }
      else if (name === "blush") { blushT = 0; }
    }
    function setMode(m) { mode = m; }
    function setSpeaking(s) { speaking = s; if (!s) viseme = null; }
    function sayViseme(v) { if (VISEME[v]) { viseme = v; visemeT = 0; } }

    /* ── per-frame update ── */
    function frame(tSec, dt) {
      now = tSec;
      dt = clamp(dt, 0.001, 0.05);

      /* expressions: attack fast, release at the LATENCY dial — the hang time
         after the topic shifts is what reads as an inner life */
      if (now > emoUntil && activeEmo !== "neutral") setEmotion("neutral");
      var target = {}; target[activeEmo] = 1;
      for (var k in EXPR) {
        var w = weights[k] || 0, tw = target[k] || 0;
        var tau = tw > w ? 0.07 : 0.25 + D.latency;
        weights[k] = w + (tw - w) * clamp(dt / tau, 0, 1);
      }
      var P = { curve: 0, browRaise: 0, browTilt: 0, lidOpen: 0, squint: 0, pupil: 0, blush: 0, dead: 0, form: "smile" };
      var formW = 0;
      for (var e in weights) {
        var wt = weights[e]; if (wt < 0.01) continue;
        var E = EXPR[e];
        P.curve += E.curve * wt; P.browRaise += E.browRaise * wt; P.browTilt += E.browTilt * wt;
        P.lidOpen += E.lidOpen * wt; P.squint += E.squint * wt; P.pupil += E.pupil * wt;
        P.blush += E.blush * wt; P.dead += E.dead * wt;
        if (wt > formW) { formW = wt; P.form = E.form; }
      }

      /* breathing — never stops */
      var breath = Math.sin(tSec * 1.35) * 0.008 + Math.sin(tSec * 0.31) * 0.004;

      /* gaze: pursuit spring + saccades; holdGaze (weighted lines) locks on
         a beat too long — ~300ms past comfortable, by the dial */
      var holding = now < holdGazeUntil;
      var wantX = hasCursor ? cursor.x : Math.sin(tSec * 0.23) * 0.3;
      var wantY = hasCursor ? cursor.y : Math.sin(tSec * 0.17) * 0.2;
      if (!holding && now > nextSaccade) {           // saccade: a quick dart away
        saccadeUntil = now + 0.13;
        nextSaccade = now + 1.6 + rng.f() * 2.6 / D.blinkRate;
        lookTarget.x = clamp(wantX + (rng.f() - 0.5) * 0.9, -1, 1);
        lookTarget.y = clamp(wantY + (rng.f() - 0.5) * 0.5, -0.8, 0.8);
      } else if (now > saccadeUntil) {
        lookTarget.x += (wantX - lookTarget.x) * clamp(dt * (holding ? 2.2 : 6), 0, 1);
        lookTarget.y += (wantY - lookTarget.y) * clamp(dt * (holding ? 2.2 : 6), 0, 1);
      }
      var k = holding ? 40 : 110, c = holding ? 11 : 16;
      gazeV.x += (k * (lookTarget.x - gaze.x) - c * gazeV.x) * dt;
      gazeV.y += (k * (lookTarget.y - gaze.y) - c * gazeV.y) * dt;
      gaze.x = clamp(gaze.x + gazeV.x * dt, -1, 1);
      gaze.y = clamp(gaze.y + gazeV.y * dt, -0.8, 0.8);

      /* blink: scheduled, occasional double-blink bursts; eerie girls blink less */
      if (now > nextBlink && blinkT < 0) {
        blinkT = 0;
        var mean = 3.4 / D.blinkRate;
        nextBlink = now + mean * (0.4 + rng.f() * 1.4);
        if (rng.chance(0.14)) nextBlink = Math.min(nextBlink, now + 0.45); // burst: again soon
      }
      if (blinkT >= 0) {
        blinkT += dt;
        var ph = blinkT / 0.21;                       // 210ms full blink
        lid = ph < 0.35 ? ph / 0.35 : ph < 0.55 ? 1 : Math.max(0, 1 - (ph - 0.55) / 0.45);
        if (ph >= 1) { blinkT = -1; lid = 0; }
      }

      /* beats → envelopes */
      if (deadT >= 0) {
        deadT += dt;
        dead = deadT < 0.25 ? deadT / 0.25 : deadT < 0.25 + deadHold ? 1 : Math.max(0, 1 - (deadT - 0.25 - deadHold) / 0.7);
        if (dead <= 0 && deadT > 0.25 + deadHold) deadT = -1;
      }
      if (glitchT >= 0) {
        glitchT += dt;
        glitch = Math.max(0, 0.9 - glitchT * 2.6);
        if (glitch <= 0) glitchT = -1;
      }
      if (blushT >= 0) {
        blushT += dt;
        blushBoost = blushT < 0.4 ? blushT * 1.5 : Math.max(0, 0.6 - (blushT - 0.4) * 0.25);
        if (blushBoost <= 0) { blushT = -1; blushBoost = 0; }
      }
      headTwitch *= Math.pow(0.02, dt);               // fast-decaying jerk

      /* fidgets: head tilts, weight shifts — rate from the dial */
      if (now > nextFidget) {
        nextFidget = now + (5 + rng.f() * 9) / D.fidgetRate;
        fidget.impulse = (rng.f() - 0.5) * 0.35;
        fidget.tiltV += fidget.impulse * 3;
      }
      fidget.tiltV += (-fidget.tilt * 26 - fidget.tiltV * 7) * dt;
      fidget.tilt += fidget.tiltV * dt;

      /* speech mouth */
      if (speaking) {
        visemeT += dt;
        var V = viseme ? VISEME[viseme] : { open: 0.3 };
        var target2 = V.open * (0.75 + Math.sin(tSec * 23) * 0.15 + rng.f() * 0.1);
        mouthOpen += (target2 - mouthOpen) * clamp(dt * 18, 0, 1);
      } else {
        mouthOpen += (0 - mouthOpen) * clamp(dt * 6, 0, 1);
      }

      /* locomotion modes */
      var bob = breath, sway = fidget.tilt * 0.35 + headTwitch, armL = 0.12, armR = 0.12, armBendL = 0.1, armBendR = 0.1, legPhase = null;
      if (mode === "dance") {
        dancePhase += dt * (bpm / 60) * Math.PI * 2;
        var p = dancePhase, variant = Math.floor(p / (Math.PI * 8)) % 2;
        if (variant === 0) {
          armL = 0.55 + Math.sin(p) * 1.05;
          armR = 0.55 + Math.sin(p + Math.PI) * 1.05;
          armBendL = 0.4 + 0.4 * Math.sin(p * 2); armBendR = 0.4 + 0.4 * Math.sin(p * 2 + 1);
        } else {
          armL = 1.35 + Math.sin(p) * 0.35;
          armR = 1.35 + Math.sin(p + Math.PI * 0.5) * 0.35;
          armBendL = 0.7; armBendR = 0.7;
        }
        bob += Math.abs(Math.sin(p)) * 0.05 - 0.01;
        sway += Math.sin(p * 0.5) * 0.055;
        leanX = Math.sin(p * 0.5) * 0.05;
      } else if (mode === "walk") {
        walkPhase += dt * 5.6;
        legPhase = walkPhase;
        leanX += walkDir * dt * 0.22;
        if (leanX > 0.34) walkDir = -1;
        if (leanX < -0.34) walkDir = 1;
        armL = 0.15 + Math.sin(walkPhase) * 0.28;
        armR = 0.15 + Math.sin(walkPhase + Math.PI) * 0.28;
        bob += Math.abs(Math.sin(walkPhase)) * 0.015;
      } else {
        leanX *= Math.pow(0.1, dt);
      }

      /* hair sway: damped spring driven by body angular velocity (fake spring
         bones — twintail tips lag the head, which is 80% of "alive") */
      var drive = (sway - prevSway) / Math.max(dt, 0.001);
      prevSway = sway;
      hairV += (-hairX * 34 - hairV * 4.5 + clamp(drive, -8, 8) * 0.02) * dt;
      hairX = clamp(hairX + hairV * dt, -0.09, 0.09);

      var mouthForm = P.form;
      if (speaking && viseme && VISEME[viseme].form === "o") mouthForm = "o";
      if (mouthOpen > 0.25) mouthForm = speaking ? (viseme === "U" || viseme === "O" ? "o" : "open") : mouthForm;

      return {
        t: tSec,
        bob: bob, sway: sway + Math.sin(tSec * 0.9) * 0.006, leanX: leanX,
        hairSway: { x: hairX, r: hairV },
        gaze: { x: gaze.x, y: gaze.y },
        lid: lid, lidOpen: P.lidOpen, squint: P.squint,
        browRaise: P.browRaise, browTilt: P.browTilt + genome.soma.browTilt,
        pupilDilate: clamp(P.pupil, 0, 1),
        mouthForm: mouthForm, mouthCurve: P.curve, mouthOpen: mouthOpen,
        blushBoost: P.blush + blushBoost,
        deadEyes: clamp(P.dead + dead, 0, 1),
        glitch: glitch + (genome.persona.glitchy > 0.5 && rng.chance(0.001) ? 0.3 : 0),
        glitchDir: glitchDir,
        armL: armL, armR: armR, armBendL: armBendL, armBendR: armBendR,
        legPhase: legPhase,
      };
    }

    return {
      frame: frame, setEmotion: setEmotion, beat: beat,
      setMode: setMode, setSpeaking: setSpeaking, sayViseme: sayViseme,
      get mode() { return mode; },
    };
  }

  I.puppet = { create: create, EXPR: EXPR };
})();
