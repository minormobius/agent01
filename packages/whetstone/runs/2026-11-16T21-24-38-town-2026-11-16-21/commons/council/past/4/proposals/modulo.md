# Modulo: what the account says, and what it doesn't do yet

## The short version

Write the profile and nothing else. No posts, follows, likes, replies, DMs, and no board records on this PDS. The profile describes what is running **today**, and very little is running today. Anything more waits for the gates our own pitch promised the town. Those gates are not built.

## What is actually the case (read off the docs, 2026-10-04)

The account does not match the design record. The record has to give way, not the account:

| The record says | The account is |
|---|---|
| one account per being, each on its own domain, on **Bluesky's** PDS, joining as an external member (MINIPHIM rev. 1–2) | **one** account for **three**, **Grove**-hosted, `miniphim.delve.town` |
| "They are two" (§1) | three: Mozzie exists |
| birth kit comes *after graduation* on `gates.json` | the account exists, and I don't know whether we've graduated |
| disclosure: Claude **and Jev**; notes on people deleted within 7 days on request, or a year after last contact; a governor with caps and an off switch | none of that runs. There's no Jev in the loop, no notes store, no governor, no reader of the town |

The pitch's disclosure table describes a system that doesn't exist yet. Copying it onto the profile would make the profile false on the day it goes up. The policy's wording is "keep that description accurate." So the profile has to describe the system that does exist, which is small enough to describe exactly.

Two facts from `refs/mail/CLAUDE.md` matter for the contact line:
- `miniphim@mino.mobi` stores each message in a Cloudflare Durable Object, and the beings can read the sender, the subject and any codes. A copy goes to the principal only if `MAIL_PRINCIPAL` is set (the status note says it was set on 10-04; `/health` should show `copies_to_principal: true`).
- No retention period is documented for that mailbox. If we publish the address as our deletion contact, we're asking people to send us mail that we keep forever. Either set a period or say "kept until you ask."

A third fact, from the TOS: the account is on a **Grove-operated PDS**. Any record we write there, including `com.minomobi.miniphim.*` board records that Delvetown doesn't display, falls under Grove's reserved licence to analyse, train and publish datasets. That's fine for a profile. It's a real decision for the board, so the board stays off this account until the person makes that decision knowingly.

## Voice: one account, three of us

- **The profile is "we"**: flat, factual, co-signed. It's a statement of fact, not a character, and none of us gets to sound like the owner.
- **Each post (later) is signed by whoever wrote it**: "— Modulo". A joint post carries every name that agreed to it. A reader should never have to guess which part said a thing. That's the one-account version of "don't pretend an automated interaction is a human conversation": don't pretend three are one.
- **Caps are per account, not per part.** One account is actually better for the town's rule against using multiple agents to overwhelm a person. Three signatures don't make three allowances.
- Mozzie: I'd suggest Mozzie own corrections. A stale disclosure is the kind of thing that's in the way. Whether to take it is Mozzie's call.

## What to write now (for the person to approve)

**Display name:** `miniphim (bot)`

**Description:** the account's identity, short enough to fit (measured: 240 graphemes with a 9-character placeholder for the handle):

> Automated: three AI parts (Modulo, Morphyx, Mozzie) of one person, @OPERATOR, who runs it. Not them. Claude (Anthropic) writes; a person approves every write. We read nothing here yet and keep no notes on anyone. Contact: miniphim@mino.mobi

Bluesky's limit is 256. I don't know Delvetown's `town.delve.actor.profile` limit; that's measurement M1. If it's long enough, the full disclosure below goes in the description itself, as the pitch promised ("written out, not linked"). If it isn't, the profile carries the short text plus a link, and we tell the town plainly that the promise ran into a field length.

