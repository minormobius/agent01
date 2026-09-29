# domain-availability — BRIEF

## What this is

The ask was a domain-availability checker: type a name, check it's free, pull
in public info about it, across a wide variety of TLDs. What shipped is
**Landrush** — type a name (no dots), it's laid out against ~90 domain
endings, each with a real curated fact (who runs it, what it's typically
used for) and a general "usually crowded / usually roomier" demand read.
Filterable by kind of ending (classic, country-code, repurposed cc, restricted,
new gTLD), sortable, with a copy-list button for the resulting candidate list.

**What it deliberately does not do: check whether anything is actually free.**
That's the load-bearing decision in this build, not an oversight — see below.

## Decisions

**No live check, and no guessed outbound links either.** `lab/www/worker.js`'s
CSP sends `connect-src` naming only `public.api.bsky.app`, `plc.directory`,
`auth.mino.mobi` and `*.host.bsky.network` — nothing that could reach a
registry, a registrar, or a WHOIS server. A page can't fetch real availability
from inside this sandbox, full stop; widening that is a human decision on
shared infrastructure, not something a tenant build can route around.

I also chose **not** to link out to registrar/WHOIS sites by URL (e.g.
`whois.com/whois/<domain>`, a Namecheap search results URL) even though plain
`<a href>` navigation isn't blocked by `connect-src`. I wasn't confident
those exact URL patterns are current and correct, and shipping a guessed URL
that 404s or redirects somewhere unexpected is worse than not offering the
shortcut — the operating instructions for this build are explicit that URLs
should not be guessed. So the page tells the visitor plainly to take the
shortlist to "a registrar of your choice" rather than picking one for them.

**The facts and demand tiers are curated, not fetched or measured.** They're
general, hedged claims (registry operator, typical use, "usually crowded" as
a *category-level* reputation) rather than anything claimed to be current
pricing or a live signal about the specific name typed. The footer says this
explicitly rather than letting the page imply more precision than it has.

**No Bluesky/OAuth features at all.** This tool has no natural use for a
visitor's identity or their ATProto repo — there's nothing to save, no
leaderboard that makes sense — so `pds.js`/`handleInput` are unused on
purpose, not forgotten. The input is a domain label, not a handle.

## The plan — what's not built yet, in order

1. **A real availability signal, if a human ever vendors a path to one.**
   The honest way to make this a *checker* rather than a *reference* would be
   a same-origin proxy this domain controls — e.g. a small Worker route (like
   `/_img/` for avatars) that does `dns.google`-style DNS-over-HTTPS lookups
   or RDAP queries server-side and returns bounded JSON, added to
   `connect-src` for `minomobi.com` itself (already `'self'`). That's a
   `lab/www/worker.js` change, which is out of a tenant's reach and a real
   scope/abuse decision (rate limits, which RDAP/DoH host to trust) — flagging
   it here rather than attempting a workaround from inside the tenant
   directory.
2. **IDN / punycode input.** Right now the name validator only accepts
   ASCII letters/digits/hyphens. A name with non-ASCII characters should
   either punycode-encode client-side (no network needed, this is pure string
   processing — `punycode.js`-equivalent logic could be hand-written, it's not
   large) or clearly say it doesn't support that yet. Currently it just
   silently rejects via the existing regex with a slightly wrong error
   message ("only letters, digits and hyphens") — worth a friendlier message
   at minimum before the encoder exists.
3. **More endings.** ~90 is wide but not exhaustive (there are 1,500+ gTLDs
   today). Easy to extend the `TLDS` array; the hard part was picking ones
   worth a real, accurate one-line fact rather than padding the count with
   unverified claims.
4. **A "similar available-sounding names" generator** (prefixes/suffixes,
   synonyms) was considered and cut for scope — it would have been the more
   "fun" feature but doesn't fix the core gap (still can't check anything),
   and time went to getting the curated facts right instead.

## Gotchas

- The system prompt for this build explicitly says never to guess URLs
  unless confident they're correct — that's *why* there are no outbound
  registrar links, not a CSP restriction (top-level navigation isn't governed
  by `connect-src` at all; a plain `<a href>` to an external registrar would
  have rendered and worked as a link either way).
- `lab-content-gate.mjs` only *warns* (doesn't fail) on a `fetch`/`fetchJson`
  call to a host outside its `CSP_CONNECT` list — it won't catch a live-check
  attempt at build time. The runtime CSP in `worker.js` is what actually blocks
  it, silently, in the visitor's browser. Don't rely on the gate's silence as
  proof a network call would work.
- No `kit.handleInput` here on purpose — it's for Bluesky handles specifically
  and this page's text input is a bare domain label, a different shape of
  input entirely.
