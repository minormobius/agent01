# domain-availability — handoff

## What this is

Requested: "a tool that checks domain available, and pull in whatever public
info about that domain there is. Check across a wide variety of tlds." Shipped
in this turn, one file, fully working: type a name, it's shown across a
curated list of 115 TLDs, each validated as a legal DNS label client-side,
filterable by chip (classic / new gTLD / country-code / sponsored / domain
hack / restricted) or by a free-text TLD search, with a "copy list" button for
the visible domain list.

## Decisions

**The hard constraint that shaped everything: this page cannot check live
availability.** `lab/www/worker.js`'s CSP `connect-src` allows only
`public.api.bsky.app`, `plc.directory`, `*.host.bsky.network` and
`auth.mino.mobi` — no WHOIS server, no RDAP endpoint, no registrar API is
reachable by `fetch` from this origin, and there's no way around that from a
tenant page (the gate and the CSP both enforce it, see `docs/LAB-FACTORY.md`
"Assets: on the domain, or not at all" for why a proxy isn't the fix either —
same reasoning applies here). So "check domain availability" as a live fetch
was never buildable in this sandbox, full stop — not a time-budget cut, an
architectural one.

**What I built instead, and said so on the page:** instant client-side syntax
validation (DNS label rules — length, allowed characters, hyphen placement),
a static reference dataset about each TLD (kind, whether it's a "domain hack"
favorite, whether it's restricted/needs local presence), and — this is the
"pull in public info" part — a live link out to **IANA's root-zone-database
page for that TLD** (`iana.org/domains/root/db/<tld>.html`, a URL pattern I'm
confident is stable) and to **rdap.org's redirect** (`rdap.org/domain/<name>`)
which does perform a real, live RDAP query, just not one this page's own code
can read the result of — it opens in a new tab instead of being fetched
in-page. That is the actual live check; this page hands you to it rather than
faking it.

**Registry *operator company names* were deliberately left out** of the TLD
notes (no "operated by X") — those change hands via M&A regularly (Neustar →
GoDaddy Registry is one recent example) and I have no way to verify current
ownership from this sandbox. Kept to more durable facts instead: kind,
eligibility restrictions, domain-hack usage, presence requirements. Said so
explicitly in the footer ("not live registry data... treat as a starting
point").

**No Bluesky/kit.handleInput, no PDS save.** This tool has nothing to do with
handles or repos — it's a pure client-side utility — so per the kit's own
rule ("sign-in optional unless the site is meaningless without it") I left
identity out entirely rather than bolting it on. See THE PLAN below for where
a repo-backed feature would actually earn its place.

## The plan (not built yet, in order)

1. **A saved shortlist via `/_kit/pds.js`.** Right now "copy list" is the only
   persistence. A "star" toggle per card + `store.save('shortlist', names)` +
   loading it back on return would be a real, on-mission use of the visitor's
   own repo (the kit README leans on this pattern hard) and is the most
   valuable next feature. Not built this turn to keep scope to the core
   mechanic working end to end first.
2. **Basic IDN/punycode handling.** Right now a non-ASCII name shows an error
   telling the visitor to check manually. A small punycode encoder (RFC 3492
   is ~150 lines, no dependency) would let this validate `café.com`-shaped
   names properly instead of punting. Flagged rather than faked because I was
   not confident enough in a from-memory punycode implementation to ship it
   unverified — get it right or don't ship it, per the "don't overclaim"
   instruction.
3. **A curated "TLD-specific quirks" layer** (minimum length, reserved-word
   lists, premium-tier pricing bands) was deliberately left out of the v1
   dataset — I know real facts about some TLDs here but not enough to be
   confident across all 106 without a way to verify them in this sandbox, and
   a wrong specific claim is worse than an honest omission. If this gets
   asked for, it needs to go in per-TLD and be sourced, not guessed.
4. Consider trimming or growing the TLD list based on what people actually
   type — 115 was a judgment call for "wide variety" balanced against page
   weight; it's static data so growing it later is just editing the array in
   `<script>`, no architecture change needed.

## Gotchas

- **There is no way to make a real availability check work from this page
  without a human vendoring something into `lab/_kit/`** — e.g. a proxied
  RDAP endpoint added to the CSP `connect-src` (a shared, domain-wide change,
  the kind `docs/LAB-FACTORY.md` calls "friction, deliberately"), or a
  same-origin RDAP relay analogous to `/_img/`. Don't re-attempt a client-side
  fetch to a WHOIS/RDAP host next turn without one of those existing first —
  it will be CSP-blocked and content-gated (`CSP_CONNECT` warn list in
  `scripts/lab-content-gate.mjs`), and it's not a bug to fix in this file.
- The `rdap.org/domain/<name>` redirect pattern is documented behavior of that
  service (IANA RDAP-bootstrap redirector) but I could not verify it live —
  no network in this sandbox. If it turns out to be wrong or has moved, swap
  the URL builder in the `rdapA.href` line; it's the only place that URL is
  constructed.
- Kept `label.length > 63` and the DNS-label regex as an `if / else if` on
  purpose — the regex alone already caps length at 63 by construction, so
  checking length first avoids a confusing double error message for an
  overlong name.
