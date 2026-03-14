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

Single-word rapid serial visual presentation with ORP (optimal recognition point) alignment.

**ORP algorithm** (from Spritz research):

| Word length | ORP position |
|-------------|-------------|
| 1           | 0           |
| 2–5         | 1           |
| 6–9         | 2           |
| 10–13       | 3           |
| 14+         | 4           |

The ORP character is displayed in the accent color and fixed at the center of the display via a CSS grid layout (`1fr auto 1fr`). Characters before the ORP right-align; characters after left-align. This keeps the reader's eye at one fixed point.

**Adaptive speed**: Base delay is `60000 / WPM` ms. Multipliers:

| Condition | Multiplier |
|-----------|-----------|
| Word > 8 chars | 1.3x |
| Word > 12 chars | 1.5x |
| Clause ending (`,;:`) | 1.4x |
| Sentence ending (`.!?`) | 2.0x |
| Paragraph boundary | 2.5x |

**Optional features**:
- *Bionic reading*: Bold the first half of each word. Research shows no measurable reading speed benefit (Snell 2024, Readwise n=2074), but some users report subjective focus improvement. Offered as a toggle, not a default.
- *Color-changing frames*: Brief chromatic flash between word presentations. Hypothesized to reduce backward masking and provide temporal segmentation cues. Experimental — no direct literature.

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

- **Eye tracking**: WebGazer.js for attention detection (gaze presence, blink rate). Not word-level — ~4° accuracy at standard webcam resolution. Useful as a supplementary signal to text-complexity-based adaptation.
- **Multi-word chunks**: Display 2-3 words at a time instead of single words. May improve comprehension by preserving some phrasal context.
- **ATProto bookmarks**: Store reading positions and annotations on the user's PDS instead of localStorage.
- **Offline PWA**: Service worker for offline reading of downloaded texts.
