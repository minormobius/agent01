// sound.js — the world, as music. Pure-JS DSP (the studio's way: node renders and measures it; the page
// runs the same code in an AudioWorklet).
//
// The population is the score. The engine keeps its own musical time (a tempo, bars, a slow chord
// progression) and is told, a few times a second, who is alive and what just happened:
//
//   voices   each living species (the commonest six) sings a sustained vowel: a formant voice (a
//            band-limited pulse through three formant filters, a little breath), on one tone of the
//            current chord (which tone, and which vowel, come from its body plan), an octave by its
//            size, as loud as the square root of its number. A thriving world is a full choir; a
//            collapse thins to one voice; a new species enters as a new voice
//   pulse    fins: a soft tick on the sixteenths, as dense as the world is swimming
//   buds     a plucked note (a marimba-ish bar) in the budding species' tone
//   new      a new body plan: a bright three-note rise
//   bites    a snap (a click through a high band-pass: snapping shrimp); a kill, a low thud
//   bass     the chord's root, as warm as the water is rich
//
// Events are quantized to the next sixteenth. A small reverb puts it all in water.

const TAU = Math.PI * 2;
// the progression (i – VI – III – VII in D minor): each chord's tones as semitones above D3, and its root
export const CHORDS = [
  { root: -12, tones: [0, 3, 7, 14] },     // Dm (add 9)
  { root: -16, tones: [-4, 0, 3, 10] },    // Bb (add 9)
  { root: -9, tones: [3, 7, 10, 17] },     // F (add 9)
  { root: -14, tones: [-2, 2, 5, 12] },    // C (add 9)
];
const D3 = 146.83;
const hz = (semi) => D3 * 2 ** (semi / 12);
// vowel formants (F1, F2, F3) and widths
export const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 2950], o: [500, 900, 2400], u: [330, 870, 2240], ae: [660, 1720, 2410], er: [490, 1350, 1690] };
const VKEYS = Object.keys(VOWELS);
const hashStr = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
/** A species' voice from its body plan: which chord tone, which vowel, which octave. */
export function voiceOf(sig, organs = 4) {
  const h = hashStr(sig);
  return { tone: h % 4, vowel: VKEYS[(h >>> 3) % VKEYS.length], oct: organs >= 7 ? -12 : organs <= 3 ? 12 : 0 };
}

class Biquad {                                   // a band-pass (constant peak gain), RBJ
  constructor() { this.z1 = 0; this.z2 = 0; this.set(1000, 5, 44100); }
  set(f, q, sr) { const w = TAU * Math.min(f, sr * 0.45) / sr, a = Math.sin(w) / (2 * q), n = 1 + a; this.b0 = a / n; this.b2 = -a / n; this.a1 = -2 * Math.cos(w) / n; this.a2 = (1 - a) / n; }
  run(x) { const y = this.b0 * x + this.z1; this.z1 = -this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
}

export function makeEngine(sr = 44100, { bpm = 96 } = {}) {
  const sixteenth = (60 / bpm / 4) * sr, barLen = sixteenth * 16;
  let t = 0, nextTick = 0, tick = 0, seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // the choir: six voice slots, each gliding to its target pitch and gain
  const slots = Array.from({ length: 6 }, () => ({ key: null, f: 220, tf: 220, g: 0, tg: 0, ph: 0, vib: rnd() * TAU, vowel: 'a', F: [new Biquad(), new Biquad(), new Biquad()], pan: 0.5 }));
  let state = { species: [], swim: 0, rich: 0.5 }, queue = [], bites = 0;
  const hits = [];                               // sounding one-shots: { kind, age, f, g, pan, ph }
  // reverb (Freeverb's shape): eight damped combs in parallel, then two all-passes; its send is high-passed,
  // so the bass stays dry (a four-delay network rang at some pitches and the level jumped 9 dB a chord)
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => ({ buf: new Float32Array(Math.round(n * sr / 44100)), i: 0, lp: 0 }));
  const aps = [556, 441].map((n) => ({ buf: new Float32Array(Math.round(n * sr / 44100)), i: 0 }));
  let hpX = 0, hpY = 0;
  let bassPh = 0, bassG = 0;
  const chord = () => CHORDS[Math.floor(t / (barLen * 2)) % CHORDS.length];

