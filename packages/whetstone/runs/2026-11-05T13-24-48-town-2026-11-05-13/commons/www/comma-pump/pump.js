// The comma pump, as numbers. No audio here: the page plays what this computes,
// and shelf/comma-pump-test.mjs checks it.
(function (root) {
  const cents = x => 1200 * Math.log2(x);
  const fold = c => { while (c >= 600) c -= 1200; while (c < -600) c += 1200; return c; };
  const wrap = d => { d = ((d % 1200) + 1200) % 1200; return d >= 600 ? d - 1200 : d; };
  // I  vi  ii  V  (I): each chord shares a note with the next
  const PROG = [
    { name: "C",  notes: ["C", "E", "G"] },
    { name: "Am", notes: ["A", "C", "E"] },
    { name: "Dm", notes: ["D", "F", "A"] },
    { name: "G",  notes: ["G", "B", "D"] },
  ];
  const JUST = { maj: [1, 5 / 4, 3 / 2], min: [1, 6 / 5, 3 / 2] };
  const EQ = { maj: [0, 400, 700], min: [0, 300, 700] };
  const quality = n => (n.endsWith("m") ? "min" : "maj");
  // root of each chord, in cents from the starting C, before folding
  // hold: each root found from the last one by a pure interval, so the shared note never moves
  const HOLD_STEP = [cents(5 / 6), cents(4 / 3), cents(4 / 3), cents(4 / 3)]; // C→Am, Am→Dm, Dm→G, G→C
  // fixed: one table of just roots, the same every lap
  const FIXED_ROOT = { C: 0, Am: cents(5 / 3), Dm: cents(10 / 9), G: cents(3 / 2) };
  const EQ_ROOT = { C: 0, Am: 900, Dm: 200, G: 700 };

  function chords(mode, laps) {
    const out = [];
    let r = 0;
    for (let lap = 0; lap < laps; lap++) {
      for (let i = 0; i < PROG.length; i++) {
        const ch = PROG[i], q = quality(ch.name);
        let root, iv;
        if (mode === "hold") { if (lap || i) r = fold(r + HOLD_STEP[(i + 3) % 4]); root = r; iv = JUST[q].map(cents); }
        else if (mode === "fixed") { root = FIXED_ROOT[ch.name]; iv = JUST[q].map(cents); }
        else { root = EQ_ROOT[ch.name]; iv = EQ[q]; }
        const pcs = iv.map(c => root + c);
        out.push({ lap, name: ch.name, notes: ch.notes, cents: pcs, root, bass: fold(root) - 1200 });
      }
    }
    // the closing tonic
    let root;
    if (mode === "hold") { r = fold(r + HOLD_STEP[3]); root = r; } else root = 0;
    const iv = mode === "equal" ? EQ.maj : JUST.maj.map(cents);
    out.push({ lap: laps, name: "C", notes: ["C", "E", "G"], cents: iv.map(c => root + c), root, bass: fold(root) - 1200 });
    // shared notes: how far did each one move between neighbours?
    for (let k = 1; k < out.length; k++) {
      const a = out[k - 1], b = out[k];
      b.moved = [];
      b.notes.forEach((n, j) => {
        const ia = a.notes.indexOf(n);
        if (ia >= 0) b.moved.push({ note: n, by: wrap(b.cents[j] - a.cents[ia]) });
      });
    }
    out[0].moved = [];
    return out;
  }
  const COMMA = cents(81 / 80);
  root.CommaPump = { chords, cents, fold, wrap, COMMA, PROG };
})(typeof window !== "undefined" ? window : globalThis);
