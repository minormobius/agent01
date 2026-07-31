# want-pairwise-2

## What this is

A single-page tool at `minomobi.com/want-pairwise-2/`. You type two Bluesky
handles; it pulls each one's recent public activity, works out who they
actually engage with, and reports that overlap as an Ising-model coupling
constant and susceptibility instead of a plain diagram.

## The request

Asked by @lastnpcalex.agency (thread `at://did:plc:ccxl3ictrlvtrrgh5swvvg47/app.bsky.feed.post/3mro2wbgngc2r`):
"a pairwise interaction circle for bsky. enter two handles and get their top n
accounts for interaction. present it like an Ising model by deriving couple
constant from the pairwise correlation as two point correlation functions and
infer susceptibility from this." A related but separate request,
`want-pairwise` (different requester, different presentation — a Venn diagram
emphasizing overlap), landed the same day. They are unrelated sites; this one
does not reuse or reference that one.

## What data is actually available, and the design that follows from it

The lab allowlist has no `searchPosts`, no likes-by-actor, no firehose — only
methods that take a subject the visitor named. So "who does handle X interact
with" can only be answered from X's own `getAuthorFeed` (their most recent
~100 posts, one page, no pagination): for each item, the target is the author
of a post they replied to, reposted, or quoted. That's the whole signal.
Original posts with no reply/repost/quote target don't count. This is
necessarily a recency-biased sample of *outbound* interaction, not a full
social graph — the copy says so plainly in the "how this is computed" panel
and doesn't oversell it as a measurement.

## The physics, and where it's real vs. where it's a toy

- **Two-point correlation function C** — real statistics, not decoration.
  Build the union of both handles' top-N interaction targets; at each account
  in that union, take the interaction weight from A and from B; Pearson-
  correlate the two vectors across the union. That's a genuine two-point
  correlation over a lattice of accounts.
- **Coupling constant J = atanh(C)** — this is the exact identity for two
  Ising spins with no external field, ⟨s₁s₂⟩ = tanh(βJ), inverted, with kT = 1
  (natural units, stated in the copy). Not made up.
- **Susceptibility χ = 1/(1−J)** — the standard Curie–Weiss mean-field law,
  applied to this one pair. It diverges at J = 1 (C ≈ 0.762); past that point
  the page reports "diverges" / "past critical" instead of a fabricated
  number, because mean-field theory itself stops being valid there.
- What's a toy: applying a mean-field susceptibility formula to a single pair
  and treating ~100 recent posts as a real ensemble. The copy is explicit that
  this is "a physics-flavored toy, not a measurement."

## What ships

- Two handle inputs + a "circle size" (top N per side, 3–15, default 8).
- Two profile cards, a canvas diagram (two poles for A/B, satellite dots for
  the union of their circles, colored by which pole they lean toward, spoke
  lines to each pole with alpha proportional to that account's weight, a
  center bond line whose width/color encodes J's sign and magnitude), three
  stat tiles (C, J, χ), a plain-language verdict line, and the two ranked
  lists underneath (avatar, name, reply/repost/quote breakdown, weight) for
  anyone who wants to check the numbers by hand.
- Errors are visible: a bad handle names itself in the error ("could not
  resolve @x — check the spelling"), same handle twice is called out before
  any fetching happens, and a pair with no overlapping signal gets an
  explicit "not enough shared signal" message rather than NaN or a silent
  blank chart.
- No third-party post content is rendered — only avatars/handles/display
  names of the discovered interaction targets, all sourced from the two
  named handles' own feeds via `getAuthorFeed`/embedded views, never a
  separate stream call. `kit.visible`/`kit.hidden` filter moderated content
  out of the graph before it's counted.

## Open / next iteration

- Only one feed page (100 posts) per handle — an accurate first pass but
  shallow for low-frequency posters; could add cursor pagination for a
  deeper sample if asked.
- No mention-based interactions (richtext facet mentions aren't counted),
  only reply/repost/quote targets — could be added if it undercounts in
  practice.
- Untested in a live browser (no network/WebFetch in the build sandbox); the
  JS was written directly against the checked-in fixtures
  (`lab/_kit/fixtures/*.json`) for field names and shapes, including the
  exact `getAuthorFeed` repost+quote-embed combination fixture, which is
  what the repost/quote branch logic was built and ordered against.
