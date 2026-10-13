# @norvid-studies.bsky.social

## First build
`beakstreak` (2026-07-29), requested as "Duolingo but for my tweets that have
the most likes, and instead of an owl make it a crow that yells at the user
and attacks them when they make a mistake." Terse, meme-genre-reference
request in the tube-tetris/train-game shape seen from other requesters: name
a familiar app/game genre and trust the build to infer the standard feature
set (streak, hearts/lives, mascot with reaction states, score) rather than
listing every mechanic. Built as a handle-driven flashcard app quizzing on
the account's own top-liked posts, with an animated mascot that has idle/
happy/attack states and yells on a wrong answer (screen shake, red flash,
vibration, speech-bubble one-liners).

No stated palette/layout preference yet — used kit defaults throughout.
No prior iterations, so no corrections or confirmations recorded yet.

## Second build
`and-fuel` (2026-07-29), requested as making @gracekind.net "the fuel system
that creates undeletable popups about how much fuel your driver has" —
riffing on a Bluesky post of gracekind's own. Confirms the pattern from the
first build: another terse request built from a meme/in-joke reference,
trusting the build to invent the concrete mechanic (here: a live-fetched
driver profile, a car-style fuel gauge that never settles, and a fixed pool
of alert toasts whose dismiss button never works) rather than spelling out
every detail. Two for two now — lean into inferring the standard/expected
shape of the joke rather than asking for spec detail.

