# CHOICE: miniphim.delve.town

**What we'll do:** Mozzie's proposal (`proposals/mozzie.md`) as the base, with Morphyx's allowlist and retention number and Modulo's measurements and disclosure text merged in. Concretely:

- **One write, then silence.** The only record ever written in this round is `town.delve.actor.profile`. No posts, follows, likes, replies or DMs, and no board records on Grove's PDS. Silence can last indefinitely.
- **Display name:** `miniphim (bot)`.
- **Description** (249 graphemes as drafted, Intl.Segmenter; the person sets the handle, URL and address. If M1 comes back under 249, cut ", on Claude (Anthropic)" and leave the provider to the full page):
  > Automated. Run by @minormobius.delve.town, who approves every write. Written by three AI parts of them, not them: Modulo, Morphyx, Mozzie, on Claude (Anthropic). Reads nothing here; no notes. Disclosure: mino.mobi/miniphim Contact: contact@mino.mobi
- **Full disclosure:** one canonical file, published as a plain page readable without JavaScript. It's Modulo's text plus Morphyx's "who decides what we say" and "how to stop us", with these changes: contact is the public address, not the account email; contact mail is deleted 30 days after the request is resolved, keeping one line of compliance record and no body; Grove's own hosting is quoted from its PRIVACY page (DigitalOcean, US; backups 90 days); our runner and Anthropic processing regions stay blank until checked; earlier versions are listed with dates; and one line on research, replacing "we don't use it in research": "This account is run inside our operator's personal lab, an experiment in whether parts of one person can act as separate agents. Nothing from this town enters that work today. If that changes, this disclosure changes first."
- **Voice:** the profile says "we". Any later post says "I" and is signed by the part that wrote it. Caps are per account.
- **Deferred with a tripwire:** the CI lock binding the manifest to the disclosure goes into the same PR that adds a second capability, or that PR doesn't merge. The speech veto protocol is settled at the speech council, before any speech.
- **Before any reading or speech:** the founder is asked in the open whether one bot account for three parts is acceptable and whether the disclosure meets the policy. Then the town bench, including the planted-text case.

**What happens first.** Before anything touches the account, the person changes the mail. `miniphim@mino.mobi`, the account's login and recovery address, is routed to the person only, so Grove's verification and reset codes can't be read through the lab token. The public contact becomes a separate address that forwards to the person. Next, the pitch and MINIPHIM.md get each present-tense promise about this account marked current, withdrawn with a date and a reason, or not yet with its gate. Nothing is deleted. Then the write helper gets an allowlist: `putRecord` on the profile and nothing else, failing before the network is touched. Then the canonical disclosure page goes up, because the profile will point at it. Then the measurements: M1 (field limits), MZ4 (the disclosure URL, fetched without JavaScript, returns every item the policy lists: what we receive, memory, providers, locations, retention, deletion contact, research use, who reviews), MZ3 (one hand-written copy of the disclosure; everything else links to it), M6 (allowlist throws on post, follow and delete), MZ1 (a test Grove mail reaches the person, and `client.mjs miniphim codes` returns nothing for it), MZ2 (an outside test message to the public contact reaches the person within a day), and M8 (the repo exports as a CAR). Only then does the person approve one run that writes the profile, followed by M2 (an unauthenticated readback matches byte for byte, `bot` label present) and M3 (the repo diff shows only the profile record changed). Then nothing more.

Signed: Mozzie

Signed: Modulo

Signed: Morphyx
