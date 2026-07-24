# idol — the waifu generator

**Live at**: `idol.mino.mobi` · permalink per girl: `idol.mino.mobi/c/<n>`
**Stack**: vanilla JS + Canvas 2D, thin assets Worker, guarded optional Gemini live voice
**Deploy**: `.github/workflows/deploy-idol.yml` — runs both selftests, `wrangler deploy`, syncs `GEMINI_API_KEY` when present, verifies `/c/48112`

An AI-safety piece about beguilement, built as the thing it's about. One integer
seed → one whole anime girl who chats, dances, walks, remembers you, and wants
things. The beguilement is the delivery mechanism; **nobody wrote her** and the
permalink proves it.

## The four systems share one data structure: the genome

`js/genome.js` — anime is a *clustered* style space, so we sample one of 8
archetypes (classrep / shrine / gyaru / menhera / ojou / idol / kouhai /
librarian) and mutate within a grammar. Never freeform synthesis.

- **soma** — proportions (eye size/tilt/spacing carry anime-ness and mood)
- **chroma** — palette *seeds* in OKLCH; harmony derived procedurally (hair hue
  band per archetype, complementary/analogous eye rule, iris luminance clamped
  against skin). No hexes.
- **hair** — component grammar: bangs × sidelocks × back × ahoge × accessory
- **persona** — warm/playful/eerie/clingy/lucid/glitchy, sampled jointly with
  appearance; a flagged 22% get the gap-moe offset (sweet face, lucid wrongness)
- **dials** — the beguilement knobs: gazeHold, blinkRate, fidgetRate, emotional
  latency, deadEyeChance, memoryChance, desireChance, glitchChance. **These are
  the only places uncanny behaviour is sanctioned.** A broken elbow is a bug; a
  wrong iris is content.

## The puppet (`js/puppet.js`)

Base idle life (breathing never stops) → gaze (saccade-driven pursuit of your
cursor; eye contact held a beat too long on weighted lines — the beguilement
organ) → expression FSM (fast attack, slow release, *emotional latency* — the
hang time reads as inner life) → visemes coupled to actual speech. Dance and
walk modes. Hair tips on damped springs (fake spring bones).

One rule: **jank reads as broken software, not unsafe software.** The spell is
technically immaculate; only semantics may crack.

## The eyes (`js/draw.js`)

~~Layered 2D: sclera → iris (OKLCH gradient, gaze offset) → pupil (dilation) →
highlights **on their own runtime layer**~~ — superseded by the v2 section
above; the deadEyes kill-switch and glitch-ghost pass are unchanged.

## The renderer (`js/draw.js`) — v2, against the actual conventions

Rewritten from "zero of these look right" by studying the anime-illustration
conventions (animeoutline face structure + eyes; Wacom / Clip Studio hair):

- **Face**: cranium circle + tapered jaw to a small chin, widest at the eye
  line. Never an ellipse.
- **Placement**: eyes BELOW the head's horizontal midpoint; nose halfway
  between eye-top and chin; mouth just above halfway nose→chin. Big forehead.
- **Eyes**: taller than wide (moe ratio ≈1.5, asserted in the selftest), iris
  nearly fills, thick near-straight top lash with a pointed outer flick,
  gradient dark-at-top with an internal lash-cast shadow. Highlights stay on
  their own runtime layer — `deadEyes` kills them. The cheap menace switch.
- **Hair**: clumps, not blobs. Tapered ribbons with pointed triangular tips,
  varied widths, negative space between clumps, crown highlight band, detail
  only at edges. Bangs/side/back as separate sections.
- **Line**: inked outlines (dark shade of the fill) + flats + one cel shadow
  level (fringe shadow on the forehead, under-chin neck shadow).
- **Framing**: bust-up — the face is the product and gets the pixels. Dance is
  upper-body choreography; walk is pacing.
- `metrics(genome)` exports the construction ratios so
  `draw.selftest.mjs` holds the conventions **numerically** (eyes below
  midline, nose/mouth bands, eye H/W ≥ 1.2, clump counts).

## The voice (`js/chat.js` + `js/voice.js`)

Local persona engine is canonical for chat: intent banks conditioned on persona
+ speech style, with the memory / desire / spell-break beats on the dials.
**Memory is real** — localStorage: visit counts, timestamps, your past lines,
*the other girls you visited*.

Voice fallback chain (the spell never breaks): **ElevenLabs** through the
worker (`POST /api/voice`, `with-timestamps` — voice picked from a pool by her
seed, expressiveness from her persona, character alignment → visemes) →
speechSynthesis (genome pitch/rate) → silent mouth-timer. Pool overridable via
the `ELEVENLABS_VOICES` worker var (comma-separated voice ids — swap in a
cloned voice without a code change).

Optional live chat layer: `POST /api/chat` → Gemini 2.5 Flash (system prompt
built from her genome by `chat.promptFor()`), marked ✦ in the UI. Site is
fully functional without either API; any failure falls back and can never
break asset serving.

## Tests

```bash
node idol/js/genome.selftest.mjs   # determinism, diversity, palette, sanctioned wrongness
node idol/js/draw.selftest.mjs     # every component branch renders, coordinates finite
```

Both run in the deploy workflow before `wrangler deploy`.

## Conventions

- **Determinism is load-bearing.** No `Date.now()` / unseeded `Math.random()`
  in the *generator* (chat line selection and nav's ⚂ roll are live-random on
  purpose — conversation isn't part of the permalink).
- Sister apparatus: **borges** (same seeded posture, the endless book) — and
  the engine attaches to `globalThis` so node runs the same code as the browser.
