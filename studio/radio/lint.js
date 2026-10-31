// lint.js — a critic for the radio's notes, for a composer that cannot hear. It reads what the
// composer wrote (each note's role, tick and pitch; each bar's chord, scale and place) and counts the
// things a musician would wince at. Nothing here is taste: each is a rule a harmony teacher would mark.
//
//   lint(bars) → { … rates … }, bars = [{ info, notes }] as Radio.next() returns them (notes carry
//   `role` 'mel' | 'comp' | 'bass' | 'echo' | 'orn', `tick` and `bar`).
//
//   clash      melody notes on a strong beat (ticks 0 3 6 9) that are not in the chord sounding
//   seconds    melody notes on a beat against an accompaniment note a minor second / major seventh away
//   crowd      melody notes on a beat with an accompaniment note within a whole tone (the hands in each other's way)
//   parallels  consecutive fifths or octaves between the melody and the bass, per change of chord
//   leaps      melodic intervals over a fifth; `unrecovered`: a leap of more than a third followed by
//              another step the same way instead of a step back
//   repeats    melodic intervals that are a repeated note
//   peaks      eight-bar periods whose highest note falls in bars 5–7 (where a climax belongs)
//   cadence    answering phrases whose last melody note is the key's tonic or third
//   hand       how far the guitar's hand moves between bars (mean change of mean fret)
//   variety    distinct three-interval figures per figure (1 = never repeats; motifs want ~0.3–0.6)
const OPEN = [64, 59, 55, 50, 45, 40];
const pc = (m) => ((m % 12) + 12) % 12;

