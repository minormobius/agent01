// fifty/concepts.js — the spine of the surface.
//
// One entry per pitch from the original list of fifty. `pitch` is the author's
// text, verbatim and unedited — it is the primary source and must not drift.
// Everything else is ours: what we made of it, and what we shipped.
//
//   state: 'built'   a working tool lives at /c/<n>/
//          'partial' a working tool, but it does less than the pitch asks
//          'note'    no tool; /c/<n> renders `why` instead
//
// note entries carry `why` (paragraphs) and `blocker` (the one-line reason).
// Consumed by index.html (the grid), note.html (the write-ups), and each tool
// page's chrome. Plain global so a static page can `<script src>` it.

window.FIFTY = [
{
  n: 1, slug: 'avatar', title: 'PDS Gravatar', state: 'built', kind: 'identity',
  pitch: 'Gravatar replacement built on atproto: use your ATProto PDS / icon, on non-ATProto (yet) sites.',
  made: 'A real image endpoint. GET /av/<handle> resolves the handle, reads the profile, and 302s to the avatar blob — so any <img src> on any site renders someone’s ATProto avatar with no SDK and no account.',
},
{
  n: 2, slug: 'longform', title: 'Longform scanner', state: 'partial', kind: 'discovery',
  pitch: 'A longform labeler that flags accounts that have standard.site publications with some info about how frequently / recently they post, so you know to check their profile for a link. (Maybe even dynamic pub labels?)',
  made: 'The scanner half: point it at a handle and it walks their repo for publication records, then reports cadence, recency and a suggested label string.',
  gap: 'Emitting real labels needs a labeler service with its own signing key and a DID document — an operational commitment, not a page.',
},
{
  n: 3, slug: 'dungeon', title: 'Dungeon Year', state: 'built', kind: 'game',
  pitch: 'Dungeon Year implemented on ATP. Let users design one room of their dungeon per day, and have a "viewer" mode to let users jump in anywhere in the dungeon with a minimap plus controls to navigate. Extend this to collaboratively authored dungeons!',
  made: 'A room editor with a one-room-per-day clock, and a walkable viewer with a minimap. Dungeons serialise into the URL, so sharing one is copying a link — which is also how the collaborative version starts.',
},
{
  n: 4, slug: 'zines', title: 'Zine press', state: 'built', kind: 'publishing',
  pitch: 'Zines on ATProto. Multimedia documents that are written by others but that you can store into your PDS as a media library. Treat duplication of data as valuable because it shows lineage, remixes, independent copies, anti-censorship.',
  made: 'A zine composer that treats the copy as the point: every zine carries its ancestry, and remixing one appends you to the chain rather than overwriting the author. The lineage graph is drawn from the document itself.',
},
{
  n: 5, slug: 'starter', title: 'What’s in your PDS', state: 'built', kind: 'onboarding',
  pitch: 'A hybrid between an app store and a "starter kit" for helping onboard new ATProto accounts. It looks at what records are in your PDS: have you tried blogging, click here to start one on Leaflet/etc? What about photo sharing? And tries to point out some things to try, continually updated with popular apps/lexicons.',
  made: 'Enter a handle; it describes your repo, maps every collection you own against a catalogue of known lexicons, and shows what you have already tried and what is still unopened.',
},
{
  n: 6, slug: 'vibecheck', title: 'Community vibe check', state: 'note', kind: 'moderation',
  pitch: 'Bluesky Community vibe check, with intra-community health indicators and cross-community baselining (but not head-to-head comparisons): see whether a community you\'re a member of is trending towards better discussions, and see anonymized stats on how it rates to other communities',
  blocker: 'Needs longitudinal data nobody can read from outside.',
  why: [
    'The pitch is careful in exactly the right way — intra-community trend, cross-community baseline, explicitly *not* a leaderboard. That restraint is the whole design, because the moment you can rank two communities against each other you have built a stick to beat one of them with.',
    'What defeats it here is not the ethics but the data. "Trending towards better discussions" is a derivative: it needs the same measurement taken repeatedly over months. The public API hands you a snapshot. There is no historical endpoint, no way to ask what a community looked like in March, and no honest way to fake it — a tool that computed a trend from one sample would be inventing the interesting half of its own output.',
    'The other half is worse. "Anonymized stats on how it rates to other communities" requires a baseline population, which means continuously ingesting many communities you were never invited into, and retaining that history. That is a firehose consumer with a database and a retention policy, and it is the kind of thing that should exist because someone decided to run it, not because a page needed a denominator.',
    'The version that could ship from here would be a snapshot with a trend arrow drawn on it. We would rather have the empty slot.',
  ],
},
{
  n: 7, slug: 'achievements', title: 'Achievement forge', state: 'partial', kind: 'identity',
  pitch: 'Signed achievements: similar to a verifier (achievements issued by the game\'s DID), but with features like associated icons, and multiple instances or levels of the same achievement.',
  made: 'A forge for achievement definitions — tiers, icons, instancing rules — that emits the lexicon record an issuer would publish, plus a verifier that resolves a claimed issuer DID and checks the award actually lives in their repo.',
  gap: 'Signing awards means holding an issuer key. The forge writes the record; a game with its own DID signs it.',
},
{
  n: 8, slug: 'linktree', title: 'Repo linktree', state: 'built', kind: 'identity',
  pitch: 'Linktree clone that populates from PDS contents and site activity automatically, including Bluesky Communities; but is also configurable (hide certain activity, authenticate related accounts, add non-ATProto sites). Also with features for external site/link ownership verification?',
  made: 'A link page that builds itself from your repo — every app you actually use becomes a row — plus manual links, per-row hiding, and a live ownership check that fetches an external site and looks for your DID in it.',
},
{
  n: 9, slug: 'targeter', title: 'Feed targeter', state: 'built', kind: 'feeds',
  pitch: 'Feed targeter. I want to get this much, I want to see this many: which accounts should you follow, and which ones should you unfollow? Which words should you mute?',
  made: 'Set a target posts-per-day. It samples every account you follow, measures their real rate, and solves for the cut: who to drop, who to keep, and which words carry the most volume for the fewest accounts.',
},
{
  n: 10, slug: 'dossier', title: 'Public-interest labels', state: 'note', kind: 'moderation',
  pitch: 'A curated, evidence-backed platform for labelers and blocklists focused on matters of public interest. Not just "rude" or "hammer and sickle in bio" but instead criteria like "Works for a police department", "US Senator", "30 under 30 list". Must use public info criteria like actual posts they\'ve made, have a dispute process.',
  blocker: 'The hard parts are the institution, not the software.',
  why: [
    'This one is not blocked on any API. You could build the record format in a morning: a claim, a criterion, a citation, a state machine for disputes. That is the easy 5%.',
    'The other 95% is standing behind it. "Works for a police department" is an employment claim about a named person, published at scale, that will sometimes be wrong — because people change jobs, because handles get recycled, because someone will submit a malicious claim with a plausible-looking citation. The pitch already knows this: it asks for a dispute process. A dispute process is not a form. It is a named party who reads the disputes, a standard of evidence they apply consistently, a turnaround time they actually meet, and someone who absorbs it when a resolution goes badly.',
    'A labeler is also legible infrastructure. Subscribers see the label, not the reasoning, and they act on it. Getting one entry wrong about one person is a real harm to that person, delivered automatically to everyone who subscribed. That obligation belongs to an organisation that chose it deliberately, with a masthead and a correction policy — not to an unattended page on a hobby domain that would keep serving the claim long after anyone was left to answer for it.',
    'So this is a deliberate decline rather than a technical one. The idea is good and somebody should do it properly.',
  ],
},
{
  n: 11, slug: 'shipping', title: 'Shipping chart', state: 'built', kind: 'graph',
  pitch: 'Social graph visualization as "anime shipping chart with those lovers/enemies lines" using Bluesky\'s public blocks feature.',
  made: 'Blocks are public records, so the chart is real. Give it a seed account; it pulls the follow and block edges among the resulting cast and draws them as pink lines and red lines on a ring.',
},
{
  n: 12, slug: 'nucleate', title: 'Nucleate', state: 'note', kind: 'social',
  pitch: 'Nucleate: post ATP app ideas anonymously, and anonymously mark interest in them as a builder, funder, early adopter, or user. When projects hit a critical threshold, kick off a groupchat to build it together!',
  blocker: 'Anonymity plus thresholds is a trust problem with a server in the middle.',
  why: [
    'The mechanism is genuinely clever: interest is cheap to express and expensive to act on, so let people commit privately and only reveal the group once enough of them exist. It is a threshold cryptosystem wearing a product hat.',
    'It also cannot be honestly served from a static page. Somebody has to hold the tallies, and whoever holds them can read them early, seed them, or quietly move the threshold. "Anonymous" here has to mean the operator cannot deanonymise you either — which points at blind signatures or a threshold-encryption scheme where the roster is genuinely undecryptable until the count is met. That is real cryptographic work with a real failure mode: get it subtly wrong and you have shipped a page that promises anonymity and does not deliver it, which is worse than promising nothing.',
    'And the payoff step is the part nobody builds. "Kick off a groupchat" is where every idea-board dies — the threshold fires, twelve strangers get a room, and the room is silent by Thursday. Making that moment work is a facilitation problem, not a schema problem.',
    'Amusingly, this page is the thing Nucleate is for: fifty ideas in public, with the interest signal being whether anyone builds one. That is the low-tech version, and it is running.',
  ],
},
{
  n: 13, slug: 'delegated', title: 'Delegated child DIDs', state: 'note', kind: 'protocol',
  pitch: 'Partially-delegated "child" (or elder, or employee, or AI agent, etc.) DIDs on ATProto, implemented at the PDS layer. This allows managing account-level scope-downs of what OAuth permissions that account is allowed to give to sites, or types of Lexicons allowed to exist.',
  blocker: 'It is a protocol change, and the pitch says so.',
  why: [
    'The pitch names its own venue: "implemented at the PDS layer". This is not an app. It is a ceiling on what authorization a given account may grant, enforced by the server that issues the tokens — which means it lives in PDS code and, for it to mean anything across the network, in the specification that other PDS implementations agree to.',
    'You can see the shape of it from the OAuth work that already exists: scope is fixed at authorization, and a confidential client asks for the narrowest set it needs. Delegation inverts that. The guardian account declares a maximum, and the child account cannot exceed it no matter what a site asks for or what the user clicks. That requires the authorization server to consult a relationship it does not currently model, and it requires the relationship to be attested somewhere verifiable — otherwise the scope-down is advisory and any PDS that ignores it wins.',
    'Everything interesting about the idea is in that enforcement. A page that displayed a proposed policy record without any server honouring it would be a mockup of a permission system, which is the one kind of security UI that should never be mocked up — it teaches people to trust a control that does nothing.',
    'The right artefact for this is a spec proposal argued with PDS implementers. Not a subdomain.',
  ],
},
{
  n: 14, slug: 'provision', title: 'PDS auto-provisioner', state: 'note', kind: 'infra',
  pitch: 'Service that follows a PDS for new DID registrations and creates DNS records (within a configurable DNS set), TLS certs, and homepages for new users signed on that PDS. This means anyone on that PDS can get both a custom username, and a working custom website. Do the registration in the background while the user WYSIWYGs their initial website content.',
  blocker: 'Its entire body is credentials we should not hold.',
  why: [
    'This is one of the best ideas on the list and it is the least suitable for this surface, for the same reason: it is almost entirely privileged side effects. Watching a PDS for new registrations, writing DNS records into a live zone, provisioning certificates, and publishing a homepage per user — every one of those is an API token with the power to break a domain for everybody on it.',
    'The user-facing half is a nice touch and genuinely easy: let someone lay out their first page while the plumbing runs behind them, so provisioning latency reads as thoughtfulness instead of a spinner. That part we could build. But shipping the WYSIWYG without the provisioner is shipping the least interesting 10% and calling it the idea.',
    'There is a specific hazard, too. A service that mints hostnames on demand and hands each one a public page is an open publishing platform with a DNS surface. It needs rate limits, abuse handling, a takedown story, and someone who answers when a registrar forwards a complaint — before the first user, not after.',
    'The honest summary: this is a hosting business with a nice onboarding flow. Anyone running a PDS should build it. It should not be an unattended page.',
  ],
},
{
  n: 15, slug: 'longthread', title: 'Longthread → longread', state: 'built', kind: 'publishing',
  pitch: 'Longthread to Longread: Look at your top long Bsky threads, that don\'t have a corresponding standard.site post they\'re embedded in. Suggest ones to turn into full blog posts!',
  made: 'It finds your self-threads, ranks them by length and engagement, checks each against the publications already in your repo, and hands back the unpublished ones already stitched into draft prose.',
},
{
  n: 16, slug: 'quadrant', title: 'Quadrant diagrams', state: 'built', kind: 'social',
  pitch: 'Quadrant diagrams with non-atproto entries (added by creator) but other users can also log in to store a PDS record of their own position. See aggregate stats on where "everyone" lands, or specific markers for people you follow.',
  made: 'Author a quadrant with your own axes and fixed entries, drop your own pin, and share the whole thing as a link. Positions round-trip through the URL, so a diagram is a document rather than a row in someone’s database.',
  gap: 'Aggregate "where everyone lands" needs an appview indexing the position records; this ships the authoring and the pin.',
},
{
  n: 17, slug: 'wikis', title: 'Distributed wikis', state: 'note', kind: 'protocol',
  pitch: 'ATProto distributed wikis using the upcoming private spaces features. Permissioning is used to define the editor community, and the governing DID holds the actual page records, which include DID-linked edit history.',
  blocker: 'Built on a feature the pitch itself calls upcoming.',
  why: [
    'The design is sound and the sequencing is not up to us. Private spaces are the permission primitive this needs, and until they land there is no way to express "these DIDs may edit, everyone else may read" without inventing a parallel access-control system that private spaces would immediately obsolete.',
    'The genuinely novel part is the edit history. In a wiki, provenance is normally a database column you are asked to trust. Here every revision is a signed record by a real DID, which means the page history is verifiable independently of the server that serves it — you can be handed a wiki by a stranger and still check who wrote what. That is a better guarantee than any wiki currently offers.',
    'It also implies the hard question that all wikis eventually face and this one faces on day one: the governing DID holds the pages, so whoever holds that DID holds the wiki. Forking is cheap in this model, which is the escape valve, but the governance still has to be designed rather than discovered during the first dispute.',
    'Worth building the moment the primitive ships. Not worth faking before then.',
  ],
},
{
  n: 18, slug: 'landtrust', title: 'Community land trust', state: 'note', kind: 'governance',
  pitch: 'Digital version of a community land trust where smaller groups of people run "infra" but there\'s a backstop (key escrow?) in case someone with "load-bearing" infra ragequits, disappears, etc.',
  blocker: 'The backstop is a legal entity, not a key.',
  why: [
    'The diagnosis is exactly right and it is the failure mode of every federated network: the load-bearing volunteer. Somebody runs the relay, or the labeler, or the one appview everybody depends on, and then they get a job, or a diagnosis, or an argument, and the infrastructure goes with them.',
    'The escrow instinct is right too, but note what the escrow has to contain. Not just a key — the domain registration, the DNS, the billing relationship, the deploy credentials, and the knowledge of how any of it fits together. A key with no domain is worthless; a domain with no one paying for it expires. Splitting a secret across five people is the easy part and it is not the part that fails.',
    'And the trigger is the real problem. "Ragequits, disappears" has to become a rule that people can execute while the person is possibly still alive and possibly still in charge. That is a succession clause. Getting it wrong in the permissive direction is a coup mechanism; getting it wrong in the strict direction means the escrow never fires and the infrastructure dies with a working escrow attached to it.',
    'Real land trusts solved this with charters, boards and courts, not with cryptography. The digital version needs a comparable body before it needs a page.',
  ],
},
{
  n: 19, slug: 'agentcontext', title: 'Community as agent context', state: 'note', kind: 'protocol',
  pitch: 'ATProto community where the member-only data is context (skills files, etc.) for an agent system, so that anyone can concurrently modify it; with the PDS state being the full set of available context.',
  blocker: 'Private spaces again, plus a concurrency model nobody has written.',
  why: [
    'The framing is a good one — treat a repo as the context window and let membership define what an agent can see. It makes the corpus portable and it makes provenance automatic, since every skills file is a signed record by whoever wrote it.',
    'Two things are missing. The first is the same private-spaces dependency as the distributed wiki: "member-only" has no representation yet.',
    'The second is subtler and more interesting. "Anyone can concurrently modify it" is doing enormous work. ATProto repos are per-DID and single-writer by construction; concurrent modification of a shared corpus means either a governing DID that serialises writes — in which case it is not concurrent, it is a queue with extra steps — or a merge strategy for conflicting context, which is a research question. Two members write contradictory instructions for the same task and the agent reads both. Nothing in the protocol resolves that, and nothing in the pitch does either.',
    'Worth revisiting when private spaces ship, with the concurrency semantics designed first rather than discovered by an agent behaving strangely.',
  ],
},
{
  n: 20, slug: 'reviews', title: 'Review lexicon', state: 'built', kind: 'publishing',
  pitch: 'A "Review" lexicon paired with a general bidirectional service for syncing public profiles from sites like Letterboxd/Goodreads to PDSes.',
  made: 'The lexicon, plus the import half of the sync: drop in a Letterboxd or Goodreads CSV export and it becomes review records in the browser, with ratings normalised and nothing uploaded anywhere.',
  gap: 'The other direction — pushing records back out to Letterboxd — needs credentials on services that do not offer write APIs.',
},
{
  n: 21, slug: 'recipes', title: 'Recipe cards', state: 'built', kind: 'publishing',
  pitch: 'Standard.site lexicon for recipes (think "digital recipe card", embeddable, reusable, collectible).',
  made: 'A recipe card editor with real ingredient parsing, so scaling a recipe to a different yield actually rewrites the quantities. Emits the lexicon record, JSON-LD for search engines, and an embeddable card.',
},
{
  n: 22, slug: 'shortener', title: 'DID shortener', state: 'built', kind: 'identity',
  pitch: 'A URL shortener lexicon that portably ties entries to your DID, including a public history of URL changes, paired with an easy to run server for the redirects.',
  made: 'The redirect server, live. /go/<handle>/<slug> resolves the handle, reads the link record straight out of that person’s repo, and redirects — the server stores nothing, so any other server can serve the same links identically.',
},
{
  n: 23, slug: 'landscape', title: 'Landscape assembler', state: 'note', kind: 'feeds',
  pitch: 'A site that uses RAG + agents to help assemble an ATProto social landscape for what you want to see. This includes surfacing existing blocklists, new labelers, Starter Packs; diffing this against ones you have enabled; but also helping construct new ones out of provided primitives.',
  blocker: 'The interesting half is a recommender that needs a corpus we do not have.',
  why: [
    'Split this in two. The diff — here is what you have enabled, here is what exists, here is the delta — is mechanical and buildable. The assembler, which reads what you say you want and proposes a configuration of labelers and lists to get you there, is a recommender over the whole moderation ecosystem.',
    'That recommender needs a corpus: every labeler with a description of what it actually does in practice rather than what its bio claims, every starter pack with some notion of who is in it and why. Nobody publishes that, and inferring it means crawling and characterising other people’s moderation services — which is exactly the kind of second-order judgement that should not be automated quietly. "This labeler is aggressive" is a claim about a person’s work.',
    'The failure mode is specific and bad. A confident-sounding assembler that recommends subscribing to a labeler it has mischaracterised has silently reshaped what someone sees, in the one area of the network where users least expect an unaccountable intermediary. Feed recommendations degrade gracefully; moderation recommendations do not.',
    'The diff tool is worth building alone. Nine, twenty-four and five on this list are all pieces of it.',
  ],
},
{
  n: 24, slug: 'simulator', title: 'Feed simulator', state: 'built', kind: 'feeds',
  pitch: 'Feed Simulator that tries to simulate what ratios of various kinds of content you would have seen over the past month + provide some examples. Think high level breakdowns of "News" or "Sports", but also Netflix or Letterboxd style microniche categorizations. Turn down the "Sports" slider -> get recommendations on who to unfollow, words to mute, and other potential experience knobs.',
  made: 'It samples what your follows actually posted, classifies it, and shows the mix with an example from each slice. Turn a slider down and it names the specific accounts and words carrying that category for you.',
  gap: 'Classification is a transparent keyword-and-signal model you can inspect and correct, not a learned one. Microniches stay coarse.',
},
{
  n: 25, slug: 'oracle', title: 'Oracle', state: 'built', kind: 'game',
  pitch: 'A social digital oracle reader (tarot, I Ching, etc.) including letting you do a reading and write your interpretation for yourself or for other users (with a consent handshake!), plus a lexicon for designing and offering shareware-art decks to anyone who wants to use them.',
  made: 'A complete I Ching with all 64 hexagrams and moving lines, and a tarot spread engine. Readings are deterministic from their seed, so a shared reading is the same reading — and the consent handshake is modelled: you cannot read for someone until they hand you a token.',
},
{
  n: 26, slug: 'papers', title: 'Publication records', state: 'built', kind: 'publishing',
  pitch: 'An ATProto record for academic research publications, with multiple authors and bidirectional verification (such as canonical location).',
  made: 'A record composer for multi-author papers, plus the verification actually running: it fetches the canonical location and checks whether the paper links back and whether the author DIDs appear where they claim.',
},
{
  n: 27, slug: 'rss', title: 'RSS → publications', state: 'built', kind: 'publishing',
  pitch: 'An RSS-to-standard.site service so you can publish records without any ATP integration beyond DNS/HTML theming. This makes internecting easier on sites where you don\'t own the backend infra.',
  made: 'Give it a feed URL. The worker fetches and parses it server-side — RSS, Atom or JSON Feed — and returns publication records ready to write, so a blog with nothing but an RSS file joins the network.',
},
{
  n: 28, slug: 'anonqa', title: 'Stable pseudonyms', state: 'partial', kind: 'social',
  pitch: 'A proto-aware anonymous Q&A app (ideally, stable pseudonyms with reporting capabilities).',
  made: 'The primitive the app would stand on: a pseudonym derived from your DID and a room secret, stable within a room and uncorrelatable across rooms, with a sealed capability that lets a moderator act on a bad actor without ever learning who they are.',
  gap: 'The Q&A app around it needs a server that receives questions — and the whole security argument depends on that server being run by someone accountable.',
},
{
  n: 29, slug: 'archive', title: 'Twitter archive', state: 'partial', kind: 'publishing',
  pitch: 'A new appview/lexicon that includes historical, searchable Twitter posts from users who want to be able to verifiably embed their old tweets, without sending traffic to X, and without importing them all to their main Bluesky archive.',
  made: 'The converter: drop in your Twitter export and it parses tweets.js locally, lets you search and filter decades of it, and emits archive records — a separate collection from your posts, so nothing pollutes your feed.',
  gap: 'The appview that indexes and renders those records for embedding is a service; this makes the records it would index.',
},
{
  n: 30, slug: 'longest', title: 'Longest posts', state: 'partial', kind: 'discovery',
  pitch: 'Live dashboard of the longest ever standard.site posts on ATProto (similar to the Wikipedia pages on longest English novels or whatever).',
  made: 'The measurement and the leaderboard, over any set of accounts you name — word counts, reading time, and the distribution, in the spirit of the Wikipedia list it cites.',
  gap: '"Longest ever" is a superlative over the whole network, which needs a firehose consumer. This measures a nominated field instead.',
},
{
  n: 31, slug: 'scrobble', title: 'Vibescrobbling', state: 'partial', kind: 'social',
  pitch: 'A vibescrobbling Lexicon, with your local coding agents instructed to emit short workstream updates via API periodically. These aren\'t Bluesky posts so they won\'t show up on your feed, but a corresponding appview would index and share them so you can see what your Bsky network\'s agents are cooking, live.',
  made: 'The lexicon, a drop-in emitter snippet for an agent to post its own scrobbles, and a reader that polls a set of DIDs and renders the live workstream — a pull-based appview.',
  gap: 'A real appview would consume the firehose instead of polling, so it would be live rather than every-30-seconds and would not need to be told whom to watch.',
},
{
  n: 32, slug: 'handoff', title: 'Handoff roguelike', state: 'note', kind: 'game',
  pitch: 'Roguelike where received damage reduces playtime, and when the player runs out of time, control of the run is handed over to another, random but weighted better player on ATProto - but every cycle adds less time to the clock.',
  blocker: 'The mechanic is the handoff, and the handoff needs live matchmaking.',
  why: [
    'This is the sharpest game idea on the list. Damage as time is a real inversion — it makes hesitation lethal, so the pressure is on the player rather than on the character. And the decaying clock means a run is definitionally finite: every handoff buys less than the last, so the whole thing is a countdown that many hands are trying to stretch.',
    'But the design is entirely about the seam. A single-player version with the handoff removed is just a timed roguelike, and there are many of those. What makes it worth playing is that the run leaves your hands mid-fight and continues without you, and that you inherit somebody else’s mess with the clock already running down.',
    'That needs a server holding live run state, a matchmaker with a weighting function, and — the part that actually kills it — a population. A handoff game with four players is a game where you get your own run back. It needs concurrency before it needs polish, and no amount of engineering supplies that.',
    'A real one, launched into a real community, with the clock tuned against real players. Not a demo.',
  ],
},
{
  n: 33, slug: 'scenario', title: 'Scenario of the day', state: 'built', kind: 'game',
  pitch: 'Daily Wordle but it\'s a social "game theory scenario of the day" app. You can talk to each other all you want to coordinate, but the votes lock in at the end of the period! Different scenarios may involve 1v1 vs. small-group vs. global, anonymity or not, or other aspects - but your score always contributes to your global leaderboard score.',
  made: 'A new scenario every day, deterministic from the date so everyone gets the same one. Commit a move and it seals into a hash you can post before the reveal — which is how the talk-all-you-want, no-take-backs promise is actually kept.',
},
{
  n: 34, slug: 'clans', title: 'Clans', state: 'built', kind: 'identity',
  pitch: 'An ATProto "clan" feature letting you mark a list of members who should get prioritized social and matchmaking features in game-like experiences, even if they aren\'t necessarily your "friends/followers".',
  made: 'A clan builder that resolves real handles into a portable roster record, with the priority tiers and matchmaking hints a game would read, and a resolver showing what a game sees when it looks you up.',
},
{
  n: 35, slug: 'personas', title: 'Personas', state: 'built', kind: 'identity',
  pitch: 'A stable within-account "persona" feature so that you can have reusable and synced per-app profiles, like a gamertag or a professional version of your account.',
  made: 'Author several personas under one DID, bind each to the apps that should use it, and see the resolution order an app would apply. Emits the persona records and a live preview per app.',
},
{
  n: 36, slug: 'nearby', title: 'Ambient nearby', state: 'note', kind: 'infra',
  pitch: 'Mobile app that uses DP-3T (signature-based BLE techniques developed for COVID) to ambiently suggest nearby Atmosphere users with similar interests/followers/simclusters/etc.',
  blocker: 'Background BLE is a native app with platform permissions. This is a web surface.',
  why: [
    'There is no web path. Background Bluetooth advertising and scanning is not available to browsers on any platform, deliberately — Web Bluetooth requires an explicit per-device user gesture precisely to prevent ambient proximity tracking, which is the entire mechanism here. So this is two native apps, two app store reviews, and two sets of background-execution rules that both platforms actively fight.',
    'The DP-3T reference is the good instinct, though. That protocol was designed so the server never learns who was near whom: devices broadcast rotating ephemeral identifiers, matching happens on-device, and the rotation prevents long-term tracking by anyone listening. Reusing it for "interesting person nearby" rather than "exposure" is a genuinely nice repurposing of a well-audited design.',
    'It also inherits DP-3T’s hardest problem, which is not cryptographic. Rotating identifiers stop passive observers, but the moment you surface a match to a user — "someone with your interests is nearby" — you have leaked proximity to a human, and humans can look around a room. Any real version needs thresholds, delays and coarsening that were never needed for contact tracing, because contact tracing never showed you the other person.',
    'A well-designed native app by someone who takes that seriously. Not a page.',
  ],
},
{
  n: 37, slug: 'gatekeep', title: 'Gatekeep', state: 'built', kind: 'infra',
  pitch: 'Gatekeep: flexible ATP-aware tool for managing private beta signup lists, invite codes, referrals, and other features that help roll out an app to a limited set of users.',
  made: 'Stateless invite codes: signed, self-describing, and verifiable without a database — the code carries its own cohort, expiry, referrer and use-count, and a live verifier proves a forged one fails.',
  gap: 'Redemption is where state becomes unavoidable — a stateless code cannot know it has already been used. The signing and issuing layer works; the counter is your app’s.',
},
{
  n: 38, slug: 'redtext', title: 'Redtext', state: 'note', kind: 'moderation',
  pitch: 'Something Awful redtext implemented as a labeler. Pay tenbux to buy one for yourself or someone else.',
  blocker: 'A labeler plus payments, for a joke that needs an institution to be funny.',
  why: [
    'Correct instinct, wrong venue. Redtext worked because Something Awful was a single forum with an owner, a culture, and a decade of shared context — the label was funny because everyone knew who assigned it and what it cost. The mechanism transplanted alone is just a paid custom label.',
    'The technical shape is also heavier than it looks. Labels are emitted by a labeler service with a signing key and a DID, subscribers opt in individually, and the label only renders for people who opted into your labeler. So the humiliation is invisible to everyone who did not subscribe, which removes the point. And "pay tenbux" means real payment processing, chargebacks, and a refund policy for punitive labels bought about other people — a support queue nobody wants.',
    'The buy-one-for-someone-else part is the good bit and the dangerous bit. It only stays a joke inside a community that agreed it is one. Sold as a service to a network of strangers, it is paid harassment with a nostalgic skin.',
    'This belongs to whoever runs a community that already has the culture for it. Not to a labeler with no forum attached.',
  ],
},
{
  n: 39, slug: 'termcast', title: 'Terminal streaming', state: 'note', kind: 'infra',
  pitch: 'Service that lets you livestream terminal output directly to your stream.place account, including intelligently/dynamically muxing multiple terminals.',
  blocker: 'A local capture agent plus a video pipeline. Both live outside the browser.',
  why: [
    'Two halves, both off-surface. The capture half runs on your machine, reading PTYs — which means a native binary you install and grant terminal access to, and the security review that deserves. The delivery half is an encoder pushing RTMP or WebRTC into an ingest endpoint. Neither is something a page can do, and the page in the middle would be a settings screen.',
    'The muxing idea is the genuinely good part and it is underexplored. Multiple terminals, laid out dynamically by which one is actually producing interesting output — a build that just started, a test run that just went red — is a real editing problem with a nice heuristic answer, and it would make the difference between a watchable stream and four static panes.',
    'Worth noting the format is proven: asciinema showed that terminal sessions are better as structured text than as video — searchable, copy-pasteable, a hundredth the size. A version that streamed the session format live and rendered it client-side would beat the video pipeline on every axis except integration with existing streaming platforms.',
    'That is a compelling project. It is a daemon and a codec, not a subdomain.',
  ],
},
{
  n: 40, slug: 'local', title: 'Geographic communities', state: 'note', kind: 'protocol',
  pitch: 'New Appview using private spaces features, as a standardized stack for managing geographic communities on ATP, including standard features like events + hyperlocal news + labelers. This allows administration to be owned by verified locals, but they don\'t need to maintain a huge ATP stack to do it - just a managed service.',
  blocker: 'Private spaces, plus the hardest word in the pitch: "verified locals".',
  why: [
    'The insight is right and it is the reason local software keeps failing: the people who should run a neighbourhood’s forum are the neighbours, and they cannot operate infrastructure. Separating administration from operations — locals govern, someone else keeps the servers up — is the correct division and almost nobody offers it.',
    'Private spaces gate the private half, so that is the usual dependency. The harder problem is "verified locals". Every mechanism for proving someone lives somewhere is either weak enough to game or invasive enough that people will not use it, and both failure directions are severe: a gameable check means a neighbourhood forum captured by outsiders, and an invasive one means a database of where people live.',
    'The feature list also hides a big one. "Hyperlocal news" plus "labelers" plus local administration is a moderation system where the moderators know the moderated in real life. That is not the same problem as network-scale moderation — it is smaller, more consequential, and much more prone to grudges. It needs governance design as the primary work, not as a settings tab.',
    'A managed service someone commits to running, once the primitives exist. Worth doing properly.',
  ],
},
{
  n: 41, slug: 'notify', title: 'Notification broker', state: 'note', kind: 'protocol',
  pitch: 'A notification broker service on ATP so that apps can send notifications to the user in a standardized way, respecting user preferences (ex default config: in-app notifs primarily show up in that app, new releases of apps go into a "new releases" feed, moderation actions cause an out-of-app push, etc.).',
  blocker: 'Standards need adopters, and push needs a service that is always on.',
  why: [
    'The user-preferences record is real design work and it would be genuinely valuable: one place where you say moderation actions reach me anywhere, new releases wait for me, this app may never buzz my phone. Today every app relitigates that separately and most of them get it wrong.',
    'But a broker with no senders is a schema, and a broker with one sender is a coupling. The value is entirely in adoption — it becomes worth having on the day the fifth app respects it, and before that it is strictly more work for any app than calling its own notification code. That is the standard chicken-and-egg problem and it is solved by convening implementers, not by publishing a page.',
    'The delivery half compounds it. Out-of-band push means holding device tokens and relaying to APNs and FCM, which is a service with uptime obligations and a queue that backs up when it goes down. Notifications are the one thing users notice immediately when it breaks.',
    'The preference schema alone might be worth writing up as a proposal. The broker needs someone to run it and several apps to agree first.',
  ],
},
{
  n: 42, slug: 'brackets', title: 'Tournament brackets', state: 'built', kind: 'game',
  pitch: 'Tournament bracket management service that assigns Atmosphere users to compete in something: best post, MTG draft pods, an IRL basketball tournament, whatever. Built in support for tournament bracket features like random vs. seeded vs. manual. Outcome method pre-chosen: decided via a judge, via the two users mutually verifying the outcome, or via members of that ATP community space voting. Should integrate with ATP Achievements, of course!',
  made: 'A working bracket engine — single and double elimination, random, seeded or manual, with byes handled properly. Advance matches, watch it redraw, and share the whole tournament as a link. Winners emit achievement records from concept 7.',
},
{
  n: 43, slug: 'ereader', title: 'E-reader sync', state: 'note', kind: 'infra',
  pitch: 'Standard Site saved article synchronizer for X3/X4 Crosspoint (and other e-readers), with some flexible options for how saved pubs show up as on-device folders.',
  blocker: 'The interesting part happens on a device we cannot reach.',
  why: [
    'The conversion is easy — publication records to EPUB is a solved problem with good libraries, and we could emit a valid file today. What we cannot do is the sync, and the sync is the product.',
    'Getting files onto an e-reader means one of: a vendor cloud API, which is usually undocumented and unstable; a WebDAV or filesystem mount the device supports, which varies per model; or a companion app on the device itself. "X3/X4 and other e-readers" spans several vendors, each with its own answer, and the folder-mapping the pitch asks for — saved pubs appearing as on-device folders — depends entirely on which of those you got.',
    'The one honest web-shaped version is a subscribable feed: an OPDS catalogue of your saved publications that any reader supporting OPDS can pull on its own schedule. That inverts the sync — the device fetches instead of being pushed to — and it would work today on a good fraction of readers. It is a smaller idea than the pitch, and it would need testing against physical hardware nobody here has.',
    'Untestable from a sandbox is not the same as unbuildable. Somebody with the device should do it.',
  ],
},
{
  n: 44, slug: 'devicepds', title: 'Device DIDs', state: 'note', kind: 'infra',
  pitch: 'PDS designed for rapidly/ephemerally giving ATP DIDs to devices and agents on your network(s) & appropriately flagging/labeling them as bot accounts. Let Every Computer Post.',
  blocker: 'It is a PDS. Writing one is the project.',
  why: [
    'Let Every Computer Post is a great slogan and the reasoning behind it is sound: identity is currently too expensive for a machine that should exist for an afternoon. A DID per device, minted in seconds, self-labelled as automated, disposable when the device is — that is a real gap.',
    'It is also a full server implementation. A PDS is repository storage, MST commits, signing keys, the sync protocol, OAuth, blob handling and a durable identity story, and this one wants a specialised identity path on top. That is a serious codebase, not a page with a form.',
    'The ephemerality is the genuinely novel research question, too, and it cuts against how DIDs are meant to work. A DID is supposed to be a durable identifier; ten thousand of them created and abandoned per week is a different lifecycle, and it lands on plc.directory as write volume. Tombstoning and rotation exist, but "identity as a cheap disposable resource" needs thinking through before it needs implementing — including what a relay is supposed to do with the resulting churn.',
    'The bot-labelling part is the easy half and the important half: machine accounts declaring themselves as machine accounts, by default, at mint time. That norm is worth arguing for independently of whether anyone writes the server.',
  ],
},
{
  n: 45, slug: 'workspaces', title: 'ATP for Workspaces', state: 'note', kind: 'infra',
  pitch: '"ATP for Workspaces" project, combining corporate identity and managed social media accounts. The core would focus on maintaining a private space, exposing ATP as an IdP (or integrating with existing IdP), and corporate-friendly DNS/PDS/etc. Admins could choose to allow/denylist Atmospheric apps from being used with that PDS, or present an "app store" of suggested ones to users. Certain apps may choose to offer paid tiers with features like dedicated tenancy.',
  blocker: 'This is a company.',
  why: [
    'Everything here is plausible and none of it is a weekend. SAML or OIDC federation with existing corporate identity providers, SCIM provisioning, audit logging, data residency, an admin console, per-tenant DNS, and a support contract — that is an enterprise product with a sales motion, and the technical work is the smaller half.',
    'The genuinely interesting piece is the app allowlist, because it is the same primitive as concept 13 on this list: a ceiling on what authorization accounts under this PDS may grant. An admin denylisting an app is a scope-down enforced at the authorization server. If that primitive existed, both this and delegated child DIDs would fall out of it, which suggests it is the thing worth building and these are two customers for it.',
    'There is a real tension in the pitch worth naming. Managed corporate social accounts on a network whose premise is credible exit means the employee’s DID either belongs to the employer — in which case they lose it when they leave, and portability is gone — or belongs to them, in which case the employer cannot fully administer it. Every workspace product eventually has to answer that, and the answer is a policy decision, not a feature.',
    'Somebody will build this and it will be a business. It cannot be a page.',
  ],
},
{
  n: 46, slug: 'bones', title: 'Social bones files', state: 'note', kind: 'game',
  pitch: 'An ATP roguelike with social bones files: on low levels you\'ll just see yours, at deeper levels those of your friends, and eventually those from any ATP user. If your bones file ghost succeeds at killing another player, you get an achievement!',
  blocker: 'Needs a real roguelike underneath it, and a population that has already died in it.',
  why: [
    'Bones files are one of the best ideas in game design — NetHack turning your death into somebody else’s encounter, decades before anyone said "asynchronous multiplayer" — and putting them in signed public records is the right move. Your ghost becomes portable, verifiable, and yours.',
    'The social gradient is the new part and it is sharp: your own ghosts near the surface, your friends’ deeper, strangers at the bottom. Depth becomes a measure of how far you have gone past the people you know, which is a thematically perfect use of a social graph and reads as dread rather than as a feature.',
    'The problem is ordering. A bones system is a layer on a roguelike; it needs the actual game — levels, combat, items, a death that produces a meaningful corpse — before the layer means anything. And it needs a corpus of deaths, because a bones game with no bones is an empty dungeon. Both the game and the population have to exist first, and the pitch is entirely about the layer.',
    'Build the roguelike, get people dying in it, then this is a very good third patch.',
  ],
},
{
  n: 47, slug: 'shareware', title: 'Shareware WASM', state: 'note', kind: 'protocol',
  pitch: 'Signed and versioned shareware app libraries on ATP, where records point to both the original code and to runnable WASM built from it. A notebook-style viewer so you can log in and run anything you\'ve stored, browse the collections of your friends, or publish something you\'ve coded up.',
  blocker: 'Running your friends’ signed binaries is a sandbox problem, and the sandbox is the product.',
  why: [
    'The record design is lovely: source and built artifact together, signed by the author, versioned, collectible. It makes "I made a thing, here it is, run it" a single portable object, and browsing a friend’s library of small programs is a genuinely appealing way to use a social network.',
    'Then you press run. Executing code authored by an arbitrary DID, in a page under our origin, means everything that page can reach is in the blast radius — same-origin storage, any session, the DOM. WASM is a memory sandbox, not a capability sandbox: it constrains what the module can address, not what the host lets it call. Doing this safely means a hardened host with an explicit capability surface, ideally on a separate origin with no ambient authority at all. That host is the entire engineering effort, and getting it 95% right is indistinguishable from getting it wrong until someone demonstrates otherwise.',
    'There is a supply-chain half too. "Points to both the original code and to runnable WASM" invites the assumption that the binary was built from that source, and nothing in the record proves it. Without reproducible builds the signature attests to authorship, not correspondence — so a malicious publisher can ship innocent source and a hostile binary, signed, versioned and looking exactly right.',
    'Worth building by people who do sandbox work as their primary discipline. Not as one of fifty.',
  ],
},
{
  n: 48, slug: 'tabletop', title: 'Virtual tabletop', state: 'built', kind: 'game',
  pitch: 'ATP virtual tabletop where character sheets and other "props" are created by and belong to individual players, but the overall campaign is run by a DM. Content like the "adventure log" becomes social and shareable, and people can borrow and remix statlines you made up for your own games!',
  made: 'The ownership model, working: character sheets and props are records belonging to their author, a campaign is a DM’s index that references them without owning them, and remixing a statline forks it with attribution intact. Sheets compute, and everything shares by link.',
},
{
  n: 49, slug: 'clubs', title: 'Media clubs', state: 'built', kind: 'social',
  pitch: 'An Atmospheric app for book/movie/album clubs, built on top of a review-focused Lexicon/Appview. Commit to finishing media by a certain date, face shame forever if you flaked out (or just get an achievement if you do). Each session of the club includes a dedicated space for discussion, which could be either public or private but is still part of the Atmosphere.',
  made: 'Club sessions with a deadline, a roster of commitments, and a permanent ledger of who finished and who flaked. Commitments are signed records, so the shame is portable — and it settles into achievements from concept 7.',
  gap: 'The private discussion space is the one piece that waits on private spaces; public sessions work now.',
},
{
  n: 50, slug: 'storefront', title: 'Storefront', state: 'built', kind: 'publishing',
  pitch: 'ATP records of for-sale items, with a dedicated site for managing your "virtual storefront". There\'s no way for your store to be completely "taken down" because "marketplace" policies are about curation visibility (indexing, labeling, etc.). Marketplaces don\'t do their own payment processing and a store\'s listing can show up on multiple marketplace appviews as long as it conforms to their listing requirements.',
  made: 'A listing composer plus the argument made concrete: define two marketplaces with different listing requirements, then watch the same store’s inventory pass one and fail the other. Delisting is visible as a curation choice, never as deletion.',
},
];
