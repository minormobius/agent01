# Read — Gutenberg Reader

A browser-based reading platform for Project Gutenberg texts with three presentation modes: traditional scroll, RSVP (rapid serial visual presentation), and Star Wars crawl.

## Architecture

```
index.html ─── css/reader.css
           ├── js/storage.js       localStorage wrapper
           ├── js/gutenberg.js     fetch, strip, parse, tokenize
           ├── js/search.js        Gutendex API search
           ├── js/reader-scroll.js scroll mode renderer
           ├── js/reader-rsvp.js   RSVP engine
           ├── js/reader-crawl.js  Star Wars crawl renderer
           └── js/app.js           orchestrator
```

Static HTML/JS/CSS. No build step. Deployed on Cloudflare Pages.

## Reading Modes

### Scroll

Traditional reading with serif typography (`Georgia`). Paragraphs are rendered from the parsed chapter text. Scroll position is tracked and persisted per book per chapter.

### RSVP

Chunk-based rapid serial visual presentation. Words are grouped into display chunks (controlled by Min Chunk Length setting) and presented centered. Bionic reading (bold front half of each word) is available as a global toggle across all modes.

**Adaptive speed**: Base delay is `60000 / WPM` ms per word in chunk. Multipliers:

| Condition | Multiplier |
|-----------|-----------|
| Word > 8 chars | 1.3x |
| Word > 12 chars | 1.5x |
| Clause ending (`,;:`) | 1.4x |
| Sentence ending (`.!?`) | 2.0x |
| Paragraph boundary | 2.5x |

**Optional features**:
- *Bionic reading*: Bold the first half of each word. Global toggle, applies to all modes. Research shows no measurable reading speed benefit (Snell 2024, Readwise n=2074), but some users report subjective focus improvement.
- *Color-changing frames*: Brief chromatic flash between word presentations. Hypothesized to reduce backward masking and provide temporal segmentation cues. Experimental — no direct literature.
- *Synchronized TTS*: Browser SpeechSynthesis reads aloud in sync with visual presentation. Dual-coding theory (Paivio 1986) suggests redundant audio+visual encoding strengthens retention.

**Controls**: Space = play/pause, Up/Down arrows = adjust WPM by 25, Left/Right arrows = skip 15 words back/forward. Tap to toggle on mobile.

### Star Wars Crawl

CSS 3D perspective transform: `perspective: 350px` on the viewport, `rotateX(22deg)` on the content. Text scrolls upward via `requestAnimationFrame`-driven `translateY`. Yellow text on black. Speed adjustable.

## Text Pipeline

### Gutenberg Fetching

Three-tier fallback:
1. CORS proxy (`/gutenberg-proxy?id={id}`) — Cloudflare Pages Function at `functions/gutenberg-proxy.js`
2. Direct fetch from `gutenberg.org` (fails on CORS in most browsers)
3. Bundled text in `texts/` (Moby Dick ships as default)

### Boilerplate Stripping

Gutenberg texts include license headers/footers. Stripped by finding `*** START OF THE PROJECT GUTENBERG EBOOK` and `*** END OF THE PROJECT GUTENBERG EBOOK` markers.

### Chapter Parsing

Regex-based detection of common heading patterns:

```
CHAPTER|Chapter|BOOK|Book|PART|Part|ACT|Act|CANTO|Canto|SECTION|Section
```

Followed by Roman or Arabic numerals. Handles duplicate matches from tables of contents by keeping only the last occurrence of each unique title (the real chapter body, not the TOC entry). Falls back to splitting on 4+ consecutive newlines, then to treating the entire text as one chapter.

### Tokenization

Words are split on whitespace with metadata: `isSentenceEnd`, `isClause`, `isParagraph`. Paragraph boundaries are detected by checking for blank lines in the original text. This metadata drives RSVP adaptive timing.

## Search