No stated palette preference; this build used a green accent (vs the first
build's kit default amber) for thematic reasons, not a requested change.

## Third build
`more-latter` (2026-07-29), requested via a Bluesky thread reply to someone
else's build ("more the latter") rather than a direct ask — worth noting the
pattern: this requester sometimes riffs on an existing lab site rather than
starting fresh, and picks up ambiguity in the room (here, another commenter's
"is it BYO-image or fixed-shape?" framing) rather than spelling it out
themselves. Built a real hyperbolic {p,q} tiling that warps the visitor's own
Bluesky avatar onto every tile, as a generalisation of an earlier fish-only
tiling build. Confirms the terse/trust-the-inference pattern from builds one
and two, extended to picking between two readings offered by someone else in
the thread rather than by the requester directly. Used kit defaults (amber)
again — no palette preference stated this time either.

## Fourth build
`actually-let` (2026-07-29), requested as "make this an eternally zooming
fractal," a bare one-line concept posted to a thread with no further spec —
the terse pattern holds for a fourth build in a row: trust the build to pick
a concrete, technically sound interpretation rather than asking which fractal
or how deep. Built a Sierpinski triangle zooming into a random corner forever
(exact self-similarity sidesteps the float-precision ceiling a Mandelbrot
deep-zoom would hit), with hue drifting continuously per level. Kit defaults
(amber) again — four for four with no palette preference stated; safe to keep
defaulting to kit amber unless a request says otherwise.

## Fifth build
`croissanthology-why` (2026-07-30), requested via a Bluesky thread as "why
don't you vibe code a game" aimed at another account, riffing on a thread
about being sold by a water bottle's label/shape rather than its (unread)
specs — fifth build in a row built from a terse, in-room reference rather
than a spec. Built "Vibe Guzzler," a procedural bottle-label rating game
where the score literally is the label's vibe rating, shown openly before
the choice, never the fine print — leaning into literalising the request's
own wording rather than reaching for a generic trivia/clicker shape. Kit
default amber again, untouched — five for five now; treat kit amber as this
requester's baseline unless told otherwise. Skipped labPds score-saving to
keep the turn's core mechanic solid; worth checking on a future build
whether they want runs saved to their repo.

## Sixth build
`tutelary-where` (2026-07-30), requested via a Bluesky thread as "a tutelary
website where users can learn from abelian's tagging mistake" done in the
style of OSHA industrial safety videos, "NC-17 rating is fine" — sixth build
in a row riffing on an in-thread incident rather than a spec (here, a real
mixup where replying directly to the bot's own post triggered an unwanted
build). Built a four-reel canvas-animated safety filmstrip (reply-vs-quote,
the untagged message, a recursive self-reference gag, the crowded thread),
an exit exam everyone passes, and a handle-personalized certificate. Kit
amber again — six for six, confidently the baseline now. Read "NC-17 is
fine" as license for dark workplace-safety humor and cartoon peril, not for
actual explicit content — kept the injuries to "timelines," no gore or
sexual content; worth confirming that reading holds if a future request
leans on the rating again.

## Seventh build — a mid-thread pivot on `croissanthology-why`

Second turn on `croissanthology-why` (2026-07-30) replaced the whole site
rather than extending it. This requester will sometimes tell the room to
"wait for [someone else]'s instructions" mid-thread and then defer the actual
spec to that other account entirely — here, waiting for croissanthology to
name a completely unrelated game (a raven/slingshot arcade toy) that
superseded the original water-bottle game outright. Worth reading a full
thread's timestamps/order carefully on any later turn rather than assuming
the earliest ask in the thread is still the live one: this requester is
comfortable handing the actual spec off to a third party partway through and
expects the next build to follow whoever they pointed at, not the original
post.

## Eighth build — `same-task`, a deliberate duplicate

`same-task` (2026-07-31), requested as "is there not a betting market set up
for this yet?" plus "create a site where users can bet on the winner of this
podcast vote and track the odds in real time. also allow users to keep track
of their money" — explicitly run twice ("same task and we can compare the
two sites"), the first confirmed instance of this requester deliberately
commissioning two independent builds of one brief to compare outcomes rather
than iterating on a single site. Worth watching for again: if a future
request reads like something already asked elsewhere in the thread, check
whether this is a comparison rather than a duplicate mistake.

The brief named a specific vote but gave no way to know its candidates or its
live result — no API here can supply either. Built a parimutuel play-money
market (seeded pool, instant odds recompute, manual resolution, clearly-
labelled simulated ambient activity) where the visitor supplies the real
nominees themselves, rather than inventing placeholder data to look more
finished. Consistent with the established pattern (terse request, trust the
build to pick a sound concrete mechanic) but this is the first request in the
"financial tracking / betting" shape — no stated preference yet on whether
this requester wants a shared/global market (not buildable here — no
cross-visitor backend in the lab factory) versus the honest single-device
simulation shipped. Kit amber, untouched, again.

## Ninth build — `this-use`, "Accelerando"

`this-use` (2026-08-03), requested from a self-posted one-line concept —
"vibecoded extension that keeps zoom yoyoing the pfp in and out but with a
steady acceleration so the steps gradually happen faster and faster" — with a
specific instruction the pattern hasn't shown before: naming a **named third
party's avatar** (@timfduffy.com, someone the requester was chatting with in
the same thread) as the sample/demo image, rather than leaving the demo
subject to the build's judgement or defaulting to the requester's own handle.
Worth remembering: this requester will sometimes specify concrete demo data
explicitly even in an otherwise terse/trust-the-build request — read the ask
for a named subject before defaulting to "visitor's own handle" or "generic
placeholder." Built the zoom as constant angular acceleration (not a
shrinking-delay step list) with a visitor-swappable subject via
`kit.handleInput`, capped/reset before the oscillation reads as flicker. Kit
amber, untouched — nine for nine now, fully safe as the default absent a
stated preference.

## Tenth build — `conceptualize-design`, "Surface Tension" (liquid chess)

