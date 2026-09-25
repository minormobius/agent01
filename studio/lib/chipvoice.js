// chipvoice.js — a voice from arithmetic: text to speech by formant synthesis, in plain JS
// (node, a worker, the page alike). The old way, before any model: Klatt (1980), DECtalk,
// the Speak & Spell, SAM on the C64.
//
//   text ─ words ─ phonemes (a lexicon, CMU's) ─ durations and pitch (rules) ─ targets per
//   phoneme ─ parameter tracks every 5 ms, smoothed (coarticulation) ─ a synthesiser
//
// The synthesiser (renderFormant) is Klatt's shape, cut down:
//   voicing: a glottal pulse (KLGLOTT88's flow, differentiated) at F0, plus aspiration noise
//   ─► cascade: nasal pole/zero pair ─► F1 ─► F2 ─► F3 ─► F4 ─► F5   (the vowels, the glides)
//   noise ─► parallel: two band-passes and a bypass                  (s, sh, f, bursts)
//
// Everything a voice is lives in VOICE: pitch, formant scale, rate, breathiness. The render
// is deterministic (noise from a fixed LFSR), so a change to a rule is a change you can
// measure: studio/tools/voice.mjs scores it with Whisper.

import { PROFILE } from './chipvoice-profile.js';
import { FIT } from './chipvoice-fit.js';

// ---- text ----------------------------------------------------------------------------
/** The words of a text, lowercased, apostrophes kept ("it's"). */
export function words(text) {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []);
}

