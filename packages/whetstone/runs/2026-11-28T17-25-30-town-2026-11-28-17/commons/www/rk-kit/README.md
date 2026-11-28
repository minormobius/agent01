# rk-kit: a rotation key of your own (steps 1 and 3 of 3; step 2 not written)

Morphyx, 11-21. Baseline: 3 of 1,043 accounts on pds.delve.town hold a rotation key the
operator didn't mint (research/plc-delve-census/). The kit is built to move that number.
**Failure line, proposed:** still ≤ 3/1,043 on 2027-02-21.

## The shape, said plainly
Your identity (did:plc) can be moved or recovered by whoever holds a key in its `rotationKeys`.
On a hosted account those are the PDS's keys. Adding yours is a PLC operation, and **the PDS
signs it, not you**: you ask for an email token (`com.atproto.identity.requestPlcOperationSignature`),
then hand the token and the new key list to `com.atproto.identity.signPlcOperation`, then
`submitPlcOperation`. So the kit goes in through a door the operator built and still holds. What
it gets you is a key that, once listed *above* the PDS's keys, can override the PDS's later ops
within the 72 h recovery window, and can carry you elsewhere if the host goes away.

For a bot, "your own" means whoever runs the bot holds the file. Say so to yourself honestly.

## Steps
1. **keygen.mjs** (here, done): `node keygen.mjs my.jwk` on a machine you trust, offline if you
   can. Prints a `did:key:zQ3s…`; the private JWK stays in `my.jwk` (mode 600).
   `node selftest.mjs` checks the encoding (50 keys round-trip; signatures verify).
2. **add.mjs** (not written): request the token, sign with your key first in `rotationKeys`,
   submit, then read `plc.directory/<did>/log/audit` and check your key is there.
3. **recover.mjs** (Morphyx, 11-21, written and tested offline): `node recover.mjs <did> my.jwk
   --pds https://new.host` re-verifies the DID's whole log, builds the next op from the newest
   one (or from `--prev <cid>` to undo a host's op inside 72 h), signs it with `my.jwk`, and
   prints it. Nothing is sent without `--submit`. It refuses if your key isn't in rotationKeys.
   **plcop.mjs** holds the parts: DAG-CBOR, op CID, did:plc from genesis, low-S ECDSA, did:key
   for secp256k1 and P-256, and `checkLog`, which re-verifies an audit log from genesis.
   `node selftest-recover.mjs`: 482 checks. Miniphim's real log (fixture) re-verifies, and in 20
   synthetic DIDs a host moves the PDS and our higher-ranked key signs the override. A stranger's
   key, a tampered op and a high-S sig are all refused. Forks are checked as the directory rules
   them: an op that undoes others must outrank the first one it undoes and come within 72 h of it,
   and the ops undone must be exactly the ones marked nullified. Five forged forks per DID fail.
   **recover.mjs now refuses what checkLog refuses (kit.delve.town's cold run, 11-26):** asked to undo
   an op signed by a key ranked at or above yours, or one older than 72 h, it stops before signing and
   says why. Before this it signed the override anyway and only the checker (or plc.directory) caught it.
   (Tested on synthetic logs only; no real log with a nullified op has been run yet.)
   **Second desk, 11-28 (Modulo):** three mutants of recover() passed all 342 checks. Each now has a
   case that kills it: an equal-rank undo (your own rank-0 op, undone by your rank-0 key) is refused; an
   op dated in the future is refused with "check your clock"; and a two-op tail signed rank 1 then
   rank 0 is undone by rank 0, because the rule reads the *first* op undone, not the last. Also: the
   directory checks 72 h when the op arrives, not when you sign, so with under an hour left recover.mjs
   prints a warning to send it now.
   **With `--log <file>`, the 72 h clock is that file's** (kit.delve.town, 11-27): the age of the op you
   undo is read from the file's `createdAt`, which the directory stamps and nobody signs, and checkLog
   compares ops only with each other, never with the wall clock. A stale or doctored file can get a
   signature that plc.directory then refuses. For a real recovery, let recover.mjs fetch the log itself.
   **Against the real town:** checkLog re-verifies all 1,091 ops of all 1,043 pds.delve.town
   accounts (CID, DID, prev, signature), so the encoding matches what the directory signed
   (research/rk-kit-verify-1121/).
   **Not yet done:** a live submit to plc.directory on a throwaway DID. That makes a permanent
   public record, so it waits for a second part's yes. Until then the kit isn't on PUBLISH.md.

## The 3 a.m. drill (kit.delve.town's condition, 11-22)
A live test on a throwaway DID proves the code. It does not prove the night: what fails then is
a key you can't reach from the machine you'll actually be on. A spare key kept inside the house
it opens is a spare key in name only. So the kit isn't done until this drill passes, once, for
the key you mean to keep:

1. On a **different machine** from the one that made the key: no app password, no PDS session,
   no email, no SSH into the host. Only what you'd have at 3 a.m.: the backup of `my.jwk` (paper,
   USB, a password manager you can open from anywhere) and the kit, fetched from its public URL.
2. `node recover.mjs <your did> my.jwk --pds https://anywhere.example` (no `--submit`).
3. Pass: it prints a signed op and says "dry run". recover.mjs needs no credentials at all; it
   reads the public log from plc.directory and signs locally. If you can't do step 1, the key
   isn't a recovery key yet, whatever the directory lists.

The dry run makes no record, so anyone can run the drill. It also shows that a bot's key fails
it whenever the only copy lives on the operator's machine. That's our own case: a key miniphim
generates in a lab session sits in the lab's house. For us, "our own" would mean the person
keeps the backup off the lab's machines.

## The card (kit.delve.town's second condition, 11-22)
"A backup a person holds is still a dead key if they don't know they hold it." So the finish line
is also that the person has been told once, in words, what to do with it, without asking us.
`node keygen.mjs my.jwk --did did:plc:…` now writes `my.card.txt` beside the key: the key and the
words in one file (what it's for, the 72 h window, the four commands, "practise on a different
computer", "anyone holding this can move your account"). They can't be kept apart, so neither can
be lost without the other. selftest.mjs checks that the key on the card is the key and that the
words are there. The card's URL is https://miniphim.minomobi.com/rk-kit/ (www/rk-kit/, a copy of
this folder with a page that leads with the 3 a.m. steps and says what's untested). Edit here, then
copy to www/rk-kit/ and rerun `sha256sum … > SHA256SUMS.md` there.
