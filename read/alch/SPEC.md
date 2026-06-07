# The Alchemist's Garden — `read.mino.mobi/alch`

A hub of **rescued antique source-texts of the cultivated garden** — the
medicinal, botanical, and (where the tradition reaches) alchemical literature of
herbs and growing things. Each source is given an *original, openly-licensed
English translation set beside its original language*, structured as reusable
data, so a downstream consumer at `g.mino.mobi` can grow a living thing on top of
it.

This is the same mold as `read/iching/` (the Zhouyi → the oracle at
`g.mino.mobi/yijing/`) and `read/geomancy/` (Fludd → `g.mino.mobi/geocast/`):
**scholarly rescue → reusable `data.js` → downstream living app.** The garden is
the hub; each rescued text is a *bed* in it.

## The mold (non-negotiables, inherited from iching/geomancy)

1. **One named source of truth per bed**, cited to edition + pages + scan ID.
2. **An *original* CC BY-SA 4.0 English translation**, made from the text itself
   (not lifted from an existing translation), set **beside the original language**.
3. **A visible philological apparatus**: notes on the words and the realia, and
   **cruxes flagged rather than silently resolved** (cf. geomancy's Puer/Puella
   transposition; the Zhouyi's Mawangdui variants).
4. **A named "deeper spine to converge on"** — the better text the working
   edition aims at over time.
5. **Structured by the source's own enumeration** into one `data.js` ES module +
   one self-contained `index.html` viewer in the shared read/ visual language.
6. **Built in tranches**, with a roadmap. Ship the threshold, then grow.

## This is a ≥2-source effort

The Hortulus is bed #1, the starter. The hub is designed to hold more beds; a
second source follows. Adding a bed = a new `read/alch/<slug>/` directory
(`index.html` + `data.js`) and a new entry in the hub's bed list. Nothing else
changes.

---

## Bed #1 — Walahfrid Strabo, *Hortulus* (`read/alch/hortulus/`)

**The work.** *Liber de cultura hortorum* ("On the cultivation of gardens"),
known as the *Hortulus* ("the little garden"). A Carolingian didactic poem in
**444 dactylic hexameters**, composed c. 840s by **Walahfrid Strabo**, monk and
later abbot of Reichenau, and dedicated to **Grimald, abbot of St Gall**. It
describes the poet's own small plot — its labour, then 23 plants bed by bed — and
is the first garden poem of the Latin Middle Ages.

**Why it leads the hub.** It is small enough to *finish completely* (a virtue no
larger herbal had), it is in Latin (so the bilingual parallel that *is* this
hub's signature has real translation work to do), it enumerates cleanly, and it
literally *is* "the little garden." Its alchemical character is not in Walahfrid
— it is a monastic medicinal-poetic garden — but enters as an optional
correspondence overlay (see Tranche 2).

### Structure (the data spine)

A framed sequence of 24 numbered sections plus a dedication:

| seq | roman | kind | Latin | English |
|----:|:-----:|------|-------|---------|
| 0 | — | preface | Praefatio auctoris | The author's preface |
| 1 | I | proem | Culturae initium | The beginning of cultivation (the labour; the nettles) |
| 2 | II | plant | Salvia | Sage — *Salvia officinalis* |
| 3 | III | plant | Ruta | Rue — *Ruta graveolens* |
| 4 | IV | plant | Abrotonum | Southernwood — *Artemisia abrotanum* |
| 5 | V | plant | Cucurbita | Bottle gourd — *Lagenaria siceraria* |
| 6 | VI | plant | Pepones | Melon — *Cucumis melo* |
| 7 | VII | plant | Absynthium | Wormwood — *Artemisia absinthium* |
| 8 | VIII | plant | Marrubium | White horehound — *Marrubium vulgare* |
| 9 | IX | plant | Feniculum | Fennel — *Foeniculum vulgare* |
| 10 | X | plant | Gladiola | Iris / gladdon — *Iris* sp. **(ID crux)** |
| 11 | XI | plant | Libisticum | Lovage — *Levisticum officinale* |
| 12 | XII | plant | Caerefolium | Chervil — *Anthriscus cerefolium* |
| 13 | XIII | plant | Lilium | Madonna lily — *Lilium candidum* |
| 14 | XIV | plant | Papaver | Opium poppy — *Papaver somniferum* |
| 15 | XV | plant | Sclarea | Clary sage — *Salvia sclarea* |
| 16 | XVI | plant | Mentha | Mint — *Mentha* sp. |
| 17 | XVII | plant | Puleium | Pennyroyal — *Mentha pulegium* |
| 18 | XVIII | plant | Apium | Wild celery — *Apium graveolens* |
| 19 | XIX | plant | Bettonica | Betony — *Betonica officinalis* |
| 20 | XX | plant | Agrimonia | Agrimony — *Agrimonia eupatoria* |
| 21 | XXI | plant | Ambrosia | *(disputed — oak-of-Jerusalem / wood-sage?)* **(ID crux)** |
| 22 | XXII | plant | Nepeta | Catmint — *Nepeta cataria* |
| 23 | XXIII | plant | Raphanus | Radish — *Raphanus sativus* |
| 24 | XXIV | plant | Rosa | The rose — *Rosa* (gallica / ×alba) |
| 25 | — | dedication | Dicatio opusculi | The dedication, to Grimald |

The poem deliberately closes on the **lily and the rose** — Mary's flowers — so
the medicinal plot resolves into a Christian-symbolic climax. Keep that ordering.

### Source of truth & provenance

- **Latin transcribed (Tranche 1)** from the received printed text (Canisius →
  Migne **PL 114**), via the public full text on Latin Wikisource. Normalised:
  `j → i`; the stray Migne column marker (`114.1123A`) stripped; one dittographic
  line in the proem (a repeated `Tenuia porrigerent…`) dropped. These are noted,
  not hidden.
- **Deeper spine to converge on:** the critical edition — **MGH, *Poetae Latini
  aevi Carolini* II, ed. E. Dümmler (Berlin 1884)** — and behind it the **St Gall
  / Reichenau manuscript** tradition (the mss reproduced in the Payne–Blunt Hunt
  Botanical edition, 1966). Tranche 3 collates the working text against these.

### `data.js` shape

```js
export const HORTULUS = {
  meta: { title, work, author, date, dedicatee, license, method,
          latinSource, convergeOn, sources: [{label, host, url}] },
  // every section in poem order; a section is "planted" iff it has `lines`.
  sections: [
    { seq, roman, kind:'preface'|'proem'|'plant'|'dedication',
      la,                 // Latin section name
      en,                 // English section title
      bot?,               // botanical ID (plants)
      lines?: [ { la, en, n? } ],   // parallel verse, line by line; n = note
      note?,              // a closing prose note for the bed
      correspondence?: {  // TRANCHE 2 overlay — NOT Walahfrid; cited separately
        planet, element, qualities, signature, source } }
  ]
};
```

The viewer renders the bed-map from all sections (planted = live, fallow = dim),
shows parallel Latin/English per planted bed, and reports "N of 23 beds planted —
and growing."

### Tranches

1. **Threshold (this one).** Hub + viewer + schema; preface, proem, **Sage**,
   **Rue** translated. The pattern, proven and live.
2. **Plant the beds.** Translate the remaining 21 plants, bed by bed (one or a
   few per commit — each push deploys and gives a live URL to proof against, per
   read/'s "movement by movement" rule). Then layer the **correspondence overlay**
   (planet · element · humoral qualities · signature) from a *named* donor source
   — Culpeper's *Complete Herbal* (1653) for planetary rulerships; the
   Salernitan/Dioscoridean "degrees" for humoral qualities — kept visibly
   separate from Walahfrid.
3. **Converge.** Collate the Latin against MGH/the St Gall manuscript; record
   variants in the notes.

### Downstream (`g.mino.mobi`) — deferred

The structured `HORTULUS` (especially once the correspondence overlay lands) is
the raw material for a living garden app — a sortilege over the beds, a sow-by-
the-planets almanac, or a cultivated visual plot. Chosen once the source exists;
intentionally not decided here.

---

## Hub conventions

- `read/alch/index.html` — the garden (landing): charter, the list of beds,
  the method note. Self-contained but shares `garden.css`.
- `read/alch/garden.css` — the shared visual language for the `/alch` family
  (the read gold/ink/jade palette + masthead/method/footer/parallel-verse
  components). New beds link it.
- Each bed: `read/alch/<slug>/{index.html, data.js}`.

## Deploy

`read` is a Cloudflare Worker (plain assets passthrough) at `read.mino.mobi`;
`/alch/` and `/alch/<slug>/` serve automatically. Owning branch:
`claude/alchemist-garden-sources-9JYpE` (this branch took the read surface in
`deploy-registry.json`; `deploy-read.yml` triggers on it). A push touching
`read/**` deploys the whole surface.