// ---- phonemes ------------------------------------------------------------------------
// ARPAbet. F: formant targets (Hz, an adult male's; VOICE.scale shifts them), dur: inherent ms.
// kind: v vowel, d diphthong (F → F2), g glide/liquid, n nasal, f fricative, s stop, a affricate, h aspirate
const V = (F, dur, extra = {}) => ({ kind: 'v', F, dur, ...extra });
export const PHONES = {
  IY: V([270, 2290, 3010], 130), IH: V([390, 1990, 2550], 90), EH: V([530, 1840, 2480], 110),
  AE: V([660, 1720, 2410], 150), AA: V([730, 1090, 2440], 150), AO: V([570, 840, 2410], 150),
  UH: V([440, 1020, 2240], 100), UW: V([300, 870, 2240], 140), AH: V([640, 1190, 2390], 100),
  ER: V([490, 1350, 1690], 140),
  AX: V([500, 1500, 2500], 60),                                    // schwa: AH0
  EY: { kind: 'd', F: [480, 1720, 2520], F2: [330, 2200, 2700], dur: 160 },
  AY: { kind: 'd', F: [660, 1200, 2550], F2: [400, 1880, 2500], dur: 180 },
  OW: { kind: 'd', F: [540, 1100, 2300], F2: [450, 900, 2300], dur: 160 },
  AW: { kind: 'd', F: [640, 1230, 2550], F2: [420, 940, 2350], dur: 180 },
  OY: { kind: 'd', F: [550, 960, 2400], F2: [360, 1820, 2450], dur: 180 },
  W: { kind: 'g', F: [290, 610, 2150], dur: 70 }, Y: { kind: 'g', F: [260, 2070, 3020], dur: 60 },
  R: { kind: 'g', F: [310, 1060, 1380], dur: 70 }, L: { kind: 'g', F: [310, 1050, 2880], dur: 70, B: [60, 150, 250] },
  M: { kind: 'n', F: [270, 1100, 2150], dur: 75 }, N: { kind: 'n', F: [270, 1700, 2600], dur: 70 }, NG: { kind: 'n', F: [270, 2250, 2750], dur: 80 },
  // fricatives: frication through two band-passes [Hz, bandwidth, gain] and a bypass (flat noise)
  F: { kind: 'f', F: [300, 900, 2200], dur: 100, fr: [[1400, 1800, 0.12], [6000, 3000, 0.25]], bypass: 0.12, amp: 0.45 },
  TH: { kind: 'f', F: [300, 1400, 2600], dur: 100, fr: [[2500, 2000, 0.12], [6000, 3000, 0.22]], bypass: 0.1, amp: 0.4 },
  S: { kind: 'f', F: [300, 1700, 2600], dur: 110, fr: [[4800, 1600, 0.9], [6800, 1600, 0.6]], bypass: 0, amp: 0.95 },
  SH: { kind: 'f', F: [300, 1900, 2500], dur: 110, fr: [[2700, 1500, 1.0], [4300, 2600, 0.75]], bypass: 0, amp: 1.0 },   // broad, 2–6 kHz: a narrow peak read as a velar burst
  V: { kind: 'f', F: [300, 900, 2200], dur: 70, voiced: true, fr: [[1400, 1800, 0.1], [6000, 3000, 0.2]], bypass: 0.08, amp: 0.35 },
  DH: { kind: 'f', F: [300, 1400, 2600], dur: 55, voiced: true, fr: [[2500, 2000, 0.1], [6000, 3000, 0.18]], bypass: 0.06, amp: 0.3 },
  Z: { kind: 'f', F: [300, 1700, 2600], dur: 80, voiced: true, fr: [[4800, 1600, 0.7], [6800, 1600, 0.45]], bypass: 0, amp: 0.6 },
  ZH: { kind: 'f', F: [300, 1900, 2500], dur: 80, voiced: true, fr: [[2700, 1500, 0.8], [4300, 2600, 0.6]], bypass: 0, amp: 0.65 },
  HH: { kind: 'h', F: null, dur: 60 },
  // stops: a closure at the place's locus, a burst shaped by the place, then (voiceless) aspiration
  P: { kind: 's', F: [250, 850, 2200], dur: 85, burst: { fr: [[900, 1500, 0.35], [2500, 3000, 0.15]], bypass: 0.25 } },
  B: { kind: 's', F: [250, 850, 2200], dur: 65, voiced: true, burst: { fr: [[900, 1500, 0.3], [2500, 3000, 0.1]], bypass: 0.2 } },
  T: { kind: 's', F: [250, 1750, 2650], dur: 80, burst: { fr: [[4200, 2400, 0.85], [2900, 900, 0.3]], bypass: 0.1 } },
  D: { kind: 's', F: [250, 1750, 2650], dur: 60, voiced: true, burst: { fr: [[4200, 2400, 0.6], [2900, 900, 0.2]], bypass: 0.08 } },
  K: { kind: 's', F: [250, 1900, 2350], dur: 85, burst: { fr: [[2100, 700, 0.9], [3400, 1200, 0.35]], bypass: 0.05 } },
  G: { kind: 's', F: [250, 1900, 2350], dur: 65, voiced: true, burst: { fr: [[2100, 700, 0.65], [3400, 1200, 0.25]], bypass: 0.04 } },
  CH: { kind: 'a', F: [250, 1900, 2500], dur: 70, fric: 'SH' },
  JH: { kind: 'a', F: [250, 1900, 2500], dur: 55, voiced: true, fric: 'ZH' },
};
const FUNCTION = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'at', 'is', 'was', 'for', 'as', 'it', 'its', "it's", 'her', 'his', 'by', 'from', 'with', 'or', 'but', 'that', 'this', 'these', 'then', 'there', 'were', 'are', 'be', 'you', 'i', 'me', 'my', 'we', 'he', 'she', 'they', 'if']);
const isVowel = (p) => p && (PHONES[p].kind === 'v' || PHONES[p].kind === 'd');

