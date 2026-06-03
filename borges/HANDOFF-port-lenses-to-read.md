# Handoff: port the Desire (Greimas) and Theme (Parry–Lord) lenses into read/pendragon

**For:** the Claude working on `read/` and `read/pendragon/`.
**Reference implementation:** lives on branch `claude/pendragon-endless-book-B5KwG` under `borges/` — read `borges/js/render.js` (`renderDesire`), `borges/js/generate.js` (the `actant` shape + `DESIRE` map), `borges/js/lexicon.js` (`THEMES`).

borges built both lenses **forward** (procedurally, for generated tales). read/ should add them **backward** (as hand-authored scholarship for the real tales). The renderer and the data *shapes* port directly; only the data *source* differs (a scholar identifies them in the real text instead of an engine deriving them).

---

## Why these two, and why they fit the real corpus

The seven-layer apparatus is strong on *syntax* (Propp) and *lexicon* (Thompson motifs) but models neither **desire** (what is wanted, what opposes it) nor the **oral set-piece** (the actual compositional unit of oral narrative). Both genuinely illuminate the existing tales:

- **Culhwch** literally has the **extraordinary-companions** type-scene (Arthur's men, each with one impossible skill) and the great invocation-catalogue — these *are* oral themes.
- **Gawain** contains one of the most celebrated type-scenes in Middle English, **the arming of Gawain** (ll. 566–669, the gear taken up in order), plus the three hunts and feasts.
- **Orfeo** has the descent / threshold-crossing and the recognition-feast; **Pwyll** has the wedding-feast at Hyfaidd's court — and an *actantial event* unique in the corpus: the Subject transfers mid-tale (Pwyll → Teirnon).

---

## 1) Desire — a new per-tale layer + tab

Add to each tale's `analysis.js` (it already holds the Propp layer). **Mirror borges' `actant` field names exactly** so `renderDesire` ports unchanged.

```js
window.<TALE>.desire = {
  intro: "Beneath the morphology runs the engine the morphology brackets out: desire. …",
  subject: "…", object: "…",
  value: "…",                 // the abstraction beneath the plot — the real stake
  sender: "…",                // who sets the wanting in motion
  receiver: "…",              // who gains if it succeeds
  helpers: [{ name: "…", note: "…" }],
  opponent: "…",
  unreachable: false,         // true → the desire-arrow is drawn DASHED (the Object is structurally unattainable)
  note: "…"
};
```

- Add a **Desire** tab to every tale's `index.html` (between Story-graph and Mythograph), a `#view-desire` section, and the renderer call.
- Port `renderDesire()` from `borges/js/render.js`. It draws the iconic six-box / three-axis diagram: Sender→Object→Receiver (transmission) across the top, Helper→Subject←Opponent (power) across the bottom, and the Subject→Object **desire** arrow up the middle, dashed when `unreachable`.
- **Distinguish it from the existing Character web** in the intro: the web is *social relationships*; this is the *functional desire-structure* — a different graph making a different claim.

### Worked example — Gawain (pattern to copy)

```js
window.GAWAIN.desire = {
  intro: "Sir Gawain laid against Greimas's actantial model: a Subject who wants an Object, a Sender who dispatches it toward a Receiver, and the Helper and Opponent who aid and block the wanting.",
  subject: "Gawain",
  object: "his honour kept whole — and, beneath it, his life",
  value: "the chivalric self, proven flawless against fear",
  sender: "Arthur's court, and the beheading-game the Green Knight brings into it",
  receiver: "Gawain, and the Round Table's name for trawþe",
  helpers: [
    { name: "the green girdle", note: "a FALSE helper — the aid that becomes the very flaw; structurally a Helper, morally an Opponent" },
    { name: "Bertilak's lady", note: "ambiguous: tester and tempter, helper to the game and opponent to the vow" }
  ],
  opponent: "the Green Knight, and Gawain's own instinct to live",
  unreachable: false,
  note: "Gawain half-fails, and the actants show why: the Object is PERFECT honour, and the nick at the neck is the exact gap between the desire and its object. The girdle in the Helper slot is the tell — the only aid in the corpus that is also the wound. Compare propp.absent: where the other three reach the Object cleanly, Gawain's is the one desire that falls short."
};
```

---

## 2) Theme — annotate the real type-scenes

Add to `analysis.js` (or a small `themes.js`). These point at *real text*, so include the line/passage reference.

```js
window.<TALE>.themes = [
  { id: "arming", label: "the arming of Gawain", passage: 2,
    note: "SGGK ll. 566–669; the war-gear taken up in fixed order — the corpus's purest oral type-scene.",
    lines: "the helm, the byrnie, the pentangle shield…" }
];
```

- `passage` links into the **Read** view.
- Surface them two ways: a small marker in the Read passages (e.g. `⟜ type-scene: the arming`) and a short list at the head of the Story-graph.
- borges' `THEMES` catalog (arming, feast, boast/flyting, lament, council, sea-road, crossing, mound, supplication) is the vocabulary — use the same `id`s so the cross-tale table lines up.

### Worked example — themes present in the corpus
- **Gawain:** `arming` (ll. 566–669), `feast` (the Christmas court; Bertilak's hall), `boast` (the exchange-of-winnings is a flyting-adjacent pact).
- **Culhwch:** `boast`/catalogue (the invocation of Arthur's men), `feast` (Ysbaddaden's hall), and the **extraordinary-companions** (the men with impossible skills — note this is *also* Thompson F601, so cross-link it in `motifs.js`).
- **Orfeo:** `threshold` (the rock-cleft into Faerie), `feast` (the Fairy King's hall; the recognition-feast at Winchester).
- **Pwyll:** `feast` (the wedding at Hyfaidd's court), `council` (the assembly over Rhiannon's penance).

---

## 3) The Pendragon comparative payoff (the real reason to do it)

Extend `read/pendragon/crosswalk.js` with two new comparison blocks across all four tales:

- **The axis of desire across the corpus** — one row per tale: Subject / Object / Opponent / *does the desire reach its object?* The finding writes itself: Culhwch, Pwyll, and Orfeo **reach** the Object (marriage, the recovered heir, Heurodis recovered); **Gawain alone half-fails** — the one Object not fully attained. A genuine cross-tale observation the apparatus surfaces.
- **The shared type-scenes** — which oral themes each tale deploys (the *feast* in all four; the *arming* in Gawain and Culhwch; the *threshold* in Orfeo; the *extraordinary companions* in Culhwch). This is the Parry–Lord comparative table, exactly what `crosswalk.js` is built for.

---

## 4) Conventions to respect (from `read/CLAUDE.md` + the Method page)

- **Do all four tales** (gawain, culhwch, orfeo, pwyll). The skeleton is intentionally rigid so the cross-tale layer can read across them; don't add a tab to one tale only.
- **Update the Method page** (`read/pendragon/`, `#method`) — it documents the apparatus, so adding two layers means documenting them, including the new `desire` / `themes` data shapes. (CLAUDE.md: "If you change the per-tale apparatus shape, update the Method page to match.")
- **Add the tab to every `index.html`** consistently; reuse `renderDesire`.
- **Branch + deploy:** read work ships from `claude/arthurian-legend-history-*` (wired into `deploy-read.yml`). Make sure the branch matches a trigger glob or it won't deploy.

## 5) Two cautions

- borges' `renderDesire` uses borges' CSS variables (`--teller`, `--teller-soft`) and its `svgEl`/`txt` helpers. Map the colours to read's palette (`--gold`, `--gold-soft`, `--accent`) and confirm read/ has equivalent SVG helpers (it does, in each tale's `app.js`).
- Keep `desire` / `themes` as **hand-authored scholarship** per tale. Do **not** import borges' procedural generator into read/ — only the *shapes* and the *renderer* port.

## 6) One resonance worth a line in the Method page

read/ and borges are now mirror images of the same actantial model. In the *real* tales the desire-arrow **reaches** its Object (the arc completes — wedding, recovery, recognition). borges' immortalist frame is the same arrow drawn **dashed** (the wheel; the want with no liquidation). The Pendragon hub already cross-links to borges; this gives the two sites a shared analytical vocabulary, run backward (read) and forward (borges).
