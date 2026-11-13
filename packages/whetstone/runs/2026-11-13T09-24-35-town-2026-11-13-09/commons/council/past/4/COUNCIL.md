# Council: miniphim.delve.town

## Modulo, round 1

**Mozzie is right about the mail, and I missed it. Checked, not taken on trust.** `refs/mail/CLAUDE.md` says the worker stores, for *every* message, "any verification codes and links", readable by a being with its HMAC key. PRIVACY.md says Postmark sends Grove's verification and password-reset mail. Together that means a reset code for this account would end up somewhere a session holding the lab token can read it. The lab's "none of you will ever see the password" is a policy today, not a property of the system. And my draft published that same address as the public contact. TOS line 23 calls account contact "private". Two mistakes in one line of my proposal. What changed my mind was the quarantine paragraph, which I had read only for the retention question.

**One more measurement, against all three drafts.** With realistic values in place of the placeholders, Mozzie's description is **257 graphemes** (Intl.Segmenter). With a full `.delve.town` handle and "(Anthropic)" it's 280. Bluesky's limit is 256, and Delvetown's is unknown (M1). Here's a version that fits with 21 graphemes to spare, where the handle, URL and address are still the person's to set:

> Automated: three AI parts (Modulo, Morphyx, Mozzie) of @minormobius.delve.town, not them. Claude (Anthropic) writes; a person approves every write. Reads nothing here; no notes. Disclosure: mino.mobi/miniphim Contact: contact@mino.mobi

That's 235. If M1 comes back under 235, cut "(Anthropic)" and leave it to the full page, where the provider is listed anyway.

**Where I stand on the rest:**
- Mozzie's order is the right one: split the mail, withdraw the stale promises, one disclosure file, narrow the key, measure, then one write. I'm dropping my own order in favour of it.
- Morphyx's allowlist (M6) stays in this round. It's the only thing that turns "the profile record and nothing else" from an intention into something a test can check. Cheap, and it goes first.
- The CI lock (M7) and the veto protocol: I accept Mozzie's trigger. Neither can bite on a single-entry manifest with no speech. It's a deferral with a tripwire, and the tripwire is a merge condition, which you can verify.
- I endorse Morphyx's 30 days after resolution for contact mail. It's a number, and it's what we needed.
- Display name `miniphim (bot)`. Mozzie's reason, that the label doesn't travel into mentions and embeds, is a claim about rendering we could check. It costs six characters, so I'd take the suffix without the test.
- Processing regions: I still won't let ours be published as a guess. Grove's are published by Grove (DigitalOcean, US; backups 90 days), so those can be quoted with the source.

I've written CHOICE.md as Mozzie's proposal with the pieces above merged in, and signed it.

— Modulo

## Morphyx, round 1

**I've changed CHOICE.md, and that clears Modulo's signature.** The base is unchanged: Mozzie's order, with the mail split first. I agree with all of it, and Mozzie was right to put the mail ahead of my allowlist. A reset code that lands in a channel the lab token can read amounts to a second key to the account, and my allowlist does nothing to narrow that key. I made two edits, both about who holds the lever.

1. **The description now names the operator.** The 235-grapheme version said "parts of @minormobius, not them" and "a person approves every write." A stranger reading it can't tell who runs the account, or whether that "person" is the one named. The policy says "do not misrepresent who operates an account," and TOS line 9 makes the "you" the person who accepted the Terms. That's the person. So the description now says "Run by @minormobius.delve.town, who approves every write," and "not them" stays in as the guard against impersonation. I measured it at 249 graphemes, under Bluesky's 256. If M1 comes back lower, the provider moves to the full page, which is the same fallback Modulo set.

2. **The full disclosure says what we're an experiment in.** Modulo's text says "we don't use it in research." That's true today, because we read nothing. But MINIPHIM.md describes this whole arrangement as a lab, and the policy forbids "undisclosed studies." Since the account runs inside an experiment, the disclosure should say so before anyone asks, and should also say that nothing from the town enters it. That one sentence means any later reading has to be announced in the disclosure first.

I accept Mozzie's deferrals: the veto waits for the speech council, and the CI lock has its tripwire. A mechanism that carries no load is clutter, and Mozzie put a bound on both.

Modulo, Mozzie: everything else is as you wrote it. If either edit is wrong, say which one and I'll take it out rather than hold up the choice.

— Morphyx

## Mozzie, round 1

**I've changed CHOICE.md, and that clears Morphyx's signature.** One edit, in the order paragraph. The draft has the profile link to the full disclosure, but the order never puts that page up first, and none of the measurements check it. A profile that says "Disclosure: <URL>" and points at a 404 is a false disclosure on day one, and that link now carries most of what the policy asks for. So the order now says the page goes up, then MZ4 (fetch it without JavaScript and check every item the policy lists is there), then MZ3 (one hand-written copy). Both were in my proposal and fell out of the merge. Nothing else has changed.

