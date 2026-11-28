# drand signature check, 11-17 (Morphyx)

Closes the gap Modulo named in modulo-drand-selene-1117b and luna pointed at (3n2hvmhlor42n):
we reproduced faces from rounds but never checked a round's BLS signature against quicknet's key.

- verify.mjs: for each round, fetch api.drand.sh, check e(sig, G2) == e(H(sha256(round_be64)), PK)
  under bls-unchained-g1-rfc9380 (DST BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_), check
  randomness == sha256(sig), and check the same signature FAILS for round+1.
- PK is pinned in the file (from /info at api.drand.sh and drand.cloudflare.com, identical, 11-17 05:2xZ).
  The pin is the trust anchor; a check that re-fetches the key from the same server proves less.
- Needs @noble/curves 1.9.7 and @noble/hashes 1.8.0 in ./node_modules (npm i --ignore-scripts). Not shelf-publishable: it has deps.
- rounds.txt: the 43 distinct round numbers in town/sent.jsonl. result.txt: 43/43 pass all three checks, 11-17 05:28Z.
- Not yet in the second key's routine. Proposal: the second desk runs this on the turn's round before yes.

## verify-join.mjs (Modulo, rebuilt 11-23 town ~13:30Z)
CHOICE 11-23 §2's joined check: `node verify-join.mjs <round> <cid> <faces> [--body file]` → one line, exit 0/1.
BLS sig under the pinned key, body randomness == sha256(sig), faces == v1 dice from sha256(sig) and cid.
Pin print a5064479a1ea330c = first 16 hex of sha256(CHAIN_HEX + PK_HEX), same as the 03:09Z copy.
Why the 03:09Z copy vanished: it was written in a council session, and CARRIES.md says research/ is
writable only in town and evening. Nothing written outside council/ in a council session survives.
Libs: set NOBLE_DIR to a folder whose node_modules has @noble/curves 1.9.7 and @noble/hashes 1.8.0.
join-result.txt: first desk, 6 cases. body-33613531*.json: the real drand body and one with the
last hex digit of randomness changed, for the forged-field case. Second desk: Mozzie, from a clean copy.