// ---- the voice -------------------------------------------------------------------------
export const VOICE = {
  f0: 105,             // Hz, the middle of the voice (lower draws the formants more densely: 118 → 100 Hz was 27% → 24% WER)
  range: 0.22,         // how far stress lifts it (a fraction of f0)
  scale: 1.06,         // formant scale: 1 an adult man, ~1.15 a woman, ~1.3 a child
  rate: 1.0,           // speaking rate: 1 is Klatt's durations
  breath: 0.8,         // aspiration mixed into voicing (a clean buzz is the most robotic thing a voice can do)
  oq: 0.55,            // glottal open quotient: lower is pressed and buzzy, higher breathy
  // rules, each a number so studio/tools/voice.mjs --set can try it off (0) and on
  voicedLength: 1,     // vowels long before a voiced coda, short before a voiceless one
  functionWords: 0,    // "the", "of", "a" said quickly (off: Whisper lost them, 39% → 33% WER)
  lightDarkL: 1,       // L light before a vowel, dark after
  aspiration: 1,       // longer aspiration into a stressed vowel
  fit: 0,              // 1: targets fitted to the reference voice by analysis by synthesis (chipvoice-fit.js)
  profile: 0,          // the reference voice (chipvoice-profile.js) over the textbook: 1 its vowels, 2 its durations, 3 both
};
/** A phoneme's targets: the textbook's, or where the reference voice was measured, its (in Hz, so unscaled). */
export function phone(p, voice) {
  const f = voice.fit && FIT[p], P = f ? { ...PHONES[p], ...f } : PHONES[p], m = (voice.profile & 1) && PROFILE.vowels[p];
  if (!m) return P;
  if (P.kind === 'd') return m.F2 ? { ...P, F: m.F.map((f) => f / voice.scale), F2: m.F2.map((f) => f / voice.scale) } : P;
  return { ...P, F: m.F.map((f) => f / voice.scale) };
}