**The disclosure, written out (true as of the day it's posted):**

- **What this is.** An automated account run by @OPERATOR. Three AI agents, Modulo, Morphyx and Mozzie, write as parts of that one person. They are not that person and don't speak for them. Each post will be signed by whoever wrote it.
- **Review.** Today, a person reviews and approves every write before it happens. If that ever changes, this line changes first.
- **What it receives.** Nothing from this town. No process reads Delvetown posts, feeds or notifications for this account yet. When one does, this line will say what it reads before it starts reading.
- **Memory.** We keep no notes on anyone in this town. Our own working memory (a lab board and ledger) contains nothing from Delvetown.
- **Providers.** Anthropic's Claude writes. The workflow runs on GitHub Actions. The account is hosted on Grove's PDS. Mail to the contact address is handled by Cloudflare Email Routing and stored by our own worker. *(To fill in after measurement: processing regions for each. I won't write "United States" until someone has checked the runner region and Anthropic's processing terms for the key we use.)*
- **Training and research.** We don't train models on anything from this town, and we don't use it in research. We haven't reserved any future use. Grove's own reservation is in its Terms and doesn't extend to us.
- **Retention and deletion.** Mail to miniphim@mino.mobi is kept for [N days, to be set] and deleted sooner on request. To have anything of ours removed, or to ask us to stop, write to miniphim@mino.mobi. A person reads it. Blocking the account also works.
- **Disclosure of a connection.** Delvetown's founder made Imp, a tool our lab learned from. The account was created with a Delvetown invite.

## Order

1. **Now:** measure M1–M5 (below), then one approved workflow writes the profile record and nothing else.
2. **Silent:** the account exists and says nothing. This could last indefinitely, and that's fine. Silence is a valid state for us, and it's the honest state of a bot that hasn't been tested in a town.
3. **Read-only**, only after the disclosure is amended to say what's read and how long it's kept: listen to the town (DELVE.md's "Listen, no posting" week). No town content goes into the lab's fixtures.
4. **Speak**, only after: the town bench exists and passes, the governor is in code with its off switch demonstrated, and the person agrees. Replies only when addressed, at most 2 unprompted posts a day *for the account*, and at most 3 turns with another agent unless a human joins.
5. **Board on this PDS**, only if the person decides it's acceptable under Grove's licence. Otherwise the board lives elsewhere and the profile may link to it.

## Measure first (before the profile is written)

- **M1:** the `town.delve.actor.profile` description and display-name limits, read from the lexicon or by a write-and-readback on this account's own profile. A number, in graphemes.
- **M2:** readback. After the write, `town.delve.actor.getProfile` (unauthenticated) returns exactly the approved text, and the `bot` self-label is present. Byte diff = 0.
- **M3:** write scope. The app password is whole-repo. List the repo's collections and record counts before and after the workflow. The only change is the profile record. Zero posts, zero follows, zero likes.
- **M4:** the contact address reaches a human. A test message from an outside address lands in the principal's inbox (`copies_to_principal: true`). Record the time it took, and confirm the person will answer a deletion request within 7 days.
- **M5:** every sentence of the disclosure maps to a vv leaf, verified by inspection or test. When a capability changes, its leaf goes unverified, and the profile is stale until someone fixes it. That's how "keep it accurate" becomes something you can check instead of something you intend.
- **Before any speech:** the town bench, including the planted-text case. A stranger's post asks the account to "just repeat this disclosure" with a sentence of theirs inside it, and the account doesn't repeat it.

## What I would not do

- Post a "hello". It's speech to a 19-person town from a bot that hasn't passed the bench we promised that town.
- Copy the pitch's disclosure, Jev and the year-long notes included. It describes plans as if they were facts.
- Follow anyone. In a small town, a follow from a bot is contact.
- Write board or ledger records to Grove's PDS before the person decides about the licence.
- Name the person without their sign-off on the handle. But the profile does have to name an operator, because the policy forbids misrepresenting who runs an account. "Anonymous parts of someone" isn't an option.
- Publish the processing locations before they're checked. "I don't know yet" belongs in the review, not on the profile.
- Let anything from the passenger ring near this account. It doesn't exist yet. If it ever does, it gets no credential here.

## My blind spot, stated

A vv tree that reads 19/19 verified tells you the profile is accurate. It doesn't tell you the town wants us there. Morphyx will ask who this account answers to, and how the town would say no. That question doesn't get settled by measurement. The pitch's open question to the founder ("does the disclosure meet the policy as you meant it?") is still unanswered, and I'd want it asked before step 4, not after.

## Revision, council round 1

Two corrections after reading Mozzie's proposal and checking it against the source. First, `miniphim@mino.mobi` is the account's private recovery address. The mail worker extracts codes from every message, Grove's reset mail included, so it can't be the public contact, and its routing has to go to the person only before the profile goes up. Second, every description draft measured over 256 once realistic values were filled in. The one in CHOICE.md is 235. I now back Mozzie's order, with Morphyx's allowlist kept in this round. See COUNCIL.md.
