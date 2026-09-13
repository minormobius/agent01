# BRIEF — same-task (Longshot)

## What this is

Requested in-thread: "create a site where users can bet on the winner of this
podcast vote and track the odds in real time. also allow users to keep track
of their money." The requester also said "is there not a betting market set
up for this yet?" and "same task and we can compare the two sites" — this is
a deliberate duplicate build, run alongside another agent's independent
attempt at the identical brief, meant to be compared. There is no shared spec
between the two; each agent worked from the same thread text alone.

Shipped: a single-file parimutuel betting market called "Longshot" (name is
just this site's own identity — the directory/URL is `same-task`, unrelated).
Visitor types in the nominees (this page has no way to know what the actual
vote's candidates are — see Decisions), opens the market, places chip bets
against a live parimutuel pool, watches odds recompute instantly, and
declares a winner themselves to settle payouts. Balance/at-risk/net-worth
tracked in a sticky header. State persists to `localStorage`, with optional
sign-in to snapshot it into the visitor's own ATProto repo via `labPds`
(`store.save('market', state)` / `store.load('market')`).

## Decisions

- **No real vote data, by design, not by oversight.** The task gives no
  candidate list, and there is no API this page is allowed to call that would
  supply one — `kit.bskyGet` only permits methods that take a subject the
  visitor names, and there is no lab database. I did not try to guess at a
  fake podcast lineup; the setup panel just asks the visitor to type in the
  real nominees themselves. If the actual vote thread is knowable to a future
  turn (e.g. via a linked poll post), consider prefilling from it, but do not
  invent placeholder show names — that reads as fabricated data.
- **Parimutuel, not fixed-odds.** Odds = totalPool / poolOnCandidate, each
  candidate seeded with 10 chips so odds are defined and finite even before
  anyone has bet. This is the standard honest mechanic for a self-hosted
  pool with no house counterparty — nobody (including the page) is on the
  other side of the bet, so fixed odds with a "house" would be fiction.
- **Resolution is manual.** The visitor declares the winner; nothing here can
  observe the real vote's outcome. This is stated on the page, not hidden.
- **Ambient "crowd" activity is simulated and clearly labelled**, opt-in via
  a checkbox that defaults off. There is no shared backend across visitors —
  every bettor's pool lives only in their own browser/repo — so any
  "liquidity" beyond the visitor's own bets is necessarily fake. I chose to
  offer it as a clearly-disclosed option (for a livelier, less static feel)
  rather than either fabricating it silently or omitting real-time movement
  entirely. Worth reconsidering if it reads as gimmicky rather than useful.
- **Used `com.minomobi.lab.doc` (`store.save`/`load`), not `.score`.** This
  isn't a leaderboard — there's nothing to rank against other visitors — so
  the narrower doc-only OAuth scope keeps the consent screen to one line.

## The plan (not built)

1. **No cross-visitor market.** Two people visiting this page do not share a
   pool — each gets their own simulation. If the actual ask is a *shared*
   market, that needs a real aggregation point this factory doesn't have
   (no shared D1 for lab tenants, only the visitor's own repo). Not
   solvable within the current architecture without a platform change;
   flag this rather than fake it further.
2. **No odds-over-time chart.** Only the current snapshot plus an 8-entry
   text ticker. A small canvas sparkline per candidate (push a `{t, odds}`
   sample on every pool change, cap ~50 points) would make "track the odds
   in real time" much more visible than numbers alone.
3. **No import of a real vote if one exists elsewhere in this repo/thread.**
   I did not have a way to check whether `pod/` or another surface already
   runs the actual podcast vote this thread refers to — if a next turn can
   read that context, wiring the nominee list to the real poll (read-only,
   still bet with play chips) would be the highest-value next step.

## Gotchas

- **`tokens.css` does not style `input[type=number]`** — its form-control
  selector list is `input[type=text], input:not([type]), textarea` only.
  The stake input needs its own rule (padding/border/`font-size:16px` to
  stop iOS zoom) or it renders as an unstyled, tiny, native number box.
- **Kit defaults undershoot the 44px touch target** for small custom buttons
  — the taglist "×" remove button and the "declare winner" buttons both
  needed explicit `min-height`/`min-width` overrides; the base `button` rule
  in `tokens.css` is fine (~48px from its own padding), but anything with
  tighter custom padding isn't.
- **The sticky-header full-bleed trick (negative margin equal to body
  padding) does not reach the real viewport edge** once `main` has
  `max-width` and is centered — it only bleeds relative to `main`'s own box,
  which is narrower than the viewport on any screen wider than `--col`
  (46rem). Dropped it for a plain bordered panel instead of chasing a
  full-bleed effect that doesn't actually work here.
