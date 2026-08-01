# plese — handoff

## What this is

The requester (thegodfungi) put weight behind minormobius's ask: `@minomobi.com
domain availability. Can you build a tool that checks domain available, and
pull in whatever public info about that domain there is. Check across a wide
variety of tlds.` — `lab/www/domain-availability/` already exists and answers
that brief straight (read it, it's good). Rather than ship a near-duplicate of
that file under a second name, this turn built the same core mechanic — type a
name, see it validated across 100+ TLDs, jump out to IANA/RDAP — but pushed on
the two things that build's own BRIEF.md flagged as unbuilt: real punycode/IDN
encoding, and a shortlist backed by the visitor's own repo. Shipped, working,
one file: `lab/www/plese/index.html`.

## Decisions

**Punycode is a real RFC 3492 implementation, not a stub.** The sibling site
punted on non-ASCII names with an error telling the visitor to check manually,
flagged explicitly as "not confident enough to ship unverified." I wrote the
encoder (verified by hand against a known case — `café` → `xn--caf-dma`,
matches) because getting IDN right is the actual hard part of a domain tool,
and skipping it twice would be the wrong call now that it's tractable. It only
encodes; it does not validate IDNA2008 bidi/script-mixing rules, and the page
says so in the footer rather than overclaiming.

**Same architectural ceiling as the sibling site, same honest framing.** This
page still cannot fetch live WHOIS/RDAP — `connect-src` only reaches
`public.api.bsky.app` and `plc.directory` — so it does the same thing: instant
client-side validation plus links out to the real sources. Did not re-litigate
that constraint; see the sibling's BRIEF.md "Gotchas" for why a proxy isn't the
fix.

**The shortlist is the actual differentiator.** A star toggle per card,
persisted to `localStorage` immediately (works signed-out), and pushed to the
visitor's own repo via `labPds().save('shortlist', {domains})` if they sign in
— exactly the feature the sibling site's plan named as "the most valuable next
feature" and didn't build. Sign-in is optional and off by default, per the
kit's own rule.

**Reused the sibling's TLD reference table shape** (kind/flags/note per
ending) because the facts about TLDs are just facts, not expression worth
reinventing — but trimmed registry-operator-company claims for the same reason
the original did: they change hands and I can't verify current ownership from
this sandbox.

## The plan (not built yet, in order)

1. **IDNA2008 script-mixing / bidi checks.** The encoder is correct but naive
   — it will happily punycode a label mixing Latin and Cyrillic look-alikes,
   which is exactly a phishing-adjacent domain shape. A real implementation
   needs Unicode script tables; flag it rather than fake it if picked up.
2. **A "compare to sibling" link is deliberately absent.** Don't add a link
   between `/plese/` and `/domain-availability/` unless asked — that reads as
   the page editorializing about its own duplication, which isn't the page's
   place to do.
3. Growing the TLD list is just editing the array; no architecture change.

## Gotchas

- **`.idn-note`/`.hidden` class collision**: this file's first draft used
  `class="idn-note hidden"` and toggled the `hidden` *property* in JS. Both a
  class named `hidden` (from `tokens.css`, `display:none`) and the `hidden`
  *attribute* apply `display:none`, but they're independent — clearing the
  attribute does not remove the class, so the element stayed invisible.
  Fixed by dropping the class and using the bare `hidden` attribute only. If
  you add another conditionally-shown element, don't repeat this — either use
  `kit.showError`/`kit.clear` (which fully replace `className`) or the bare
  `hidden` attribute, never both a `.hidden` class and the attribute together.
- **The `starred` filter chip**: `matchesChip()` must return `true` for it (the
  actual narrowing happens afterward, by checking `starred.has(domain)` per
  TLD) — an early version returned `false` there and silently emptied the grid
  whenever the chip was active. Any new chip that isn't a `kind`/`flag` needs
  the same treatment.
- Stray leftover closing tags (`</main></content>`) ended up at the end of the
  file on the first write — an artifact of the write itself, not a logic bug —
  and were removed. Worth a glance if this file is ever regenerated wholesale
  rather than edited.
