/* Story graph — Owain, neu Iarlles y Ffynnon mapped onto Vladimir Propp's
   "Morphology of the Folktale" (1928): the 31 narrative functions of the
   wonder-tale.

   SKELETON IN PROGRESS. The frame and the opening functions are seeded so
   the spine, the cards, and the mythograph render from Movement I; the full
   morphology — Owain's departure, the donor sequence at the fountain, the
   two struggles (Black Knight; later the unwitting duel with Gwalchmei), the
   broken interdiction and the descent into madness, the lion-helper, and the
   chain of liquidations that close the tale — is laid in as the translation
   reaches each movement. The `absent` section below is provisional and will
   be finalised once the whole text is rendered. Loaded after tale.js;
   attaches to window.OWAIN. */
window.OWAIN = window.OWAIN || {};
window.OWAIN.propp = {
  intro: "Propp argued that wonder-tales, however different on the surface, drew their events from a single fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Violation, the Donor, Struggle, Victory, Liquidation, Return, Recognition. <em>Owain</em> is the most romance-shaped tale in our corpus, and it traverses the spine twice: an <strong>ascending arc</strong> (the quest to the fountain, the won bride, the held office) and, after the hero breaks faith, a <strong>fall-and-redemption arc</strong> (madness, the healing donor, the lion-helper, a chain of rescues, reconciliation). The hinge between them is a violated interdiction — the term his wife sets and Owain overstays — which makes <em>Owain</em> the clearest case in the corpus of Propp's β/γ/δ (Interdiction → Violation → first Villainy) driving the whole back half of a tale. Below, the movements are laid against the spine as they are translated; the comparative payoff (which functions Welsh romance keeps, doubles, or refuses) is read against Pwyll, Culhwch, Gawain, and Orfeo in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "frame",    label: "The court frame; Cynon's tale",        color: "#c9a24a" },
    { id: "quest",    label: "Owain's quest to the fountain",        color: "#6f9ac9" },
    { id: "bride",    label: "The won bride; the held fountain",     color: "#c97f9a" },
    { id: "fall",     label: "The broken term; madness",            color: "#9a6f9a" },
    { id: "lion",     label: "The lion; the chain of rescues",      color: "#7fb37f" },
  ],
  moves: [
    // ── Act 1: frame ─────────────────────────────────────────────
    { act: "frame", sym: "α", node: "Setting", name: "Initial situation", gloss: "The court and the heroes are introduced.",
      realized: "Arthur's court at Caer Llion ar Wysc: the emperor dozing on his dais of rushes, Owain, Cynon and Cei together, Gwenhwyfar's maids at the window, Glewlwyd keeping a gate that needs no keeping. The marvels will be reported before they are lived — the Welsh romance frames its adventure as a tale told at the hearth.", passage: 1 },
    { act: "frame", sym: "a", node: "The reported lack", name: "Lack (deferred)", gloss: "A want or wrong is named, here at one remove.",
      realized: "The hand-off from Owain to Cynon sets up the romance's engine: Cynon will tell of a defeat at the magic fountain (Movement II), and that reported humiliation becomes the lack Owain rides out to repair. The tale's deep structure is a relay — one knight's shame is the next knight's quest.", passage: 1 },
    // Further functions (Owain's Departure, the Donor at the fountain, the
    // Struggle with the Black Knight, the won bride, the violated term, the
    // descent into madness, the lion-helper, the liquidations) are seeded as
    // the translation reaches each movement.
  ],
  absent: {
    note: "<em>Provisional — to be finalised once the full text is rendered.</em> On the evidence of the frame and the known shape of the romance, Owain's distinctive Propp profile (relative to the Welsh sister-tales) is shaping up around three features:",
    groups: [
      { label: "Interdiction & Violation drive the tale", syms: "γ δ", text: "Unlike Pwyll, Culhwch, or Orfeo — where no interdiction governs the plot — <em>Owain</em> turns on one: the term the Countess sets for her husband's absence, which Owain overstays. The violated interdiction (γ→δ) is the hinge that topples the whole back half of the tale into the fall-and-redemption arc. The most Continental-romance feature in the corpus." },
      { label: "The spine traversed twice", syms: "A…W ×2", text: "An ascending arc (quest → won bride → held office) and a descending-then-redemptive arc (madness → donor → helper → rescues → reconciliation). Pwyll braids three arcs across two heroes; Owain runs two arcs through one hero, joined at a moral fault-line rather than a generational one." },
      { label: "The grateful-helper animal", syms: "the lion (helper)", text: "Propp's helper-slot is filled by a beast bound to the hero by gratitude rather than magic or kinship — a feature absent from the Welsh sister-tales (whose helpers are the Oldest Animals of Culhwch, the donor-heroine of Pwyll) and shared instead with the international grateful-animal tradition (ATU 156 / B301)." },
    ],
    verdict: "<em>Verdict pending the full translation.</em> The working thesis: where the native Welsh tales (Pwyll, Culhwch) refuse the indelible mark and the governing interdiction, <em>Owain</em> — the tale with a French twin — accepts both, and builds its second half on a broken promise and a beast's kept faith. That contrast is exactly the Welsh↔Continental seam the Pendragon evolutionary tree exists to trace.",
  },
};