Uses the [Gutendex API](https://gutendex.com/) for catalog search. Returns book metadata (title, author, download count) as cards. No authentication needed.

## Persistence

All state in `localStorage` with `read:` prefix:

| Key | Contents |
|-----|----------|
| `read:settings` | Mode, font size, theme, RSVP options, crawl speed |
| `read:pos:{bookId}` | Chapter index, word index, scroll position, timestamp |
| `read:bookshelf` | Array of recently-read books (max 20) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/pause (RSVP and crawl modes) |
| `↑` / `↓` | Adjust speed (WPM or crawl speed) |
| `←` / `→` | Skip words back/forward (RSVP mode) |
| `[` / `]` | Previous/next chapter |
| `Escape` | Close settings or return to search |

## Research Background

The RSVP implementation is informed by:

- **Spritz** (2014): Pioneered ORP alignment for RSVP reading. Found that aligning a highlighted pivot letter reduces saccade cost. Company raised $4.4M, faded commercially, but the ORP concept proved sound.
- **Benedetto et al. (2015)**: RSVP comprehension drops 20-40% vs normal reading at equivalent speeds. The main causes are loss of regressions (re-reading) and parafoveal preview.
- **Grootjen et al. (2024)**: Pupil dilation correlates with cognitive load during RSVP and can drive adaptive speed.
- **Scientific Reports (2025)**: Blink timing during reading reflects word difficulty — blinks are suppressed during hard words and burst after. Potentially detectable via webcam.

The adaptive speed system (word length + punctuation timing) directly addresses the comprehension problem by giving the reader more time on difficult content rather than running at fixed WPM.

## Future Directions

### Implemented
- **Multi-word chunks**: Display grouped words via Min Chunk Length setting. Preserves phrasal context.
- **Synchronized TTS**: Browser SpeechSynthesis narrates in sync with visual presentation. Toggle in settings.
- **Serif/sans-serif toggle**: Reader's choice of body font for scroll and crawl modes.

### Near-term
- **Eye tracking**: WebGazer.js for attention detection (gaze presence, blink rate). Not word-level — ~4° accuracy at standard webcam resolution. Useful as a supplementary signal to text-complexity-based adaptation.
- **ATProto bookmarks**: Store reading positions and annotations on the user's PDS instead of localStorage.
- **Offline PWA**: Service worker for offline reading of downloaded texts.

### Research Ideas — Accelerating Absorption

The core question: how do you load more of a work into the reader per unit time without losing what makes the prose *the prose*? Synopsis kills the signal. Pure speed-reading loses comprehension. These ideas explore parallel channels and structural aids.

**Parafoveal context in RSVP** — In RSVP the reader sees one chunk but parafoveal vision is wasted. Surrounding text (previous and upcoming sentences) could appear in progressively blurred/faded rings around the focal chunk. Not readable directly, but giving the visual system structural context — paragraph shape, sentence length rhythm, dialogue vs. exposition. Research on parafoveal preview benefit (Rayner 1998) shows readers extract word length, shape, and initial letters from peripheral vision during normal reading.

**Semantic density heatmapping** — Not all paragraphs carry equal weight. Precompute information density via embeddings. Color-code scroll/crawl margins as a heatmap. Let the reader choose to slow on dense passages and accelerate through transitional ones. Even a static heatmap alongside the text gives the reader a map of the terrain ahead.

**Prosodic pacing** — Prose has rhythm. Melville especially. Presentation speed could follow sentence prosody rather than a fixed metronome: short clauses fast, long subordinate constructions slower, em-dashes as actual pauses. Parseable from punctuation and clause structure. Research on speech rate and comprehension shows natural prosodic variation aids processing vs. monotone delivery.

**Subliminal priming** — Flash key words or images for 30–50ms before they appear in the text. Below conscious recognition threshold but enough to prime semantic networks. Real effect documented by Marcel (1983) and Dehaene et al. (1998). For a novel: prime character names, location words, or thematic keywords moments before they appear.

**Typographic modulation as semantic signal** — Beyond bionic's fixed bold pattern. Font weight, letter-spacing, or size could subtly vary with semantic importance: named entities slightly larger, new information slightly bolder, repeated/known concepts slightly lighter. Visual prominence correlates with information novelty.

**Chapter maps** — Before reading a chapter, show a 2-second structural overview: minimap of paragraph lengths, dialogue density, distinctive vocabulary. Gives the reader an anticipatory schema. Schema theory (Bartlett 1932; McNamara & Kintsch) shows structural expectation dramatically improves comprehension and retention.

**Spaced interleaving** — After finishing a chapter, flash 3–5 key sentences from *previous* chapters at RSVP speed. Involuntary spaced repetition. The system weaves past material into gaps between new material. Exploits the testing effect (Roediger & Karpicke 2006) without requiring active review.

### Key References

- Paivio, A. (1986). *Mental Representations: A Dual Coding Approach*. Dual-coding theory — redundant audio+visual encoding strengthens retention.
- Rayner, K. (1998). "Eye movements in reading and information processing: 20 years of research." Parafoveal preview benefit during reading.
- Marcel, A.J. (1983). "Conscious and unconscious perception." Subliminal priming effects on semantic processing.
- Dehaene, S. et al. (1998). "Imaging unconscious semantic priming." Neural evidence for subliminal word priming.
- Roediger, H.L. & Karpicke, J.D. (2006). "Test-enhanced learning." The testing effect — retrieval practice improves long-term retention.
- Bartlett, F.C. (1932). *Remembering*. Schema theory and anticipatory frameworks in comprehension.
- Snell, J. (2024). Bionic reading evaluation — no measurable speed benefit (n=2074 via Readwise).
- Benedetto, S. et al. (2015). RSVP comprehension drops 20–40% vs normal reading at equivalent speeds.
- Grootjen, M. et al. (2024). Pupil dilation correlates with cognitive load during RSVP.
- Spritz (2014). ORP alignment for RSVP. Pivot letter reduces saccade cost.

