/* reader-tts.js — synchronized text-to-speech narration */

const TTS = (() => {
  let enabled = false;
  let speaking = false;
  let utterances = [];   // queue of SpeechSynthesisUtterance
  let uttIndex = 0;
  let paused = false;

  function isSupported() {
    return 'speechSynthesis' in window;
  }

  function isEnabled() { return enabled; }
  function isSpeaking() { return speaking; }

  function setEnabled(on) {
    enabled = on;
    if (!on) stop();
  }

  // Split text into sentences for natural TTS pacing
  function splitSentences(text) {
    // Split on sentence-ending punctuation followed by space or end
    const raw = text.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g) || [text];
    return raw.map(s => s.trim()).filter(s => s.length > 0);
  }

  // Speak a full chapter text (for scroll and crawl modes)
  function speakChapter(text) {
    if (!enabled || !isSupported()) return;
    stop();

    const sentences = splitSentences(text);
    utterances = sentences.map(s => {
      const u = new SpeechSynthesisUtterance(s);
      u.rate = 1.0;
      return u;
    });
    uttIndex = 0;
    speaking = true;
    paused = false;
    speakNext();
  }

  function speakNext() {
    if (!speaking || uttIndex >= utterances.length) {
      speaking = false;
      return;
    }
    const u = utterances[uttIndex];
    u.onend = () => {
      uttIndex++;
      if (speaking && !paused) speakNext();
    };
    u.onerror = () => {
      uttIndex++;
      if (speaking && !paused) speakNext();
    };
    window.speechSynthesis.speak(u);
  }

  // Speak a single chunk (for RSVP mode — called per frame)
  function speakChunk(text) {
    if (!enabled || !isSupported()) return;
    // Cancel any pending chunk speech and speak this one
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.2; // slightly faster to keep pace with RSVP
    window.speechSynthesis.speak(u);
  }

  function pause() {
    if (!isSupported()) return;
    paused = true;
    window.speechSynthesis.pause();
  }

  function resume() {
    if (!isSupported()) return;
    paused = false;
    window.speechSynthesis.resume();
  }

  function stop() {
    if (!isSupported()) return;
    speaking = false;
    paused = false;
    utterances = [];
    uttIndex = 0;
    window.speechSynthesis.cancel();
  }

  function togglePause() {
    if (paused) resume();
    else pause();
  }

  return { isSupported, isEnabled, isSpeaking, setEnabled, speakChapter, speakChunk, pause, resume, stop, togglePause };
})();