export function lint(bars) {
  const mel = [], comp = [], c = { clash: 0, strong: 0, seconds: 0, crowd: 0, onsets: 0, par: 0, changes: 0, leaps: 0, unrec: 0, rep: 0, ints: 0, absInt: 0 };
  for (const b of bars) for (const n of b.notes) (n.role === 'mel' ? mel : n.role === 'orn' ? null : comp)?.push({ ...n, info: b.info });
  mel.sort((a, b) => a.at - b.at); comp.sort((a, b) => a.at - b.at);
  const chordAt = (n) => { const p = n.info.pcs; return n.tick >= 6 && p.length > 1 ? p[1] : p[0]; };
  // the chord and the beat
  for (const n of mel) {
    if (Math.abs(n.tick - Math.round(n.tick)) < 1e-6 && Math.round(n.tick) % 3 === 0) { c.strong++; if (!chordAt(n).includes(pc(n.midi))) c.clash++; }
  }
  // against the accompaniment, at each melody onset
  let j0 = 0;
  for (const n of mel) {
    while (j0 < comp.length && comp[j0].at + comp[j0].dur + 4 < n.at) j0++;
    if (!(Math.abs(n.tick - Math.round(n.tick)) < 1e-6 && Math.round(n.tick) % 3 === 0)) continue;   // passing notes may rub; beats may not
    c.onsets++;
    let sec = false, crowd = false;
    for (let j = j0; j < comp.length && comp[j].at <= n.at + 0.005; j++) {
      const m = comp[j]; if (m.at + m.dur < n.at) continue;
      const d = Math.abs(m.midi - n.midi);
      if (d % 12 === 1 || d % 12 === 11) { if (d < 24) sec = true; }
      if (d <= 2) crowd = true;
    }
    if (sec) c.seconds++; if (crowd) c.crowd++;
  }
  // the melody's line: each instrument's own (a hand-off between them is not a leap)
  for (const inst of [0, 1]) {
    const L = mel.filter((n) => n.inst === inst);
    for (let i = 1; i < L.length; i++) {
      const d = L[i].midi - L[i - 1].midi; c.ints++; c.absInt += Math.abs(d);
      if (d === 0) c.rep++;
      if (Math.abs(d) > 7) c.leaps++;
      if (Math.abs(d) > 4 && i + 1 < L.length) { const e = L[i + 1].midi - L[i].midi; if (e !== 0 && (Math.sign(e) === Math.sign(d) || Math.abs(e) > 4)) c.unrec++; }
    }
  }
  // outer voices at each downbeat (and half-bar change): the lowest sounding note and the melody
  const outer = [];
  for (const b of bars) for (const tick of b.info.split ? [0, 6] : [0]) {
    const t = b.notes.length ? Math.min(...b.notes.map((n) => n.at)) : 0;
    const at = b.t ?? t, tt = at + (tick / 12) * (b.sec ?? 2.5);
    const low = [...comp, ...mel].filter((n) => n.at <= tt + 0.03 && n.at + n.dur > tt + 0.03);
    const m = mel.filter((n) => n.at <= tt + 0.03 && n.at + n.dur > tt + 0.03).pop();
    if (!low.length || !m) { outer.push(null); continue; }
    outer.push({ bass: Math.min(...low.map((n) => n.midi)), mel: m.midi });
  }
  for (let i = 1; i < outer.length; i++) {
    const a = outer[i - 1], b = outer[i]; if (!a || !b) continue;
    c.changes++;
    const ia = pc(a.mel - a.bass), ib = pc(b.mel - b.bass), dm = b.mel - a.mel, db = b.bass - a.bass;
    if (ia === ib && (ia === 0 || ia === 7) && dm && db && Math.sign(dm) === Math.sign(db)) c.par++;
  }
  // periods: eight bars from each even phrase of a section
  let periods = 0, peaks = 0, ans = 0, stable = 0;
  const bySec = new Map();
  for (const b of bars) { const k = b.info.section; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(b); }
  for (const list of bySec.values()) {
    const groups = new Map();
    for (const b of list) { const g = Math.floor((b.info.i ?? 0) / 8); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
    for (const g of groups.values()) {
      if (g.length < 8) continue;
      let best = -1, bi = -1;
      g.forEach((b, k) => { for (const n of b.notes) if (n.role === 'mel' && n.midi > best) { best = n.midi; bi = k; } });
      if (bi < 0) continue;
      periods++; if (bi >= 4 && bi <= 6) peaks++;
      const end = g[7].notes.filter((n) => n.role === 'mel').pop();
      if (end) { ans++; const r = g[7].info.root; if (r !== undefined && [0, 3, 4].includes(pc(end.midi - r))) stable++; }
    }
  }
  // the guitar's hand
  let hand = 0, hn = 0, prev = null;
  for (const b of bars) {
    const fr = b.notes.filter((n) => n.inst === 1 && n.role === 'comp' && !n.art && n.midi >= 52).map((n) => n.midi - OPEN[n.string - 1]).filter((f) => f > 0);
    if (!fr.length) { continue; }
    const m = fr.reduce((s, x) => s + x, 0) / fr.length;
    if (prev !== null) { hand += Math.abs(m - prev); hn++; }
    prev = m;
  }
  // figures
  const figs = new Map();
  for (let i = 3; i < mel.length; i++) { const k = `${mel[i - 2].midi - mel[i - 3].midi},${mel[i - 1].midi - mel[i - 2].midi},${mel[i].midi - mel[i - 1].midi}`; figs.set(k, (figs.get(k) || 0) + 1); }
  const nf = Math.max(1, mel.length - 3);
  const r = (a, b) => (b ? +(a / b).toFixed(3) : 0);
  return {
    clash: r(c.clash, c.strong), seconds: r(c.seconds, c.onsets), crowd: r(c.crowd, c.onsets), parallels: r(c.par, c.changes),
    leaps: r(c.leaps, c.ints), unrecovered: r(c.unrec, c.ints), repeats: r(c.rep, c.ints), meanInterval: r(c.absInt, c.ints),
    peaks: r(peaks, periods), cadence: r(stable, ans), hand: r(hand, hn), variety: r(figs.size, nf), melodyNotes: mel.length,
  };
}
