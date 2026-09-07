# BRIEF — who-northern

## What this is

Someone asked "who is northern lion", replying to a post about giving
Northern Lion's "motivational speech" to a math model to force a
breakthrough. The ask reads as genuinely wanting to know who he is, with
the AI-pep-talk post as the reason it came up — not a request to build
anything about the AI joke itself. Shipped as a single static page: a
plain-language bio of Northern Lion (Ryan Letourneau, Canadian streamer/
YouTuber, huge Binding of Isaac catalogue, known for a flat deadpan
delivery style that's the opposite of typical streamer hype), a short,
hedged read on why "a Northern Lion pep talk" is funny as a bit (he's the
last person you'd expect to hype anything up), and a small original
"pep talk generator" — invented deadpan one-liners in that spirit, not
real quotes from him or anyone else.

## Decisions

- **No Bluesky handle lookup, deliberately.** The profile
  (`lab/_profiles/ezba.bsky.social.md`) already documents this requester as
  comfortable with pure-concept pages that skip the handle box, and there
  was no safe way to know or guess a real Bluesky account for Northern
  Lion from inside this sandbox (no network, and a wrong guess would show
  the wrong person). Rather than fabricate one, the page just doesn't have
  a lookup at all.
- **Hedged the meme explanation instead of asserting it.** I don't have a
  source for the specific "math model breakthrough" exchange the thread
  references, so the page states plainly that the "why it's funny" framing
  is *my read*, not a verified fact, and doesn't claim to have seen
  whatever prompt/output prompted the original post.
- **Did not quote the two thread posts** (norvid-studies, eikopf.com) on
  the page. They're context for what the request meant, not content with a
  reason to be reproduced publicly, per the brief's own instruction.
- **Original pep-talk lines, not real quotes.** Writing fake quotes and
  attributing them to a real person would be the kind of overclaim the
  brief warns against; an explicitly-labeled generator sidesteps that
  while still landing the bit.
- Kept the established house style from sibling builds (rainbow gradient
  h1, gradient-bordered panels, a single pulsing-gradient toggle gating
  the deeper "what he's known for" section) — matches this requester's
  documented preference for maximalist chrome with the reading surface
  kept plain.

## The plan (if there's a next turn)

This shipped as a complete, small page — there's no obvious missing hard
part. If the requester comes back:

- If they want a *real* pep-talk clip or an actual quote of his, that
  needs a linked source (a video/clip URL) fetched through
  `lab-fetch-refs.mjs` at build time — this build had no such link to
  work from, only the thread text.
- If they name his actual Bluesky handle (if he has one), a `kit.bskyGet`
  profile card would be a small, safe addition — but only once the
  requester supplies or confirms the handle, not before.
- If "too much text" comes back (a pattern this requester has raised on
  other builds), trim the two static panels further and move more into
  the toggle — the pep-talk generator should probably stay visible either
  way since it's the interactive piece.

## Gotchas

- NOTE.txt has a hard 250-character ceiling — took two rewrites to fit
  while still saying something the page itself can't (why there's no
  handle lookup, and that the meme explanation is a read, not sourced).
- No network in this sandbox at all, so every biographical claim above is
  from general pretrained knowledge, not a live check — flagged on the
  page itself rather than silently presented as freshly verified.