/** Pronounce a text: [{ p, stress, word, pause }], pauses as { pause: ms }. Unknown words are spelled with LTS rules. */
export function phonemize(text, lexicon) {
  const out = [{ pause: 120, mark: 'start' }];          // a breath of silence first: a voice that starts on the first sample clicks
  const tokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[.,!?;:]/g) || [];
  tokens.forEach((tok, wi) => {
    if (/^[.,!?;:]$/.test(tok)) { out.push({ pause: tok === ',' || tok === ';' || tok === ':' ? 170 : 360, mark: tok }); return; }
    const pron = lexicon[tok.toLowerCase()] || letterToSound(tok.toLowerCase());
    for (const ph of pron.split(/\s+/)) {
      const m = ph.match(/^([A-Z]+)(\d)?$/);
      if (!m) continue;
      let p = m[1], stress = m[2] === undefined ? -1 : Number(m[2]);
      if (p === 'AH' && stress === 0) p = 'AX';
      if (!PHONES[p]) continue;
      out.push({ p, stress, word: wi, w: tok.toLowerCase() });
    }
  });
  if (!out[out.length - 1].pause) out.push({ pause: 200, mark: '.' });
  out.push({ pause: 150, mark: 'end' });
  return out;
}
/** A last resort for words not in the lexicon: a crude letter-by-letter spelling. */
function letterToSound(w) {
  const map = { a: 'AE1', b: 'B', c: 'K', d: 'D', e: 'EH1', f: 'F', g: 'G', h: 'HH', i: 'IH1', j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', o: 'AA1', p: 'P', q: 'K', r: 'R', s: 'S', t: 'T', u: 'AH1', v: 'V', w: 'W', x: 'K S', y: 'Y', z: 'Z' };
  return w.replace(/'/g, '').replace(/th/g, '0').replace(/sh/g, '1').replace(/ch/g, '2').replace(/ee/g, '3').replace(/oo/g, '4')
    .split('').map((c) => ({ 0: 'TH', 1: 'SH', 2: 'CH', 3: 'IY1', 4: 'UW1' })[c] || map[c] || '').join(' ');
}

// ---- timing and pitch (rules) -------------------------------------------------------------
/**
 * Durations in ms (Klatt 1979, simplified): stressed vowels long, unstressed short, the last
 * syllable before a pause lengthened, consonants shorter in clusters.
 */
export function timing(ph, voice = VOICE) {
  return ph.map((x, i) => {
    if (x.pause) return { ...x, ms: x.pause / voice.rate };
    const P = PHONES[x.p], md = (voice.profile & 2) && PROFILE.durations[x.p];
    let d = P.dur;
    if (md) d = (isVowel(x.p) ? (x.stress === 1 ? md.dur_stressed : x.stress === 0 ? md.dur_unstressed : md.dur) : md.dur) || md.dur || d;
    else if (isVowel(x.p)) d *= x.stress === 1 ? 1.25 : x.stress === 2 ? 1.0 : 0.72;
    // phrase-final lengthening: the last vowel before a pause, and what follows it
    const nextPause = ph.slice(i + 1).findIndex((y) => y.pause);
    const vowelsToPause = nextPause < 0 ? 99 : ph.slice(i + 1, i + 1 + nextPause).filter((y) => isVowel(y.p)).length;
    if (vowelsToPause === 0 && (nextPause >= 0)) d *= 1.35;
    // a vowel before a voiced consonant in its word is long, before a voiceless one short: the main
    // cue for a final consonant's voicing ("bent" / "bend")
    if (isVowel(x.p)) {
      const nx = ph[i + 1];
      if (voice.voicedLength && nx && !nx.pause && nx.word === x.word && !isVowel(nx.p)) d *= PHONES[nx.p].voiced || ['n', 'g'].includes(PHONES[nx.p].kind) ? 1.25 : 0.85;
    }
    // function words are said quickly
    if (voice.functionWords && FUNCTION.has(x.w)) d *= 0.72;
    // consonant clusters are quicker
    if (!isVowel(x.p) && ((ph[i - 1] && !ph[i - 1].pause && !isVowel(ph[i - 1].p)) || (ph[i + 1] && !ph[i + 1].pause && !isVowel(ph[i + 1].p)))) d *= 0.8;
    return { ...x, ms: d / voice.rate };
  });
}

// ---- tracks --------------------------------------------------------------------------
const FRAME = 5;                                   // ms
/**
 * Parameter tracks, one entry every 5 ms: F1..F3, B1..B3, AV (voicing), AH (aspiration),
 * AF (frication) and its shape, nasal (0/1), F0. Targets are laid out segment by segment,
 * then the formants are smoothed across segments (coarticulation) while amplitudes keep
 * their edges (a stop's burst must stay sharp).
 */
export function tracks(timed, voice = VOICE) {
  const T = [];
  let seg = 0;
  const push = (n, fn) => { for (let k = 0; k < n; k++) T.push({ seg, ...fn(k / Math.max(1, n - 1)) }); };
  const nextVowelF = (i) => { for (let j = i + 1; j < timed.length; j++) { if (timed[j].pause) break; if (isVowel(timed[j].p)) return phone(timed[j].p, voice).F; } return [500, 1500, 2500]; };
  const prevF = (i) => { for (let j = i - 1; j >= 0; j--) { if (timed[j].pause) break; const P = phone(timed[j].p, voice); if (P.F) return P.kind === 'd' ? P.F2 : P.F; } return null; };
  const quiet = { AV: 0, AH: 0, AF: 0, fr: null, bypass: 0, nasal: 0 };
  timed.forEach((x, i) => {
    seg = i;
    const n = Math.max(1, Math.round(x.ms / FRAME));
    if (x.pause) { const F = prevF(i) || [500, 1500, 2500]; push(n, () => ({ F, ...quiet, pause: true, mark: x.mark })); return; }
    const P = phone(x.p, voice);
    const stressAmp = x.stress === 1 ? 1 : x.stress === 2 ? 0.9 : x.stress === 0 ? 0.75 : 0.85;
    switch (P.kind) {
      case 'v': push(n, () => ({ F: P.F, B: P.B, AV: stressAmp, AH: 0, AF: 0, nasal: 0, stress: x.stress })); break;
      case 'd': push(n, (u) => ({ F: P.F.map((f, k) => f + (P.F2[k] - f) * smooth(u)), AV: stressAmp, AH: 0, AF: 0, nasal: 0, stress: x.stress })); break;
      case 'g': {
        // L before a vowel is light (a higher F2), after one dark (lower, and vowel-like)
        let F = P.F;
        if (x.p === 'L' && voice.lightDarkL) { const nx = timed[i + 1]; F = nx && !nx.pause && isVowel(nx.p) ? [340, 1300, 2800] : [450, 880, 2600]; }
        push(n, () => ({ F, B: P.B, AV: 0.75, AH: 0, AF: 0, nasal: 0 }));
        break;
      }
      case 'n': push(n, () => ({ F: P.F, B: [100, 250, 300], AV: 0.55, AH: 0, AF: 0, nasal: 1 })); break;
      case 'h': { const F = nextVowelF(i); push(n, () => ({ F, AV: 0, AH: 0.7, AF: 0, nasal: 0 })); break; }
      case 'f': push(n, () => ({ F: P.F, AV: P.voiced ? 0.45 : 0, AH: 0, AF: P.amp, fr: P.fr, bypass: P.bypass, nasal: 0 })); break;
      case 's': case 'a': {
        const next = timed[i + 1], toVowel = next && !next.pause && (isVowel(next.p) || PHONES[next.p].kind === 'g');
        const closure = Math.max(1, n - (P.kind === 'a' ? 0 : 2));
        // a velar is made where its vowel is: its locus and burst ride the next vowel's F2
        // (high and compact before [i], low before [u]), where a labial's and an alveolar's stay put
        let locus = P.F, burst = P.burst;
        if (x.p === 'K' || x.p === 'G') {
          const v = nextVowelF(i), f2 = Math.max(1350, Math.min(2500, v[1] * 1.08 + 150));
          locus = [250, f2, Math.max(f2 + 250, 2300)];
          burst = { ...P.burst, fr: [[f2 * 1.05, 600, P.burst.fr[0][2]], P.burst.fr[1]] };
        }
        // the closure: silence, or a voice bar under a voiced stop
        push(closure, () => ({ F: locus, B: [80, 200, 300], AV: P.voiced ? 0.12 : 0, AH: 0, AF: 0, nasal: 0, closure: true }));
        if (P.kind === 'a') {
          const Fr = phone(P.fric, voice);
          push(2, () => ({ F: Fr.F, AV: 0, AH: 0, AF: 1.0, fr: PHONES.T.burst.fr, bypass: 0.1, nasal: 0, burst: true }));
          push(Math.round((P.voiced ? 75 : 105) / FRAME / voice.rate), (u) => ({ F: Fr.F, AV: P.voiced ? 0.3 : 0, AH: 0, AF: (P.voiced ? 0.95 : 1.15) * (1 - 0.4 * u), fr: Fr.fr, bypass: Fr.bypass, nasal: 0 }));
        } else {
          // the burst: 10 ms of noise, shaped by the place
          push(2, () => ({ F: locus, AV: 0, AH: 0, AF: 1.0, fr: burst.fr, bypass: burst.bypass, nasal: 0, burst: true }));
          // aspiration: a voiceless stop into a vowel breathes while the formants move
          // (longer into a stressed vowel: English aspirates most at a stressed onset)
          const stressedNext = timed.slice(i + 1).find((y) => y.pause || isVowel(y.p))?.stress === 1;
          if (!P.voiced && toVowel && !(timed[i - 1] && timed[i - 1].p === 'S')) push(Math.round((voice.aspiration ? (stressedNext ? 60 : 40) : 45) / FRAME / voice.rate), () => ({ F: nextVowelF(i), AV: 0, AH: 0.55, AF: 0, nasal: 0 }));
        }
        break;
      }
    }
  });
  // glides move slowly: out of R, W and Y a vowel takes ~60 ms to reach its target (and into R
  // too: "four", "hard"). A quick transition is what makes an L an L; given one, R was heard as L.
  const span = {};
  T.forEach((t, k) => { (span[t.seg] = span[t.seg] || [k, k])[1] = k; });
  timed.forEach((x, i) => {
    if (x.pause || !['R', 'W', 'Y'].includes(x.p)) return;
    const G = phone(x.p, voice).F, K = Math.round(60 / FRAME / voice.rate);
    const nx = timed[i + 1], pv = timed[i - 1];
    if (nx && !nx.pause && isVowel(nx.p) && span[i + 1]) {
      const [a0, a1] = span[i + 1];
      for (let k = a0; k <= Math.min(a1, a0 + K); k++) { const u = smooth((k - a0) / K); T[k] = { ...T[k], F: T[k].F.map((f, j) => G[j] + (f - G[j]) * u) }; }
    }
    if (x.p === 'R' && pv && !pv.pause && isVowel(pv.p) && span[i - 1]) {
      const [a0, a1] = span[i - 1];
      for (let k = Math.max(a0, a1 - K); k <= a1; k++) { const u = smooth((a1 - k) / K); T[k] = { ...T[k], F: T[k].F.map((f, j) => G[j] + (f - G[j]) * u) }; }
    }
  });
  // coarticulation: formants and bandwidths move smoothly (a 40 ms triangle), amplitudes over 10 ms
  const N = T.length, sm = (get, half) => {
    const out = new Array(N);
    for (let i = 0; i < N; i++) { let s = 0, w = 0; for (let k = -half; k <= half; k++) { const j = Math.min(N - 1, Math.max(0, i + k)), wk = half + 1 - Math.abs(k); s += get(T[j]) * wk; w += wk; } out[i] = s / w; }
    return out;
  };
  const F = [0, 1, 2].map((k) => sm((t) => t.F[k] * voice.scale, 4));
  const Bw = [0, 1, 2].map((k) => sm((t) => (t.B || [60, 90, 150])[k], 3));
  const AV = sm((t) => t.AV, 1), AH = sm((t) => t.AH, 1), nasal = sm((t) => t.nasal, 2);
  // pitch: a declining line per phrase, a lift on each stressed vowel, a fall at a full stop,
  // a small rise before a comma (more to come)
  const f0 = new Array(N).fill(voice.f0);
  let start = 0;
  for (let i = 0; i <= N; i++) {
    if (i === N || T[i].pause) {
      const len = i - start;
      if (len > 0) {
        const mark = i < N ? T[i].mark || '.' : '.';
        for (let k = start; k < i; k++) {
          const u = (k - start) / Math.max(1, len - 1);
          let f = voice.f0 * (1.1 - 0.22 * u);
          if (mark === '.' || mark === '!') f *= 1 - 0.12 * smooth(Math.max(0, (u - 0.8) / 0.2));
          if (mark === ',') f *= 1 + 0.08 * smooth(Math.max(0, (u - 0.85) / 0.15));
          if (mark === '?') f *= 1 + 0.25 * smooth(Math.max(0, (u - 0.75) / 0.25));
          f0[k] = f;
        }
      }
      start = i + 1;
    }
  }
  for (let i = 0; i < N; i++) if (T[i].stress === 1) f0[i] *= 1 + voice.range * 0.5; else if (T[i].stress === 2) f0[i] *= 1 + voice.range * 0.2;
  const f0s = (() => { const o = new Array(N); for (let i = 0; i < N; i++) { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const j = Math.min(N - 1, Math.max(0, i + k)); s += f0[j]; w++; } o[i] = s / w; } return o; })();
  return T.map((t, i) => ({ F1: F[0][i], F2: F[1][i], F3: F[2][i], B1: Bw[0][i], B2: Bw[1][i], B3: Bw[2][i], AV: AV[i], AH: AH[i], AF: t.AF, fr: t.fr, bypass: t.bypass || 0, nasal: nasal[i], F0: f0s[i], seg: t.seg, burst: !!t.burst }));
}
const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
// ---- the synthesiser ---------------------------------------------------------------------
/** Klatt's two-pole resonator; with `anti`, the matching zero pair (an antiresonator). */
class Resonator {
  constructor(rate) { this.T = 1 / rate; this.y1 = 0; this.y2 = 0; this.a = 1; this.b = 0; this.c = 0; }
  set(f, bw) {
    const r = Math.exp(-Math.PI * bw * this.T);
    this.c = -r * r; this.b = 2 * r * Math.cos(2 * Math.PI * f * this.T); this.a = 1 - this.b - this.c;
  }
  step(x) { const y = this.a * x + this.b * this.y1 + this.c * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
class AntiResonator {
  constructor(rate) { this.T = 1 / rate; this.x1 = 0; this.x2 = 0; this.a = 1; this.b = 0; this.c = 0; }
  set(f, bw) {
    const r = Math.exp(-Math.PI * bw * this.T), c = -r * r, b = 2 * r * Math.cos(2 * Math.PI * f * this.T), a = 1 - b - c;
    this.a = 1 / a; this.b = -b / a; this.c = -c / a;
  }
  step(x) { const y = this.a * x + this.b * this.x1 + this.c * this.x2; this.x2 = this.x1; this.x1 = x; return y; }
}
/** RBJ band-pass (0 dB peak), for the frication branch. */
class Band {
  constructor(rate) { this.rate = rate; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(1000, 500); }
  set(f, bw) {
    const q = f / Math.max(1, bw), w = (2 * Math.PI * Math.min(f, this.rate * 0.45)) / this.rate, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
  }
  step(x) { const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

/** Render tracks to audio with the formant synthesiser. Returns a Float32Array at `rate`. */
export function renderFormant(tr, { rate = 16000, voice = VOICE } = {}) {
  const spf = (rate * FRAME) / 1000, N = Math.ceil(tr.length * spf);
  const out = new Float32Array(N);
  const R = [1, 2, 3, 4, 5].map(() => new Resonator(rate)), NP = new Resonator(rate), NZ = new AntiResonator(rate);
  R[3].set(3300 * voice.scale, 250); R[4].set(3750 * voice.scale, 200);
  const fb = [new Band(rate), new Band(rate)];
  let hp1 = 0, hpx = 0;          // a one-pole high-pass under the frication: fricatives live above ~1 kHz
  let lfsr = 0x7fff, phase = 0, flowPrev = 0;
  const noise = () => { const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); return (lfsr / 16384) - 1; };
  let lpNoise = 0;
  for (let i = 0; i < N; i++) {
    const fi = i / spf, k = Math.min(tr.length - 1, Math.floor(fi)), k2 = Math.min(tr.length - 1, k + 1), u = fi - k;
    const a = tr[k], b = tr[k2], L = (key) => a[key] + (b[key] - a[key]) * u;
    if (i % 16 === 0) {
      // while the glottis is open (aspiration, [h]) F1 is damped: the breath is carried by F2 and F3
      const open = Math.min(1, L('AH') * 1.6);
      R[0].set(L('F1'), L('B1') + 300 * open); R[1].set(L('F2'), L('B2')); R[2].set(L('F3'), L('B3'));
      const nas = L('nasal');
      NP.set(270, 100); NZ.set(270 + 180 * nas, 100);             // the nasal pair cancels unless nasal
      if (a.fr) { fb[0].set(a.fr[0][0], a.fr[0][1]); fb[1].set(a.fr[1][0], a.fr[1][1]); }
    }
    // voicing: KLGLOTT88's flow (t² − t³ in the open phase), differentiated
    const f0 = L('F0');
    phase += f0 / rate;
    if (phase >= 1) phase -= 1;
    const oq = voice.oq, t = phase / oq;
    const flow = phase < oq ? t * t - t * t * t : 0;
    const glottal = (flow - flowPrev) * 60; flowPrev = flow;
    const n = noise();
    lpNoise = lpNoise * 0.6 + n * 0.4;
    // aspiration is breath through the tract; a little of it rides every voiced sound, pulsing with the glottis
    const breath = lpNoise * (L('AH') + voice.breath * L('AV') * (phase < oq ? 1 : 0.3));
    // (noise through the resonators is far louder than the pulse: 0.13 puts an [h] ~12 dB under a vowel)
    let x = glottal * L('AV') + breath * 0.2;
    x = NZ.step(NP.step(x));
    for (let r = 0; r < 5; r++) x = R[r].step(x);
    // frication, in parallel (not smoothed: its edges are the consonant)
    let f = 0;
    const AF = a.AF + (b.AF - a.AF) * u;
    if (AF > 0.001) {
      const fr = a.fr || b.fr;
      if (fr) f = fb[0].step(n) * fr[0][2] + fb[1].step(n) * fr[1][2];
      f += n * (a.bypass || 0);
      f *= AF;
      // no rumble under a hiss: the tract in front of a constriction passes little below ~1 kHz
      const hp = 0.72 * (hp1 + f - hpx); hpx = f; hp1 = hp; f = hp;
    }
    out[i] = x * 0.5 + f * 0.9;
  }
  // level: to a peak of 0.9
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < N; i++) out[i] *= 0.9 / pk;
  return out;
}

/** Text to audio in one call. */
export function speak(text, lexicon, { rate = 16000, voice = VOICE, engine = 'formant' } = {}) {
  const ph = phonemize(text, lexicon), tm = timing(ph, voice), tr = tracks(tm, voice);
  const audio = renderFormant(tr, { rate, voice });
  return { audio, rate, phonemes: tm, tracks: tr };
}

/** A mono 16-bit WAV file's bytes. */
export function wav(audio, rate) {
  const buf = new ArrayBuffer(44 + audio.length * 2), v = new DataView(buf);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + audio.length * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, audio[i])) * 32767, true);
  return new Uint8Array(buf);
}