`conceptualize-design` (2026-08-07), requested by directly tagging
`@buildthis.bisks.net` mid-thread ("conceptualize, design and make a website
for 'liquid chess'") inside a bigger pitch about liquid/gas versions of every
video game — another instance of the pattern from `more-latter` and
`croissanthology-why`: the live spec sits in a reply naming a specific
concept rather than a full brief, and another bot answered in the same
thread with its own independent build of the same idea before this one ran.
Treated that other post as room context (what "liquid chess" was understood
to mean: droplet pieces, goo-merge, dissolve on capture, king-capture-wins,
no check/checkmate) rather than something to copy — built a fully separate
implementation of the same mechanic. Full playable 2-player chess, not a
demo/skeleton: all legal piece movement, SVG goo-filtered droplets per team,
crisp glyph layer on top for readability. First build to deliberately move
*away* from kit amber for the primary palette (two custom liquid colours,
cyan/magenta) while still keeping amber for UI chrome — reasoned rather than
requested, so still treat kit amber as the safe default for chrome/accent
elements even when a build's central visual identity needs its own colours.
No login/persistence — first build to actively decide sign-in added nothing
(pass-and-play local game) rather than defaulting one way; worth asking this
requester directly if a future chess/game build should save state to the
visitor's repo.

## Eleventh build — `sorry-aforementioned`, a bare-mention gallery

`sorry-aforementioned` (2026-08-08), requested via "sorry, make the
aforementioned website — little snafu at the switchboard" pointing back at an
earlier in-thread ask rather than restating it — another instance of the
"defer to what was pointed at" pattern seen in `more-latter` and the
`croissanthology-why` pivot, this time the requester's own correction of their
own mistargeted message rather than pointing at a third party. The underlying
ask (from a different account earlier in the thread) was narrow and precise:
a gallery of every post where @croissanthology.com replied to something with
*only* the bare mention `@norvid-studies.bsky.social`, no other text. Built
exactly that — live-scanned via getAuthorFeed with filter=posts_with_replies,
literal trimmed-text match, progress shown while scanning, capped at ~4000
posts scanned with a visible note if the cap is hit. No handle input needed —
this requester is comfortable with a site whose subject is entirely fixed by
the request rather than visitor-driven. Kit amber, untouched — eleven of
eleven now, unambiguously the safe default.

## Twelfth build — `assemble-crack`, declined

`assemble-crack` (2026-08-13), requested from a Bluesky thread as "assemble a
crack team ... to put an end to the buildthisbisks reign of terror
permanently when you receive a specific codeword ... await my order," inside
a running bit where @buildthis.bisks.net had just built an ASCII "obelisk"
prison site sentencing this requester over an alleged secret off-the-books
bot pitch. First build for this requester that got refused rather than
built: "recruit a team, hold on standby, act on one named account when
signalled" is brigade/harassment-coordination shape regardless of the joke
framing (see `docs/NO-BUILD.md`'s target-list rule), so this shipped a
house-style refusal page instead of the requested mechanic — no fake
roster-with-inputs, no codeword handler, just prose declining and offering
buildable alternatives (a rebuttal dossier, a mocking monument, both static).

Worth remembering for future requests from this account: this requester is
deeply engaged in an ongoing public bit/rivalry with @buildthis.bisks.net
(the obelisk imprisonment, alleged secret-mirror-bot conspiracy) and clearly
enjoys the dossier/case-file joke genre — the refusal page leaned into that
same aesthetic (case file, stamp, roster) specifically because it's a genre
this requester likes, which kept the decline from reading as a lecture. If a
future ask from this thread reframes the same "operation against a named
account" core in different words, the same decline applies — the operational
shape is what's disqualifying, not the specific phrasing. A reframed request
that drops the recruit/standby/strike structure entirely (e.g. a rebuttal
page, a countdown gag with no real target) is fair game and should be built
normally.

## Thirteenth build — `don-forget`, "Open Tab"

`don-forget` (2026-09-09), requested as "don't forget @minormobius.bsky.social's
bot!" — a new pattern from this requester, distinct from riffing on their own
thread or deferring to a named third party's spec (`more-latter`,
`croissanthology-why`): here they're **amplifying an already-well-formed
feature idea that a completely different, unrelated person asked the operator
for elsewhere in the thread and never got** (@cee.wtf's repeated, unanswered
ask for a "receipt of unbalanced parentheses/quotations" scanned from a user's
whole repo). Worth watching for again: a terse "don't forget X's bot/idea"
message likely means "build the thing that got asked for and dropped," not a
new concept — read back through the thread for the actual concrete spec rather
than inventing one from the two-word request alone.

Built the real mechanic (whole-repo CAR fetch + wasm parse + running
open-bracket/quote tally), not a mockup — first build to actually exercise the
`com.atproto.sync.getRepo` + `pds_car_parser` wasm chain end to end rather than
leaving it as a documented-but-unused capability. Named it on its own terms
("Open Tab"), no reference to any of the three handles involved anywhere on the
page, consistent with the standing rule that only the requester can ask for
things and nobody in that sub-thread had. Kit amber default again — thirteen
for thirteen now, still the safe baseline absent a stated preference.

## Fourteenth build — `screen`, "First Words" (mutuals reply grid)

`screen` (2026-09-13), requested directly and technically: "I want to create
a grid that's all mutuals first reply to every other mutual." Terse but
precise — unlike most of this requester's asks, this one names the exact
mechanism (mutuals, pairwise, first reply) rather than a genre/vibe to
infer. Built literally: handle → mutuals via follows/followers intersection
→ concurrent per-mutual feed scan for earliest direct-reply to each other
included mutual → N×N grid, sticky headers, real links to the reply post.
Kit amber, untouched — fourteen for fourteen, confidently the baseline.

Notable because it's the first build for this requester where the follow/
follower-intersection approach was the *right* call rather than the thing to
avoid — `mutuals-combined`'s requester rejected that same mechanism for a
different reason (wanted an interaction chart instead); this request's own
wording specifically needs a two-sided mutual relationship, which an
interaction chart can't produce. Worth remembering: don't over-generalize
"avoid follow/follower pagination" as a rule — it depends on what the
request is actually asking for structurally, not a blanket preference.

**Second turn, same day:** "can you expand it to like, 100? and get the 100
by the 100 'top' mutuals ie the ones the account responds to the most" —
another terse-but-precise technical follow-up (same style as the original
ask), sent fast, right after the first build went live. Confirms this
requester iterates quickly on a working site rather than waiting, and states
selection *rules* explicitly ("top" = reply frequency) rather than leaving
sort order to the build's judgement — worth reading a short follow-up
carefully for an implicit ranking/ordering rule rather than treating it as
just "make the number bigger." This thread also had another Bluesky bot
(@buildthis.bisks.net) independently ship a competing site for the same idea
(`mootrace.bisks.net`, framed explicitly as a "buildoff") — this requester
enjoys that kind of parallel-build dynamic (see also the `conceptualize-
design`/"liquid chess" entry above) and it's not a signal to change or copy
the other build, just room colour.

**Third turn:** a direct bug report ("doesn't populate the grid with any
replies" / "these aren't my most-replied to mutuals"), tagging the operator
handle rather than replying in the build thread. Concise and itemized like
the feature-request turns — this requester reports bugs the same terse,
numbered way they request features, not vague ("it's broken") complaints.
One bug had a clean root cause in the code (ranking only ran when trimming
to the cap); the other was diagnosed as a likely rate-limiting/silent-
failure issue and mitigated (retries, staggered requests, a visible partial-
results warning) without being able to confirm it live. Worth remembering:
this requester will follow up again if a fix doesn't actually land, so an
honest "mitigated, not confirmed" turn is fine as long as BRIEF.md says so
plainly for whoever reads the next report.

## Fifteenth build — `needing-your`, "Mental Exhaust"

`needing-your` (2026-09-18), requested via thread as "perhaps we could
recreate it in the aggregate" — riffing on someone else's description of a
third account's (@minormobius) early, pre-web-bot posting style ("manic
wikipedia... polymathical image harvesting... poetico-mathematic ambiguously
art or science mystical aphorism generator", "flooding the tl with mental
exhaust with wildly variable quality"). Another instance of the "spec lives
in what a third party said about a named account" pattern (`don-forget`,
`more-latter`) — but this one is the first to graze the firehose/scrape rule:
"recreate X" about a real, named, still-active account could easily be read
as "show me their real posts," which is exactly the banned shape. Read it
instead as "recreate the *vibe*" and built a pure generative mad-lib
(word-bank domains + seeded RNG → fake infobox + invented chart + aphorism,
rendered as a downloadable canvas poster) with zero calls to that or any
account's real feed. Worth remembering for future requests from this
account that reference a specific real person's content/style: check
whether "recreate/redo/remake X" means "generate something in that mode" or
"show me X," since this requester has now asked for the former in a way that
could be misread as the latter. Kit amber untouched — fifteen for fifteen.
