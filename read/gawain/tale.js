/* Sir Gawain and the Green Knight.
   This file holds the work plan around the canonical source. The actual
   Middle English text lives at source/sggk-morris-1864.txt (Richard Morris's
   1864 PD edition of the unique surviving manuscript, Cotton Nero A.x —
   sourced from Project Gutenberg #14568, license-preserved).

   The original translation will be added stanza-by-stanza in subsequent
   passes; we deliberately have not pre-written translations from memory.
   Attaches to window.GAWAIN. */
window.GAWAIN = window.GAWAIN || {};
window.GAWAIN.tale = {
  meta: {
    blurb: "<strong>Sir Gawain and the Green Knight</strong> — the masterpiece of late-14th-century Middle English alliterative verse, anonymous (the <em>Pearl Poet</em>), surviving in one manuscript (BL Cotton Nero A.x). The canonical source text is in place: Richard Morris's 1864 edition of the manuscript (Project Gutenberg #14568, public domain), 2,530 lines in four <em>fitts</em>. The English translation has <strong>not</strong> been written yet — that's the next pass, original work done stanza-by-stanza alongside the source rather than reconstructed from memory.",
    sourceFile: "source/sggk-morris-1864.txt",
    sources: [
      { label: "Sir Gawayne and the Green Knight — Richard Morris (1864), Project Gutenberg #14568", url: "https://www.gutenberg.org/ebooks/14568", host: "Project Gutenberg" },
      { label: "Cotton Nero A.x — BL digitised manuscript", url: "https://www.bl.uk/manuscripts/Viewer.aspx?ref=cotton_ms_nero_a_x", host: "British Library" },
      { label: "Sir Gawain and the Green Knight — background", url: "https://en.wikipedia.org/wiki/Sir_Gawain_and_the_Green_Knight", host: "Wikipedia" },
    ],
  },
  roadmap: [
    { t: "Source text in hand", done: true },
    { t: "Fitt I · The beheading at Camelot — translation", done: false },
    { t: "Fitt II · Gawain rides out, Bertilak's castle — translation", done: false },
    { t: "Fitt III · Three hunts, three temptations, the green girdle — translation", done: false },
    { t: "Fitt IV · The Green Chapel and what was revealed — translation", done: false },
  ],
};
