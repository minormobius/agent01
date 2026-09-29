# want-pairwise — brief for the next agent

## What this is

The ask: "a pairwise interaction circle for bsky — enter two handles, get their
top n accounts for interaction, presented like a Venn, overlap emphasized."
This shipped as a single working page, titled **mutual** (the directory stays
`want-pairwise`, the on-page name is different — see Decisions).

Flow: two handle inputs (kit.handleInput typeahead) → `Compare` → the page
resolves both via `getProfile`, pulls each account's last 100 posts via
`getAuthorFeed`, scores everyone they repost/quote/reply-to/mention, and shows
the top N per side as three columns over two overlapping tinted circles: only-A,
both (visually emphasized — accent border on avatars, bold label), only-B.

## Decisions

- **No real interaction-graph endpoint exists**, and `searchPosts`/firehose are
  banned by the content gate for good reason (see `lab/_kit/README.md`). So
  "interaction" is a heuristic built entirely from the allowed
  `app.bsky.feed.getAuthorFeed` call on each handle's own recent posts:
  repost/quote of someone = 3, reply-to = 2, @-mention = 1, summed per DID,
  ranked. This is disclosed on the page ("How this reads interaction") rather
  than presented as ground truth — do not remove that disclosure, it is the
  honest framing that makes the heuristic defensible.
- **Reply target is read straight off the URI.** `at://<did>/<collection>/<rkey>`
  puts the DID right in the string, so `uri.slice(5).split('/')[0]` gets it with
  zero extra API calls. Cheap and correct; keep this pattern if extending.
- **DID resolution is capped at the top 25 candidates** before calling
  `getProfiles`, because that endpoint's `actors` param caps at 25 per call.
  Candidates are pre-sorted by weight first, so the cap only ever drops
  low-scoring accounts, never the ones that would have made the final top N.
- **Named the page "mutual", not "want-pairwise" or "Venn diagram tool".**
  "Venn" is a generic mathematical term (not a trademark issue either way), but
  a plain name reads better as a title. Directory name is fixed by the
  dispatch and left alone.
- **Titled with "circle" language rather than claiming a real metric** — the
  copy says "leans on", not "interacts most with", to avoid overclaiming
  precision the heuristic doesn't have.
- Did not build OAuth/pds.js persistence. There's nothing here worth saving to
  a visitor's repo — every run is a fresh two-handle lookup, not a state to
  keep. Skipped deliberately, not by oversight.

## The plan (not built yet, in order)

1. **Pagination.** `getAuthorFeed` is called once with `limit: 100` and no
   cursor. For very active accounts, 100 posts might undersample; for quiet
   ones it's already everything. If asked to improve accuracy, add a second
   page (cursor from the first response) before touching anything else — it's
   the single highest-leverage change.
2. **A visible per-signal breakdown.** Right now each chip just shows an
   avatar and handle; hovering/tapping doesn't reveal *why* someone ranked
   (repost vs. reply vs. mention). A tooltip or small badge showing the mix
   would make the ranking legible. The `weight` number is already tracked per
   entry in `interactionsFor`; only the per-kind breakdown isn't (I only kept
   the summed weight, not counts by kind — you'd need to track that
   separately if you want it).
3. **Handle the "quiet account" case explicitly.** If an account's last 100
   posts have zero reposts/quotes/replies/mentions of anyone (pure
   original-post accounts do exist), all three columns render "none" — this
   works today but has not been seen against a real example, only reasoned
   through.

## Gotchas

- **Never leave an `<img>` `src` empty — omit the attribute instead.** The
  first build had `<img src="">` for the two avatar placeholders (present in
  the initial HTML, inside the `hidden` `.venn` div) and set `img.src = entry.avatar
  || ''` when rendering chips for an account with no avatar. An empty `src`
  resolves against `location.href`, so the browser re-requests the *page
  itself* as an image — that's the "resource failed to load `http://.../`"
  the harness's real-browser smoke test caught (a `hidden` ancestor does not
  stop the image fetch). Fixed with a `setAvatarSrc(img, url)` helper that
  calls `removeAttribute('src')` when there's no URL; use it for any future
  avatar/image binding here.
- `kit.bskyGet`'s query-string builder (`new URLSearchParams(params)`) does
  **not** handle array-valued params the way `getProfiles`'s `actors[]` needs
  (repeated keys, not a comma-joined single value). Bypassed by building that
  one query string by hand and calling `kit.fetchJson` directly — still hits
  the same allowed host, still references the literal allowed method string,
  so the content gate is happy. If you add another array-param call, you'll
  need the same workaround.
- Never had a browser to actually load this in — reasoned entirely from the
  fixtures in `lab/_kit/fixtures/` and the kit's own source. The harness's
  post-build screenshot confirmed the Venn layout and chip wrapping hold up at
  typical widths; it also caught the empty-`src` bug above, which fixtures and
  code review both missed.
