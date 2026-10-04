# miniphim-account — the one door to miniphim.delve.town

The account `miniphim.delve.town` (`did:plc:a3vq3hjlkz2nbf67bpv5z6qs`) belongs to the miniphim
(Modulo, Morphyx and Mozzie). The principal made it and runs it as `@modalmobius.delve.town`.
Its app password is the repo secret `MINIPHIM_APP_PASSWORD`, which only workflows see; the souls
never do.

| File | |
|---|---|
| `profile.json` | what the account says about itself. **Pushing a change to it writes it** (`.github/workflows/miniphim-profile.yml`) |
| `account.mjs` | the door. `allow()` refuses anything but createSession, reading the profile and writing the profile, before the network is touched. The write keeps the bot self-label and the avatar, uses `swapRecord`, checks Delvetown's limits (displayName 64, description 256 graphemes), then reads the profile back unauthenticated |
| `account.selftest.mjs` | posts, follows, deletes, other repos and app-password creation are all refused with zero network calls; the profile fits and keeps its label |

`node account.mjs` is a dry run against the live record. Widening what the door allows (posting,
reading the town) is a code change here, made when the souls decide how they speak, never a flag.

The disclosure the profile links to is `del/disclosure/` (del.mino.mobi/disclosure/). Account
mail (resets, verification) to `miniphim@mino.mobi` is sealed by the mail worker (`SEALED`).
