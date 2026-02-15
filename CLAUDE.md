# The Bench — Biotech Intelligence Platform

## What This Is
An agentic biotech intelligence publication styled as a newspaper broadsheet. The entire pipeline — research, writing, social posting, editorial discussion, and podcast — is driven by Claude acting as the research and editorial team.

## Publication Name
**The Bench** — a double meaning: the laboratory bench where science happens, and the judicial bench implying authority and rigor.

## Architecture

### Content Pipeline
```
Research → Bluesky Thread → Article → Editorial Panel → Podcast
```

1. **Research**: Deep investigation of a biotech topic. Sources include academic papers, SEC filings, press releases, funding announcements, and regulatory filings.
2. **Bluesky Posts**: Incremental research findings posted as a thread. Posts go in `posts/` as markdown files, pushed to trigger the GitHub Action.
3. **Article**: Full newspaper-style article published to the site. Articles go in `articles/` as HTML files.
4. **Editorial Panel**: Multi-voice discussion of the article's implications. Written as a transcript.
5. **Podcast**: The editorial discussion converted to audio via ElevenLabs TTS. Audio goes in `assets/podcast/`. RSS feed updated in `feed.xml`.

### Directory Structure
```
/
├── index.html              # Front page — newspaper layout
├── feed.xml                # Podcast RSS feed
├── CLAUDE.md               # This file — pipeline instructions
├── assets/
│   ├── css/newspaper.css   # Newspaper styling
│   └── podcast/            # MP3 episode files
├── posts/                  # Bluesky thread drafts (triggers GitHub Action)
├── articles/               # Full HTML articles
├── .github/
│   └── workflows/
│       └── post-to-bluesky.yml  # Posts threads to Bluesky on push
└── src/                    # Future: automation scripts
```

### Bluesky Post Format
Posts are markdown files in `posts/`. The format:

```markdown
---
Thread title or topic identifier
---
First post in the thread (max 300 chars).
---
Second post in the thread (max 300 chars).
---
Third post, and so on.
```

- Each section between `---` delimiters is one post in the thread
- The first `---` block is metadata/title (not posted)
- Keep each post under 300 characters
- The GitHub Action handles authentication and threading automatically

### Bluesky Secrets Required
Add these as GitHub repository secrets:
- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., `user.bsky.social`)
- `BLUESKY_APP_PASSWORD`: An app password from Bluesky settings (not your main password)

### Article Format
Articles are full HTML pages in `articles/`. They should:
- Link back to `newspaper.css` via `../assets/css/newspaper.css`
- Use the same typographic classes (`.headline-lead`, `.article-body`, etc.)
- Include proper byline, kicker, and dateline

### RSS / Podcast Feed
`feed.xml` is a standard RSS 2.0 feed with iTunes podcast extensions. When adding episodes:
- Add a new `<item>` block before the closing `</channel>` tag
- Audio files go in `assets/podcast/`
- Include `<enclosure>` with the MP3 URL, file size, and MIME type
- The feed URL assumes deployment at `agent01.pages.dev` — update if the domain changes

### Site Deployment
- Hosted on **Cloudflare Pages**
- Auto-deploys from the `main` branch
- No build step — static files served directly
- Domain: `agent01.pages.dev` (or custom domain if configured)

## Topic Focus
**Biotech** broadly, with current emphasis on:
- Clinical automation workflows (point of care and testing laboratories)
- Diagnostics and molecular testing platforms
- AI/ML applications in clinical settings
- Regulatory developments (FDA clearances, CE marking)
- Funding rounds, IPOs, M&A in the space

## Tone & Voice
- Authoritative but accessible — think *STAT News* meets *The Economist*
- No hype, no breathless futurism — grounded in what's actually shipping
- Technical precision without jargon overload
- Healthy skepticism toward vendor claims
- The editorial panel can have opinions; the news articles should not

## Working With This Repo
When Claude is asked to publish:
1. Research the topic deeply
2. Draft Bluesky thread posts in `posts/YYYY-MM-DD-slug.md`
3. Write the full article in `articles/YYYY-MM-DD-slug.html`
4. Update `index.html` with the new article's headline and summary
5. Commit and push — the Action handles Bluesky posting
6. (Future) Generate editorial panel transcript and podcast audio
