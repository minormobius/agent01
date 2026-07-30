/* Hold the Line — a very small synth.
 *
 * No audio files: everything is oscillators and one shared noise buffer, which
 * keeps the whole surface a handful of text files. Sound is not decoration in
 * this genre — the gun rattle is most of what tells you you are still firing,
 * and the jam buzz is faster to notice than the red rim — so it earns its
 * ~120 lines.
 *
 * The context is created on the first user gesture (browsers require it) and
 * everything degrades to silence if WebAudio is missing or blocked.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var H = NS.HORDE = NS.HORDE || {};

  function createSfx() {
    var ac = null, master = null, noise = null;
    var muted = false;
    try { muted = NS.localStorage.getItem("horde.muted") === "1"; } catch (e) { /* private mode */ }

    function ensure() {
      if (ac) return ac;
      var Ctor = NS.AudioContext || NS.webkitAudioContext;
      if (!Ctor) return null;
      try { ac = new Ctor(); } catch (e) { return null; }
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ac.destination);

      // One second of white noise, reused by every percussive sound.
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return ac;
    }

    function burst(opts) {
      if (!ensure() || muted) return;
      var t = ac.currentTime;
      var src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      var filt = ac.createBiquadFilter();
      filt.type = opts.type || "lowpass";
      filt.frequency.setValueAtTime(opts.f0, t);
      if (opts.f1 != null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f1), t + opts.dur);
      filt.Q.value = opts.q || 1;
      var g = ac.createGain();
      g.gain.setValueAtTime(opts.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start(t);
      src.stop(t + opts.dur + 0.02);
    }

    function tone(opts) {
      if (!ensure() || muted) return;
      var t = ac.currentTime;
      var o = ac.createOscillator();
      o.type = opts.wave || "square";
      o.frequency.setValueAtTime(opts.f0, t);
      if (opts.f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t + opts.dur);
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
      o.connect(g); g.connect(master);
      o.start(t);
      o.stop(t + opts.dur + 0.02);
    }

    // The gun. Called from the frame loop, self-rate-limited — a machine gun is
    // a rhythm, and letting the frame rate set it would make a 144Hz screen
    // sound different from a 60Hz one.
    var lastShot = 0;
    function shot(now, strength) {
      if (now - lastShot < 0.085) return;
      lastShot = now;
      burst({ f0: 1400, f1: 350, dur: 0.06, gain: 0.10 * (0.4 + 0.6 * strength), q: 0.9 });
    }

    return {
      resume: function () { if (ensure() && ac.state === "suspended") ac.resume(); },
      shot: shot,
      kill: function () { burst({ f0: 2600, f1: 900, dur: 0.045, gain: 0.05 }); },
      brute: function () { tone({ wave: "sawtooth", f0: 180, f1: 55, dur: 0.34, gain: 0.16 }); },
      leak: function () {
        burst({ f0: 260, f1: 60, dur: 0.3, gain: 0.34 });
        tone({ wave: "triangle", f0: 130, f1: 48, dur: 0.36, gain: 0.2 });
      },
      jam: function () { burst({ type: "bandpass", f0: 320, dur: 0.4, gain: 0.3, q: 7 }); },
      grenade: function () {
        burst({ f0: 900, f1: 45, dur: 0.55, gain: 0.5 });
        tone({ wave: "sine", f0: 90, f1: 30, dur: 0.5, gain: 0.3 });
      },
      wave: function () { tone({ wave: "square", f0: 330, f1: 660, dur: 0.16, gain: 0.14 }); },
      gate: function () { tone({ wave: "sine", f0: 660, f1: 990, dur: 0.22, gain: 0.14 }); },
      pick: function () { tone({ wave: "square", f0: 520, f1: 1040, dur: 0.12, gain: 0.16 }); },
      timeout: function () { tone({ wave: "sawtooth", f0: 300, f1: 140, dur: 0.3, gain: 0.18 }); },
      death: function () {
        tone({ wave: "sawtooth", f0: 240, f1: 30, dur: 1.3, gain: 0.3 });
        burst({ f0: 700, f1: 40, dur: 1.1, gain: 0.3 });
      },
      muted: function () { return muted; },
      toggle: function () {
        muted = !muted;
        try { NS.localStorage.setItem("horde.muted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
        if (master) master.gain.value = muted ? 0 : 0.5;
        return muted;
      },
    };
  }

  H.createSfx = createSfx;
})();
