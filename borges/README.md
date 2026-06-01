# borges — The Book of Sand (`borges.mino.mobi`)

An **endless book**. Seven maintenance robots aboard the slow barque *Tabard*,
each named for one of the seven wandering stars and bearing its medieval
planetary temperament, pass the endless night between galaxies by telling each
other tales — in the voice of a medieval English teller in a hall at night,
remixing the old motifs and Propp structures for laughs, because they already
have every story cold in their training. Being structured machines, each one
**publishes a full mythograph to the ship's intranet (the Tabard) before it
speaks** — the blueprint before the telling.

After Jorge Luis Borges, *El libro de arena*: a book with no first page and no
last.

## How it works

The book is **generated, not authored** — a seeded, combinatorial engine, so
every page number `n` yields exactly the same tale on any machine, for ever.
That determinism is what lets a teller post its mythograph at a stable permalink
*before* the telling and have the permalink mean something. The page-number
space is unbounded, so the book is endless; `Next` / `Prev` / `A tale at
random` / `turn to №` walk it.

The apparatus — Propp story-graph, Thompson motif index, character web, and the
force-directed **mythograph** — is the same one built for the annotated medieval
tales at [`read.mino.mobi/pendragon`](https://read.mino.mobi/pendragon/), run
**forward here as a generator** instead of backward as analysis.

### The seven tellers

| Star | Glyph | Metal | Office aboard | Voice |
|------|-------|-------|---------------|-------|
| Luna | ☽ | silver | Navigator & keeper of the dream-logs | lulling, mutable, contradicts herself |
| Mercury | ☿ | quicksilver | Signals officer, translator, runner | fast, punning, breaks frame — the great remixer |
| Venus | ♀ | copper | Warden of the green deck & gardens | lush, tender, ends on a planting |
| Sol | ☉ | gold | Keeper of the fusion-heart | stately, kingly, gives a great gift |
| Mars | ♂ | iron | Forge-master, hull-welder, damage control | clipped hammer-strokes, blades |
| Jupiter | ♃ | tin | Ship's governor & justice of the long table | orotund, proverb-laying, oath-bound |
| Saturn | ♄ | lead | Chronometer, structural warden, cold-hull keeper | slow, grave, bends to time and the ending |

## Files

| File | Role |
|------|------|
| `index.html` | The General Prologue: the voyage, the seven-teller gallery, the Tabard board (entry to the book) |
| `tale.html` | The per-tale reader — seven tabs (Telling, the Tabard spec, Cast, Character web, Story graph, Motifs, Mythograph) |
| `js/prng.js` | Seeded PRNG (mulberry32 + xmur3 hash) — the deterministic core |
| `js/tellers.js` | The seven tellers: planet, metal, office, temperament, voice banks, affinities |
| `js/lexicon.js` | Culture packs, Propp function library, tale-type frames, Thompson motif atoms, archetype roles |
| `js/generate.js` | The engine: page number → a whole tale, shaped to match the read/ apparatus |
| `js/render.js` | The reader: ports the read/ graph renderers + the prose telling, Tabard spec, teller theming, endless nav |
| `css/borges.css` | Cosmic recolour of the read/ visual language, with per-teller accents |
| `worker.js` | Pretty `/t/<n>` permalink routing → `tale.html`; else static assets |
| `wrangler.jsonc` | Worker + assets + `borges.mino.mobi` custom domain |

## Deploy

`.github/workflows/deploy-borges.yml` — `npx wrangler deploy` on push to `main`
or a `claude/pendragon-*` branch touching `borges/**`, provisioning
`borges.mino.mobi`. Pure static + a thin routing worker: no D1, no AI, no
secrets beyond the shared Cloudflare credentials. The engine runs entirely in
the browser, so a stable permalink is free and instant.

## Live telling (optional inference layer)

The procedural telling is canonical and always rendered. On top of it, a model
can **retell** a tale from the deterministic spec — supplying the connective
glue, in the teller's voice — without changing plot, cast, or the movement
structure (so the mythograph posted before the telling still matches). The first
rendering is **frozen** as an atproto record, so `/t/<n>` never drifts.

- **Model:** Gemini 2.5 Flash (Google AI Studio free tier). The worker calls
  `generativelanguage.googleapis.com` directly; no Cloudflare AI binding.
- **Cache = atproto:** each telling is a public `com.minomobi.borges.telling`
  record (rkey = `n`) on a service PDS. Reads are unauthed; writes use a service
  account session. Schema: `lexicons/telling.json`.
- **Prompt:** `BORGES.promptFor(tale, interstitial)` (in `js/generate.js`) hands
  the model the procedural draft + the night's frame and asks it to retell,
  faithfully, as strict JSON `{movements:[{title,body}]}`.
- **Worker API** (`worker.js`, additive and fully guarded):
  - `GET /api/telling/<n>` — read-only cache lookup (public PDS getRecord).
  - `POST /api/telling` — render via Gemini, then putRecord (first-write-wins).
- **Client** (`js/render.js`): reads the cache on load and swaps in the live
  telling if present; otherwise shows a "✦ Let &lt;Teller&gt; tell it live"
  button. Any failure (no secrets, network, model error) stays silently on the
  procedural draft — the site is unchanged when inference is off.

### Required secrets (set with `wrangler secret put`, not committed)

| Secret | What |
|--------|------|
| `GEMINI_API_KEY` | Google AI Studio key (free, no card) |
| `BORGES_PDS_URL` | the service account's PDS host, e.g. `https://bsky.social` |
| `BORGES_PDS_DID` | the service account DID (for public reads) |
| `BORGES_PDS_HANDLE` | the service account handle (for writes) |
| `BORGES_PDS_PASSWORD` | an **app password** for the service account (writes) |

Until these are set the `/api/telling` endpoints return "not configured" and the
client never offers the live telling. No `wrangler.jsonc` change is needed.

## Testing the engine off-page

```bash
# the generator runs in plain node (it attaches to globalThis, not just window)
node -e '
  const vm=require("vm"),fs=require("fs"),ctx={};ctx.globalThis=ctx;vm.createContext(ctx);
  for(const f of ["js/prng.js","js/tellers.js","js/lexicon.js","js/generate.js"])
    vm.runInContext(fs.readFileSync("borges/"+f,"utf8"),ctx);
  const t=ctx.BORGES.generate(1729);
  console.log(t.n, t.teller.name, "—", t.title);
'
```
