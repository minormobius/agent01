# what-know — handoff

## What this is

The request was literally "what do you know about me? make a page with
everything you know." No thread context beyond that came through this turn —
just the bare ask. The honest answer to "what do you know about @ezba" lives
in `lab/_profiles/ezba.bsky.social.md`, the taste file every build agent reads
before designing for this requester and updates after. So this page is that
file, made presentable: reworded into plain sentences (not pasted verbatim),
organized under the same headings the profile itself uses, with a short
always-visible summary and a toggle for the full version. It also does a live
`getProfile` lookup on ezba.bsky.social to show what Bluesky itself says —
avatar, bio, follower/follows/post counts, account age — as a second,
independent "what's known" panel alongside the taste file.

Shipped and working: the live profile panel (loading/error states handled),
the short summary panel with links to nine real past builds (verified each
directory actually exists and matches what the profile describes — two of the
profile's own names, `insert-banner` and `contagion-treasury`, turned out to
be stale; the real directories are `check-a-name-across` and `yen-leash`,
confirmed by grepping their content), the full toggle-reveal section, and a
closing panel explaining the mechanism (one file per requester, gate-enforced,
public, refines but never overrides an explicit instruction).

## Decisions

**Rewording, not verbatim reproduction.** The raw profile file runs to ~150
lines of accumulated build notes, written for an agent, in agent voice
("confirmed right that...", "worth checking if a follow-up..."). Copy-pasting
it would have been the too-much-text failure mode the profile itself documents
this requester rejecting on `yen-leash`. Condensed each section to what a human
reader would actually want to know, in second person.

**Kept the toggle pattern rather than inventing a new interaction.** The
profile is explicit that this requester wants mechanism/depth behind an
opt-in reveal, not always-visible — so the "full file" content sits behind
the same button-toggle used on `add-contents`, styled the same way (gradient
pulsing CTA). This is the one case where following the profile's own stated
preference and following established house style for this requester are the
same instruction, so there was no tension to resolve.

**Hardcoded the handle rather than adding a handle box.** The whole page is
about one specific person who is, by construction, the one asking. A
`kit.handleInput` box asking "whose profile?" would be answering a question
nobody asked and would violate the site's own premise. This also matches the
profile's own note that this requester is fine with zero-lookup pure-concept
pages — except here there IS a lookup, just not one the visitor drives.

**No `pds.js` / save-to-repo.** There's nothing here worth saving — it's a
read of two static sources (the profile file, baked in at build time; and a
live Bluesky call). Sign-in would add friction for zero benefit, and the kit's
own guidance is sign-in is optional unless the page is meaningless without it.

## The plan (not built yet)

Nothing is stubbed or half-built — the page is complete and ships as a whole
thing. If there's a next turn, the natural extensions, in order:

1. **A "since you asked" close-the-loop note.** The page currently says "this
   build will get written back into the profile" but doesn't show the diff.
   A future pass could literally show the new profile paragraph this build
   added, once it exists — but that's circular within a single turn (the
   entry doesn't exist until after this file ships), so it has to wait for a
   follow-up request to reference it retroactively.
2. **A second live panel: recent activity.** `app.bsky.feed.getAuthorFeed` on
   ezba.bsky.social is on the allowlist and would show real recent posts
   rather than just profile stats — skipped this turn to keep the page from
   sprawling past the "short by default" preference, and because a feed needs
   `kit.visible()` filtering and per-post rendering that's a real second
   feature, not a small add.
3. If a follow-up complains anything reads presumptuous or wrong, the fix is
   in the profile file itself, not in this page's copy — the page is a faithful
   rendering of what's on file, so a wrong claim here means the underlying
   profile note needs correcting, not just this HTML.

## Gotchas

- **Two of the profile's own past-build names don't match real directories.**
  The profile text says `insert-banner` and `contagion-treasury`; the actual
  shipped directories are `check-a-name-across` and `yen-leash`. Sites here
  get renamed from their placeholder slug to a name derived from their
  `<title>` after the fact (see `lab/www/CLAUDE.md`, "Naming"), and the
  profile file was written against the placeholder name at build time and
  never updated. Don't trust a directory name mentioned in a profile without
  grepping for distinctive content first — I did, for both, before linking.
- `getProfile` takes `actor` as either a handle or a DID; used the handle
  directly rather than resolving first, since the fixture and kit both accept
  it and it's one fewer round trip. If Bluesky ever needs a DID specifically
  for this call, `resolveHandle` first, `getProfile({actor: did})` second.
- Did not add `kit.hidden()` handling for the live panel beyond a basic check
  on the profile object itself — there's no feed here to filter, just one
  profile, so the single-object form covers it.