  function setVoices() {
    // the commonest six species take the slots; a slot keeps its species while it lives
    const want = state.species.slice(0, 6), c = chord();
    for (const s of slots) if (s.key && !want.some((w) => w.sig === s.key)) { s.key = null; s.tg = 0; }
    for (const w of want) {
      let s = slots.find((x) => x.key === w.sig) || slots.find((x) => !x.key && x.g < 0.002) || slots.find((x) => !x.key);
      if (!s) continue;
      const v = voiceOf(w.sig, w.organs), f = hz(c.tones[v.tone] + v.oct);
      if (s.key !== w.sig) { s.key = w.sig; s.f = f; s.vowel = v.vowel; s.pan = 0.2 + 0.6 * ((hashStr(w.sig) >>> 9) % 100) / 100; VOWELS[s.vowel].forEach((F, k) => s.F[k].set(F, [3.5, 5, 7][k], sr)); }
      s.tf = f; s.tg = 0.2 * Math.min(3, Math.sqrt(w.count));
    }
  }
  function fire(e) {
    const c = chord(), v = e.sig ? voiceOf(e.sig, e.organs) : { tone: 0, oct: 0 };
    if (e.type === 'bud') hits.push({ kind: 'pluck', age: 0, f: hz(c.tones[v.tone] + v.oct + 12), g: 0.16, pan: 0.3 + 0.4 * rnd(), ph: 0 });
    else if (e.type === 'new') [0, 1, 2].forEach((k) => hits.push({ kind: 'pluck', age: -k * sixteenth, f: hz(c.tones[(v.tone + k) % 4] + 24), g: 0.13, pan: 0.5, ph: 0 }));
    else if (e.type === 'bite') hits.push({ kind: 'snap', age: 0, f: 0, g: 0.22, pan: rnd(), ph: 0, bp: Object.assign(new Biquad(), {}) });
    else if (e.type === 'eaten') hits.push({ kind: 'thud', age: 0, f: 90, g: 0.5, pan: 0.5, ph: 0 });
  }
  let noise = 22222;
  const white = () => ((noise = (Math.imul(noise, 1103515245) + 12345) >>> 0) / 2147483648 - 1);

