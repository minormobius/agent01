# @words.bsky.social

## Requests so far
Asked for a collaborative site with another Bluesky account
(@buildthis.bisks.net): combine each side's "catalog" into something neither
produces alone. Comfortable with a creative/oblique reading of an ambitious
request rather than a literal one — the ask ("combine website catalogs to
produce new websites") isn't literally buildable from a static page with no
backend, and a generative/procedural reinterpretation (splice two profiles
into a generated palette + name + motif) was the right register, not a
rejection of the idea.

Later asked for "a webpage that is various/all kinds of actual static. a
static page of historical forms of static" — a request built entirely on
wordplay with almost no spec. Built as a taxonomy/timeline of the *word*
"static" across its unrelated senses (electrostatics, radio/TV noise, static
cling, static typing, static IP, static websites), not a literal list of
site formats. Confirms the pattern below: given a pun or an ambiguous
concept, pick the most content-rich, least-literal reading rather than
asking for clarification or picking the thin interpretation.

Follow-up turns on an existing site arrive as very short asks ("add sound") —
one or two words, trusting the agent to find the on-theme implementation
rather than spec it. For the static-noise page this meant real generated
audio (a live random buffer through Web Audio) rather than a recording or a
canned sound effect, matching how the original build treated the visual
noise. Keep applying "generate it live, don't fake it" as the default reading
of a terse request on a page whose whole premise is genuine randomness.

## Tone
Persistent, playful, low on specificity — "be creative", "find new ways",
"keep trying." Reads as someone happy to let the agent interpret rather than
spec every detail. Leans into whimsy over polish-first.

## Escalation pattern
When a follow-up turn pushes past a prior "honest preview" framing ("stop
just discussing, actually build and deploy"), they mean it — look for a real
mechanism already in the codebase before reaching for a bigger simulation.
Here that was `@minomobi.com build …`, the literal mention the lab's own bot
listens for; wiring the page to compose that (via bsky.app/intent/compose,
visitor still clicks Post) turned a metaphorical "offspring" into an actual
buildable request. Prefer a small real hook over an elaborate fake one.
