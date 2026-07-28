# want-pairwise — a two-circle Venn of who two Bluesky accounts talk to

## What this is

A single page at `minomobi.com/want-pairwise/`: enter two Bluesky handles and
get a Venn diagram of who each one interacts with most, with the overlap —
accounts both handles interact with — emphasized in the middle. Below the
diagram, the same data repeats as three plain-text columns (only-A, both,
only-B) for accessibility and because a scatter of tiny avatars is a fun
picture but a bad primary source of truth.

## What was asked

First build, from a Bluesky thread: "I want a pairwise interaction circle for
bsky. Enter two handles and get their top n accounts for interaction. Present
it like Venn, emphasize the overlap." No prior context, no iteration yet.

## What "interaction" means here, and why

There is no public Bluesky endpoint that answers "who does account X interact
with" directly — no `getActorLikes`, nothing like it, and the allowed-method
list in `scripts/lab-content-gate.mjs` / `kit.bskyGet` rules out anything that
would read from an unbounded stream (`searchPosts`, `getFeed`, etc.) rather
than a subject the visitor named. So this defines "interaction" as: **who each
account replies to, quotes, mentions, or reposts, tallied across their most
recent public posts** — sourced entirely from `app.bsky.feed.getAuthorFeed`,
which is the visitor's own named subject and nothing else.

Per handle, the flow is:

1. `com.atproto.identity.resolveHandle` — turn the typed handle into a DID.
   Handled defensively: `resolveHandle.error.json` is what a typo returns, and
   the page surfaces a plain "check the spelling" message rather than a raw
   HTTP error, since `kit.fetchJson` throws on non-2xx without the body.
2. `app.bsky.feed.getAuthorFeed`, paginated up to 3 pages (300 posts), through
   `kit.visible()` so moderation-labelled posts are dropped before anything is
   counted.
3. Per feed item: if it's a repost (`reason.$type ===
   'app.bsky.feed.defs#reasonRepost'`), tally `post.author` — that is who the
   queried account amplified — and nothing else from that item, since the
   post's own reply/quote/mention data belongs to whoever wrote it, not to the
   account being measured. Otherwise it's the account's own post or reply:
   tally the reply's parent (and root, if a different account) via
   `item.reply.*.author`, the quoted post's author via the hydrated
   `post.embed` (`app.bsky.embed.record#view` / `recordWithMedia#view`, not
   the raw `record.embed`, which only has a URI), and every
   `app.bsky.richtext.facet#mention` DID in `post.record.facets`.
4. Top N (visitor-set, 3–20, default 10) by count. Any tallied account
   discovered only through a mention (no inline author view) gets its
   handle/avatar filled in with one memoized `app.bsky.actor.getProfile` call
   per unique DID — deduped across both sides so a shared account isn't
   fetched twice.

The two top-N lists are then intersected by DID for the overlap.

## The Venn itself

Plain HTML/CSS, no SVG, no canvas. The diagram container has a fixed
`aspect-ratio` (680:380) so that percentage-based `left`/`top`/`width`/`height`
— computed against 680 for anything horizontal and 380 for anything vertical —
resolve to the *same* physical pixel scale on both axes at any render size,
which is what keeps the circles and avatar dots circular instead of stretched.
Avatar placement uses rejection sampling: pick a random point in the diagram's
bounding box, test it against both circles' actual radii, keep it if it's
in the region asked for (only-A / only-B / both), otherwise resample (400
tries, then a fixed fallback spot). Circle separation shifts a little with how
much overlap there actually is — more shared accounts pulls the circles closer
— but never goes to fully separate or fully merged, so it always reads as a
Venn diagram even when the overlap is small. "Shared" nodes get a white glow
ring; only-A/only-B nodes get a ring in their own circle's color — that's the
actual overlap emphasis, since faking a true two-color Venn *region* fill
without SVG boolean ops isn't worth the risk of getting it subtly wrong
unrendered.

## Decisions worth flagging

- **`getProfile`, not `getProfiles`.** The plural batch endpoint is on the
  allowlist, but `kit.bskyGet` builds its query string with
  `new URLSearchParams(params).toString()`, which does not repeat an array
  param as `actors=a&actors=b` — it stringifies the array with commas instead,
  which is the wrong wire format. Rather than reach around `kit.bskyGet` to
  build that request by hand, this calls singular `getProfile` once per
  unique DID, memoized so concurrent/duplicate lookups collapse to one
  request. Simpler and correct, at the cost of more requests than a working
  batch call would need.
- **Every network-sourced string (handle, displayName) is set via
  `.textContent`/DOM properties, never `innerHTML` string interpolation.** A
  Bluesky display name is attacker-controllable content by definition — it's
  whatever a stranger's mentioned account has set it to — so building markup
  by concatenating it in would be a real injection vector, not a theoretical
  one.
- **Avatar URLs are only used if they start with `https://`.** Belt-and-braces
  against anything else ending up in an `<img src>`; images loaded this way
  can't execute script regardless, but there's no reason to accept anything
  but a real Bluesky CDN URL.
- Handles are lowercased and stripped of a leading `@` before use; entering the
  same handle twice is rejected client-side before any network call.

## What's open / unverified

- **Never rendered.** No Bash/WebFetch/browser in this sandbox. Every field
  name (`item.reply.parent.author`, `post.embed.record.author`,
  `reason.$type`, `facet.features[].did`) is either confirmed directly against
  the checked-in fixtures or is a stable, long-documented part of the AT Proto
  lexicon, but the combination has not run against a live response.
  `getAuthorFeed.json`'s one example item is itself a `reasonRepost` case,
  which is what confirmed the repost-handling logic actually matches the real
  shape (`reason.by` is the queried actor, `post.author` is who got
  reposted) rather than being a guess.
- **No proportional-area Venn.** Circle separation nods toward the overlap
  ratio but this is not a true area-proportional (Euler) diagram — doing that
  correctly for two circles is solvable but adds real risk for a cosmetic
  gain, given this can't be checked visually before shipping.
- A future iteration could add mutual-follow counts (`getFollows`/
  `getFollowers`) as a second lens alongside interactions, or let a visitor
  click a shared account to re-run the comparison centered on it.