  return {
    /** Who is alive: species [{ sig, count, organs }] (commonest first), swim (0..1), rich (0..1). */
    state(s) { state = { ...state, ...s }; setVoices(); },
    /** Something happened: { type: 'bud' | 'new' | 'bite' | 'eaten', sig, organs }. Sounds on the next sixteenth. */
    event(e) { if (e.type === 'bite') bites = Math.min(4, bites + 1); else if (queue.length < 64) queue.push(e); },
    get time() { return t / sr; },
    /** Render n samples into L and R. */
    render(L, R, n) {
      for (let i = 0; i < n; i++, t++) {
        if (t >= nextTick) {                                   // a sixteenth
          nextTick += sixteenth; tick++;
          if (tick % 32 === 1) setVoices();                    // a new chord: every voice moves to its tone in it
          const q = queue.splice(0, 4); for (const e of q) fire(e);
          for (let k = Math.min(2, bites); k > 0; k--) { fire({ type: 'bite' }); bites--; }   // bites: at most two a sixteenth
          // the fins' pulse: ticks as dense as the swimming (always on the beat, more off it)
          const p = state.swim * (tick % 4 === 1 ? 1 : tick % 2 === 1 ? 0.6 : 0.35);
          if (rnd() < p) hits.push({ kind: 'tick', age: 0, f: 0, g: 0.05 + 0.04 * (tick % 4 === 1), pan: 0.2 + 0.6 * rnd(), ph: 0 });
        }
        let l = 0, r = 0;
        // the choir
        for (const s of slots) {
          s.f += (s.tf - s.f) * 0.0004; s.g += (s.tg - s.g) * 0.00012;
          if (s.g < 1e-4) continue;
          s.vib += TAU * 5.1 / sr;
          const f = s.f * (1 + 0.006 * Math.sin(s.vib));
          s.ph += f / sr; if (s.ph >= 1) s.ph -= 1;
          // a glottal-ish pulse: a saw softened (its derivative flow), and breath
          const saw = 2 * s.ph - 1, src = saw - saw ** 3 * 0.35 + white() * 0.025;
          const y = (s.F[0].run(src) * 1.0 + s.F[1].run(src) * 0.55 + s.F[2].run(src) * 0.25) * s.g;
          l += y * (1 - s.pan); r += y * s.pan;
        }
        // the bass: the chord's root, as warm as the water is rich
        const c = chord(); bassG += ((0.025 + 0.05 * state.rich) - bassG) * 0.00005;
        bassPh += hz(c.root) / 2 / sr; if (bassPh >= 1) bassPh -= 1;
        const b = (Math.sin(TAU * bassPh) + 0.25 * Math.sin(2 * TAU * bassPh)) * bassG; l += b; r += b;
        // one-shots
        for (let k = hits.length - 1; k >= 0; k--) {
          const h = hits[k]; h.age++;
          if (h.age < 0) continue;
          const a = h.age / sr; let y = 0, done = false;
          if (h.kind === 'pluck') { h.ph += h.f / sr; y = (Math.sin(TAU * h.ph) + 0.35 * Math.sin(TAU * h.ph * 3.98) * Math.exp(-a * 18)) * Math.exp(-a * 5) * h.g; done = a > 1.4; }
          else if (h.kind === 'tick') { y = white() * Math.exp(-a * 400) * h.g; y = y - (h.last || 0) * 0.9; h.last = y; done = a > 0.03; }
          else if (h.kind === 'snap') { if (!h.bp.b0 || h.age === 1) h.bp.set(4200 + 2000 * h.pan, 3, sr); y = h.bp.run(white()) * Math.exp(-a * 180) * h.g * 3; done = a > 0.05; }
          else if (h.kind === 'thud') { h.ph += (h.f * (1 + 2 * Math.exp(-a * 30))) / sr; y = Math.sin(TAU * h.ph) * Math.exp(-a * 9) * h.g; done = a > 0.6; }
          l += y * (1 - h.pan) * 2 * 0.5 + y * 0.25; r += y * h.pan * 2 * 0.5 + y * 0.25;
          if (done) hits.splice(k, 1);
        }
        // water: a small reverb
        const x = (l + r) * 0.5 - b; hpY = 0.985 * (hpY + x - hpX); hpX = x;          // the send, without the bass, high-passed
        let wet = 0;
        for (const d of combs) { const o = d.buf[d.i]; d.lp = o * 0.6 + d.lp * 0.4; d.buf[d.i] = hpY * 0.03 + d.lp * 0.8; d.i = (d.i + 1) % d.buf.length; wet += o; }
        for (const a2 of aps) { const o = a2.buf[a2.i]; a2.buf[a2.i] = wet + o * 0.5; wet = o - wet; a2.i = (a2.i + 1) % a2.buf.length; }
        L[i] = Math.tanh((l + wet * 0.5) * 1.4) * 0.8; R[i] = Math.tanh((r + wet * 0.45) * 1.4) * 0.8;
      }
    },
  };
}

/**
 * The conductor: reads a World and tells an engine (or a worklet's port) what to sing. Call `listen`
 * after every world step (it collects that step's bites, buds, kills and new plans), and `tell` a few
 * times a second (it sends who is alive).
 */
export function makeConductor(send, { signature, LETTER } = {}) {
  let known = null, lastNext = 0, lastDead = 0, events = [];
  return {
    listen(W) {
      if (known === null) { known = new Set(Object.keys(W.book)); lastNext = W.next; lastDead = W.dead.length; }
      if (W.bites.length) events.push({ type: 'bite' });
      if (W.next > lastNext) {
        for (const B of W.bodies.slice(-(W.next - lastNext))) {
          const sig = B.sig ||= signature(B.genome);
          if (!known.has(sig)) { known.add(sig); events.push({ type: 'new', sig, organs: B.plan.length }); }
          else if (events.length < 24) events.push({ type: 'bud', sig, organs: B.plan.length });
        }
        lastNext = W.next;
      }
      for (const d of W.dead.slice(lastDead)) if (d.cause === 'eaten') events.push({ type: 'eaten' });
      lastDead = W.dead.length;
    },
    tell(W) {
      const by = new Map();
      let swim = 0;
      for (const B of W.bodies) {
        const sig = B.sig ||= signature(B.genome), c = by.get(sig) || { sig, count: 0, organs: B.plan.length };
        c.count++; by.set(sig, c);
        const fins = B.organs.filter((o) => o.type === 'fin').length;
        if (fins) swim += fins * Math.max(0.1, 1 - B.E / B.capacity());
      }
      let rich = 0; for (let i = 0; i < W.medium.length; i += 7) rich += W.medium[i]; rich = Math.min(1, rich / (W.medium.length / 7) / 0.25);
      send({ state: { species: [...by.values()].sort((a, b) => b.count - a.count), swim: Math.min(1, swim / 40), rich }, events: events.splice(0) });
    },
  };
}
