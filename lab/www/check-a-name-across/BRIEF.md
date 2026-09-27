# BRIEF — insert-banner

## What this is

The requester (ezba.bsky.social) asked to "insert a banner with a link at the
top of the page directing users to domain-gen.com," calling it "the more
complete version of this idea." The idea in question, from elsewhere in the
thread, was a tool to check domain availability and pull public info about a
name across a wide range of TLDs.

Shipped: a single-page site with a rainbow-chrome banner at the very top of
the body linking out to `https://domain-gen.com`, a short honest explainer,
a small client-side "preview" tool (type a word, see it formatted as
`word.com`, `word.io`, `word.dev`, … across ~18 TLDs), and a second CTA
button repeating the domain-gen.com link below the tool. That's the whole
site — one `index.html`, no JS dependencies, no network calls.

## Decisions

- **Did not attempt a real availability checker.** `lab/www/worker.js`'s CSP
  `connect-src` only allows `'self'`, `minomobi.com`, `lab.minomobi.com`,
  `auth.mino.mobi`, `public.api.bsky.app`, `plc.directory`, and
  `*.host.bsky.network` — no WHOIS, no RDAP, no registrar API, nothing that
  could tell you if a domain is actually taken. There was no way around this
  short of widening the CSP, which is a human-only, cross-tenant decision
  (see `lab/www/CLAUDE.md`) and not something a single tenant build gets to
  ask for lightly. Building a checker that *looked* real but wasn't would
  have been a worse outcome than being upfront about the limit.
- **Built a "format preview" instead of a bare banner.** The requester's
  phrasing ("which is a more complete version of this idea") reads as: build
  a version of the idea here, but be honest that domain-gen.com already does
  it properly, and point there. So the page does both — a working (if
  limited) piece of the idea, plus the banner. If that reading is wrong and
  they only wanted the bare banner, the fix is deleting the `.panel` block
  and the `<script>`, which are cleanly separable from the banner markup.
- **No Bluesky lookups, no `kit.handleInput`.** This isn't identity-shaped —
  there's no handle to resolve, no profile to show — so the kit's typeahead
  and `bskyGet` are unused here. That's deliberate, not an oversight.
- **Didn't put "domain-gen" in the `<title>` as the site's own name.** The
  page is titled "check a name, across every tld" — its own name — and
  mentions domain-gen.com only as an external link target, in body copy and
  the banner. Kept it that way to stay clearly on the right side of the
  "don't take someone else's mark as your own site's name" rule, even though
  that rule is really aimed at cloned mechanics, not link-outs.

## The plan (if there's a next turn)

Nothing is broken or half-built — this is a complete, working page for the
scope as understood. If the requester comes back:

- If they say "just the banner, drop the rest" — delete the `.panel` div,
  the `<script>` block, and the second `.cta` button; keep the top banner.
  That's a subtractive change, not a rebuild.
- If they want the preview to feel more like a real check (e.g. "grey out
  TLDs that look like they might be common/taken") — don't. There's no data
  source to base that on from here, and faking a signal would be worse than
  the current honest "format only" framing. Say so again if asked.
- Untested claim: I have not seen this render in a browser. The harness
  screenshots it after this turn; if the gradient text on `h1` fails to
  clip in some engine (the `-webkit-background-clip: text` fallback), the
  worst case is a solid `color: transparent` heading — check for an
  invisible `<h1>` first if something looks off.

## Gotchas

- `lab/www/worker.js`'s CSP is the actual hard limit here, not just a style
  guideline — re-read it (or `lab/www/CLAUDE.md`'s "What a lab site is
  allowed to reach" section) before assuming any external API is reachable
  from a lab page.
- The kit's global `prefers-reduced-motion` rule in `tokens.css` (targeting
  `*, *::before, *::after`) already neutralizes the gradient `shift` and
  button `pulse` animations used here — no local media query was needed or
  added.
