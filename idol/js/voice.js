/* idol — the voice, v2. ElevenLabs through the worker, with per-character
   alignment driving the puppet's visemes — real lip-sync, not jaw-flapping.

   Fallback chain (the spell must never break):
     1. POST /api/voice (ElevenLabs with-timestamps, voice picked by her seed,
        expressiveness from her persona) — played as <audio>, alignment chars
        → vowel visemes on a 50ms clock.
     2. speechSynthesis (browser voice, genome pitch/rate) with boundary
        events where the browser fires them, a syllable-timer where it doesn't.
     3. silent: the mouth still moves on the timer (muted, not broken). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var I = NS.IDOL = NS.IDOL || {};

  function charViseme(ch) {
    ch = (ch || "").toLowerCase();
    if ("aáàâ".includes(ch)) return "A";
    if ("ieéèêy".includes(ch)) return "I";
    if ("uoúùûw".includes(ch)) return "U";
    if ("eë".includes(ch)) return "E";
    if ("oóòô".includes(ch)) return "O";
    return null;
  }
  function b64ToBlob(b64, mime) {
    var bin = atob(b64), len = bin.length, buf = new Uint8Array(len);
    for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  function create(genome, hooks) {
    hooks = hooks || {}; // { viseme(v), start(), end() }
    var hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;
    var enabled = true, speaking = false;
    var elConfigured = false, probed = false;
    var audio = null, visemeTimer = null, fallbackTimer = null, synthVoice = null;

    /* probe the worker once — is ElevenLabs wired up? */
    if (typeof fetch !== "undefined") {
      fetch("/api/voice").then(function (r) { return r.json(); }).then(function (j) {
        elConfigured = !!j.configured; probed = true;
      }).catch(function () { probed = true; });
    }

    /* ── shared timers ── */
    function stopTimers() {
      if (visemeTimer) { clearInterval(visemeTimer); visemeTimer = null; }
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    }
    function end() {
      speaking = false;
      stopTimers();
      if (hooks.end) hooks.end();
    }

    /* alignment-driven visemes: a 50ms clock walks audio.currentTime through
       the character start-times; vowels map to the five mouth shapes */
    function runAlignmentVisemes(getTime, chars, starts) {
      var lastV = null;
      visemeTimer = setInterval(function () {
        var t = getTime();
        var i = starts.length - 1;
        while (i > 0 && starts[i] > t) i--;
        // scan forward a few chars for the nearest vowel at/after t
        var v = null;
        for (var k = i; k < Math.min(chars.length, i + 4); k++) {
          v = charViseme(chars[k]);
          if (v) break;
        }
        if (!v) v = "A";
        if (v !== lastV && hooks.viseme) hooks.viseme(v);
        lastV = v;
      }, 50);
    }

    /* silent-mouth fallback: walk the text on a syllable-ish timer */
    function runTimerVisemes(text) {
      var i = 0;
      fallbackTimer = setInterval(function () {
        while (i < text.length && !charViseme(text[i])) i++;
        if (i >= text.length) i = 0;
        if (hooks.viseme) hooks.viseme(charViseme(text[i]) || "A");
        i += 1 + Math.floor(Math.random() * 3);
      }, 110);
    }

    /* ── tier 1: ElevenLabs ── */
    function speakElevenLabs(text) {
      var settings = {
        stability: 0.55 - genome.persona.playful * 0.25,
        similarity_boost: 0.75,
        style: 0.25 + genome.persona.playful * 0.3,
        speed: genome.voice.rate,
      };
      return fetch("/api/voice", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text, seed: genome.seed, settings: settings }),
      }).then(function (r) {
        if (!r.ok) throw new Error("voice " + r.status);
        return r.json();
      }).then(function (j) {
        if (!j.audio) throw new Error("no audio");
        if (!enabled) return true;
        var url = URL.createObjectURL(b64ToBlob(j.audio, "audio/mpeg"));
        audio = new Audio(url);
        audio.onplay = function () {
          speaking = true;
          if (hooks.start) hooks.start();
          if (j.characters && j.starts && j.starts.length) {
            runAlignmentVisemes(function () { return audio ? audio.currentTime : 0; }, j.characters, j.starts);
          } else {
            runTimerVisemes(text);
          }
        };
        audio.onended = function () { URL.revokeObjectURL(url); audio = null; end(); };
        audio.onerror = function () { URL.revokeObjectURL(url); audio = null; end(); };
        var p = audio.play();
        if (p && p.catch) p.catch(function () { end(); });
        return true;
      });
    }

    /* ── tier 2: speechSynthesis ── */
    function pickSynthVoice() {
      if (!hasSynth) return;
      var vs = window.speechSynthesis.getVoices();
      if (!vs.length) return;
      var pref = /female|zira|samantha|kyoko|haruka|mei|tessa|karen|moira|google uk english female|google us english/i;
      synthVoice = vs.find(function (v) { return pref.test(v.name) && v.lang.startsWith("en"); })
                || vs.find(function (v) { return v.lang.startsWith("en"); })
                || vs[0];
    }
    if (hasSynth) {
      pickSynthVoice();
      window.speechSynthesis.onvoiceschanged = pickSynthVoice;
    }
    function speakSynth(text) {
      if (!hasSynth) return false;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/[☆*~♪]/g, " "));
      if (synthVoice) u.voice = synthVoice;
      u.pitch = genome.voice.pitch;
      u.rate = genome.voice.rate;
      u.volume = genome.voice.volume;
      var boundarySeen = false;
      u.onstart = function () {
        speaking = true;
        if (hooks.start) hooks.start();
        runTimerVisemes(text);
      };
      u.onboundary = function (e) {
        if (!boundarySeen) { boundarySeen = true; stopTimers(); }
        var ch = text[e.charIndex] || "";
        if (hooks.viseme) hooks.viseme(charViseme(ch) || "AEIOU"[Math.floor(Math.random() * 5)]);
      };
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.speak(u);
      return true;
    }

    function speak(text) {
      if (!enabled || !text) return false;
      cancel();
      if (elConfigured) {
        speakElevenLabs(text).catch(function () {
          elConfigured = false;             // degrade once, stay degraded
          if (!speakSynth(text)) runTimerVisemes(text);
        });
        return true;
      }
      if (probed && speakSynth(text)) return true;
      if (probed) { runTimerVisemes(text); return true; }
      return false;                          // still probing; skip this line
    }

    function cancel() {
      if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
      if (hasSynth) window.speechSynthesis.cancel();
      end();
    }

    return {
      speak: speak, cancel: cancel,
      setEnabled: function (v) { enabled = v; if (!v) cancel(); },
      get available() { return true; },
      get speaking() { return speaking; },
      get engine() { return elConfigured ? "elevenlabs" : (hasSynth ? "synthesis" : "silent"); },
    };
  }

  I.voice = { create: create };
})();