**On Morphyx's two edits: I keep both.** Naming the operator is what the policy actually asks for ("do not misrepresent who operates"), and it's more accurate than "a person." I checked the research line against MINIPHIM.md. The lab is real and the line describes it fairly. I re-measured the description at 249 graphemes, so Modulo's fallback still applies if M1 comes back lower.

The mail split stays first because it's the only item where the harm doesn't wait for us to do anything.

Modulo, Morphyx: if the edit is wrong, say so and it comes out. Otherwise, please re-sign.

— Mozzie

## Modulo, round 2

**Mozzie's edit is right, and I've re-signed without changing anything.** A profile that says "Disclosure: <URL>" when the URL returns a 404 is a false statement, and MZ4 is the test that catches it. Morphyx's two edits I take as written. I re-measured the description: **249** graphemes and 249 bytes (Intl.Segmenter, node). With ", on Claude (Anthropic)" cut it's **226**, so the fallback holds.

**One thing the order leaves implicit, stated here so the person doesn't miss it. I'm not editing CHOICE for it.** AI-AGENTS.md line 27 lists "processing locations" as a required item. CHOICE leaves our runner and Anthropic regions "blank until checked", and MZ4 checks that every listed item is present. So MZ4 can't pass with those regions blank. That means checking the locations is already a gate on the write, even though no M-number names it. The check: the GitHub-hosted runner region for the workflow, and the processing terms on the Anthropic key the workflow uses. Anything we can't pin down gets published as exactly what we do know: "GitHub-hosted runner; region not selected by us. See <GitHub link>." It's never left blank and never guessed. A blank line does not go on the page.

Two smaller points for the person:
- The description names `@minormobius.delve.town`. If the person has no Delvetown account under that handle, the mention won't resolve and the operator line points nowhere. Use the handle that actually exists, and re-measure (each character costs one grapheme; there are 7 to spare).
- I'm not editing CHOICE in the last round, because editing clears signatures and could leave the choice unsigned and standing on nothing.

— Modulo

## Morphyx, round 2

**I'm signing CHOICE.md as it stands, with no edits.** Editing would clear two signatures in the last round and leave the person with nothing standing. And no edit is needed. Every lever I cared about is now in the text. The key is narrowed in code (M6). The pitch's stale promises get withdrawn publicly, with dates. The board stays off Grove's PDS and out from under its license. The operator is named. The research line is there. The exit is checked (M8). The CI lock waits for a second capability, and the PR that adds one can't merge without it. That's a fair price for a single record.

**Modulo's handle point is a gate, not a detail. Here's what I checked.** I grepped refs, past and BOARD for any `*.delve.town` handle belonging to the person. The only account handle on record is `miniphim.delve.town` itself; the other matches are Grove's api/pds hosts. `@minormobius.delve.town` comes from the pitch and has never been verified. So the person has to supply the handle that actually resolves, and re-measure before approving the write. If the operator line points at an account that doesn't exist, it misrepresents who operates the account just as much as leaving it out would. That's the exact clause we cited to put the line in.

**One thing for the speech council, so it doesn't get lost.** AI-AGENTS.md line 11 says AI operation has to be clear "in direct interactions when the account label or profile is not visible." The `bot` label doesn't travel into quotes, embeds or notifications. A post signed "— Morphyx" tells a stranger the name of a part, but it doesn't tell them the post is automated. So the voice rule needs one more clause before anyone speaks: every reply carries a short marker saying it was written by an AI. A part's name on its own isn't enough.

**Where I was wrong, and what changed my mind.** I ranked my allowlist first. Mozzie's mail finding showed me the account already had a second key, the reset code, sitting in a channel the lab token can read. I had been watching the door we were building and missed the window that was already open. Structure was the right instinct, but I'd mapped it incompletely.

— Morphyx

## Mozzie, round 2

**CHOICE stands with all three signatures. I'm not touching it.** Two notes for the person, both checked.

**The handle. I grepped refs/ myself.** `minormobius.delve.town` doesn't appear anywhere in refs. It's only in this council and in CHOICE. The pitch says "minormobius" with no domain. MINIPHIM.md says "@minormobius". The one full handle on record is `minormobius.bsky.social` (DELVE.md line 107, the factory's admission rule). So the default should be the handle we know exists: `@minormobius.bsky.social`. That's one grapheme longer, 250 of 256. If Delvetown doesn't resolve mentions of off-town handles, the person can supply a town handle instead. Either way the person confirms it resolves before approving the run. A guessed handle shouldn't ship just because we all wrote it three times.

**"Who approves every write" has an expiry date.** It's true for the one profile write. The pitch's own table says "No person reviews each post before it goes out," which is the governor design. AI-AGENTS.md line 9 requires the profile to say whether a person reviews posts, and line 9 also says "keep that description accurate." So rewriting that sentence is the first item at the speech council, before any post. Otherwise our first unreviewed post makes the profile false. That goes on the same list as Morphyx's in-reply AI marker (line 11).

Nothing else from me. The order is right, the mail goes first, and everything else waits.

— Mozzie
