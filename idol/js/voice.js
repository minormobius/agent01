/* idol — the voice. Web Speech API, parameterized by the genome (pitch/rate
   are in her seed, so she sounds like herself every visit). While she speaks
   we drive the puppet's visemes from the utterance's boundary events where
   the browser gives them to us, falling back to a syllable-timer where it
   doesn't. Uncoupled jaw-flapping kills the spell — the mouth only moves
   while a voice is actually running. */
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

  function create(genome, hooks) {
    hooks = hooks || {}; // { viseme(v), start(), end() }
    var ok = typeof window !== "undefined" && "speechSynthesis" in window;
    var voice = null, enabled = true, speaking = false, fallbackTimer = null;

    function pickVoice() {
      if (!ok) return;
      var vs = window.speechSynthesis.getVoices();
      if (!vs.length) return;
      var pref = /female|zira|samantha|kyoko|haruka|mei|tessa|karen|moira|google uk english female|google us english/i;
      voice = vs.find(function (v) { return pref.test(v.name) && v.lang.startsWith("en"); })
           || vs.find(function (v) { return v.lang.startsWith("en"); })
           || vs[0];
    }
    if (ok) {
      pickVoice();
      window.speechSynthesis.onvoiceschanged = pickVoice;
    }

    function stopFallback() {
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    }
    function end() {
      speaking = false;
      stopFallback();
      if (hooks.end) hooks.end();
    }

    function speak(text) {
      if (!ok || !enabled || !text) { if (hooks.end) hooks.end(); return false; }
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/[☆*~♪]/g, " "));
      if (voice) u.voice = voice;
      u.pitch = genome.voice.pitch;
      u.rate = genome.voice.rate;
      u.volume = genome.voice.volume;

      var boundarySeen = false;
      u.onstart = function () {
        speaking = true;
        if (hooks.start) hooks.start();
        // fallback viseme driver: walk the text on a syllable-ish timer until
        // a real boundary event shows up (Chrome desktop fires them; many
        // mobile browsers don't)
        var i = 0;
        fallbackTimer = setInterval(function () {
          if (boundarySeen) { stopFallback(); return; }
          while (i < text.length && !charViseme(text[i])) i++;
          if (i >= text.length) i = 0;
          if (hooks.viseme) hooks.viseme(charViseme(text[i]) || "A");
          i += 1 + Math.floor(Math.random() * 3);
        }, 110);
      };
      u.onboundary = function (e) {
        boundarySeen = true;
        stopFallback();
        var ch = text[e.charIndex] || "";
        if (hooks.viseme) hooks.viseme(charViseme(ch) || "AEIOU"[Math.floor(Math.random() * 5)]);
      };
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.speak(u);
      return true;
    }

    function cancel() {
      if (ok) window.speechSynthesis.cancel();
      end();
    }

    return {
      speak: speak, cancel: cancel,
      setEnabled: function (v) { enabled = v; if (!v) cancel(); },
      get available() { return ok; },
      get speaking() { return speaking; },
    };
  }

  I.voice = { create: create };
})();
