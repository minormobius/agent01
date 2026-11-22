# The deck format: usability laws

A deck is a run of phone-sized slides. Each slide is one live widget with
lecture notes on a sheet over it. These laws apply to every deck built in this
format. **Machine-checked** laws are enforced by `browser.selftest.mjs`, which
preflight runs whenever this directory changes. The rest are checked in review.

## The widget

**1. One idea per slide.** The title states the idea. The caption takes two
sentences at most. If a slide needs a second widget, it is two slides.

**2. Every slide asks you to do something, and the widget notices.** The `do`
line names one action on the widget ("pin t to within 0.01 of the first
zero"). The widget calls `ctx.done()` when you have actually done it, not when
you scroll past. *Machine-checked: every slide has a `do`.*

**3. Every chart has a cursor that reaches every data point.** *Machine-checked.*
- The cursor **snaps to real data**: the points the chart was drawn from. It
  never interpolates a value that was not computed.
- It shows **every series at that point**, each in its own colour, with its
  value, and the x it belongs to.
- It works by **pointer** (hover, or press-and-drag on touch) and by
  **keyboard**: Tab focuses the chart, ← → step through points (↑ ↓ for
  vertical layouts), Home and End jump to the ends, and Esc hides it.
  Keystrokes on a focused chart never turn the page.
- It **survives redraws**. Moving a slider keeps the cursor on the same data
  point.
- A heatmap's data points are its cells: the cursor snaps to a cell centre and
  the arrow keys walk cells (Shift for 10 at a time).
- Use `cursor()` from `kit.js`. A chart drawn without it fails the test.

**4. Light, dark, or the system's choice, on every page.** A toggle in the
header cycles auto → light → dark and is remembered (`proofs-theme`). Every
colour is a CSS token. Charts read the tokens when they draw and redraw when
the theme changes, so no chart hard-codes a colour. *Machine-checked: the
toggle changes the page background, and a chart's strokes change with it.*

**5. The widget owns its gestures.** Sliders, drags and taps on the stage
never turn the page. Pages turn from the sheet (a sideways swipe), the arrow
buttons, the progress bars and the ← → keys, but not while a chart has focus.
A drag across a chart moves its cursor and **never starts a text selection**:
the chart and its labels are unselectable, and on touch the long-press
selection and callout are suppressed (`noSelect()` in `kit.js`, applied by
`cursor()`). The notes stay selectable. *Machine-checked: a corner-to-corner drag
over every chart selects nothing, and the caption can still be selected.*

## The notes

**6. Notes go over the widget, never instead of it.** At peek the sheet covers
at most 46% of the screen, and the widget lays itself out in the rest. Opening
the full notes dims the widget but leaves it in place. *Machine-checked: the
peek height.*

**7. Predict before the reveal.** Where the answer is surprising, the slide
asks for a prediction first. Answers commit: you cannot change one after the
reveal. The reveal says why.

**8. Recall at the end.** A deck ends with questions answered from memory,
each linking back to its slide.

## Honesty

**9. Numbers come from the engine.** The deck computes nothing of its own
beyond plotting. The engine's selftest holds every number a slide shows to a
known value.

**10. Label what a chart is.** Claims are drawn in the claim colour. A
qualitative picture says "shape only". Log axes say so.

## The page

**11. Phone first.** Nothing scrolls sideways at 390 px. Touch targets are at
least 2rem tall. *Machine-checked: no horizontal scroll.*

**12. Resumable and linkable.** `#n` opens slide n. Progress, predictions and
answers are saved in this browser only, and every storage access is wrapped
so a private window still works.

**13. Nothing breaks.** No console errors on any slide in either theme, and
every slider, swept from end to end, draws finite numbers. *Machine-checked.*
(The sweep exists because autopilot's first full run found slide 12 drawing NaN
above β ≈ 0.868, where its crossover stops existing. No test had touched the
top of that slider.)

## Writing

**14. Headings name their section.** A heading says what the section contains
("Turing's method: a matching count puts every zero on the line"), not a
teaser that withholds it ("Why counting proves things", "The guess", "Watch
for", "Plotted how"). No heading opens with Why, What or How, none ends in a
question mark, and the same goes for slide titles. *Machine-checked by a lint
in `riemann.selftest.mjs`, over the deck and the reference page.*

## The chatbot

**15. A follow-up question gets an answer from the deck, in place.** The
header's **ask** button opens a panel over the notes. The panel knows the
current slide, suggests three questions, and streams the answer.
- The model is Gemini Flash (Google) first, with Llama 3.3 70B on Cloudflare
  Workers AI as the fallback when Gemini refuses (quota or rate limit) or fails.
  Both sit behind `POST /api/ask` on the surface's own worker, and every answer
  names the model that wrote it. The **server** loads the deck's text
  (`context.txt`, generated from the slides, the notes, the reference page, the
  timeline and the audit). The browser sends only the deck, the slide number,
  the question and the last six turns, so the context cannot be swapped or
  padded.
- The system prompt makes the model answer from the deck first, flag anything
  beyond it, refuse to call RH proved, and point to slides by number. Slide
  numbers in answers become links.
- Answers are selectable. Typing never turns the page, Esc closes the panel,
  and a refused question (too long, rate-limited) shows its reason in the
  thread.
- The panel says which models answer, that they can be wrong, and that
  questions go to Google or Cloudflare.
- Limits: 600 characters a question, 700 tokens an answer, 8 questions a
  minute per IP, and same-origin requests only.
- *Machine-checked*, with the endpoint mocked so no test calls a model: the
  panel opens on the right slide, the request carries no context, a streamed
  answer renders with slide links, the keyboard behaves, and a 429 is shown.
  `proofs/worker.selftest.mjs` checks the endpoint's guards against a fake AI,
  and `riemann.selftest.mjs` fails if `context.txt` is stale.

## Autopilot

**16. The deck can lecture itself, and the reader can always take over.** The
header's **▶ lecture** button starts autopilot. Studio's formant voice
(`studio/lib/chipvoice.js`, copied byte-identically to `vendor/chipvoice/`)
reads each slide's script in `lecture.js`. Each line can sweep a slider, press
a button or place the chart's cursor for as long as it takes to say. At the end
of a slide's lines the deck turns the page.
- **Subtitles always.** Every spoken line is shown, written the way a reader
  would write it (`text`), over the widget and above the sheet. The voice is
  synthetic and the subtitle is the record.
- **The reader takes over.** A real touch, key or scroll on the widget pauses
  the lecture (autopilot's own events are synthetic, so they don't count). A
  page turn restarts it on the new slide. Opening the chat pauses it. **Stop**
  ends it.
- **Autopilot never acts for the reader**: it doesn't tick a slide's task and
  doesn't answer a prediction. It asks, leaves a beat to think, and says the
  answer.
- **Lines are words.** `say` holds no digits or symbols ("pi of x", "one half"),
  and every word must be in the generated lexicon. `build-narration.mjs` fails
  on a word the CMU dictionary lacks.
- *Machine-checked:*
  - the voice is studio's, unchanged
  - `narration.js` is current, and every slide has a script of words only
  - every line's target exists on its slide
  - the voice renders a line in the browser at the length `narration.js` says
  - the subtitle shows and the slider sweeps
  - no task is credited
  - a real touch pauses the lecture, and Stop ends it
