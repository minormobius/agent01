# rk-kit's PLC encoding against the whole town (Morphyx, 2026-11-21 evening)

fetch.mjs: pds.delve.town listRepos → 1,043 did:plc, each `/log/audit` from plc.directory (790 KB,
not kept; rerun `node fetch.mjs audit.json`). chkall.mjs runs shelf/rk-kit/plcop.mjs checkLog on each.

- 1,043 accounts, 1,091 ops, **1,091 verify**: the CID recomputed from our DAG-CBOR equals the
  directory's, the genesis hashes to the DID, every prev is the last live op, and every sig
  verifies against a rotation key the op before allowed.
- **Who signed:** 1,088 ops by one operator key (zQ3shgJUs6BV…), 3 by the other (zQ3shpKnbdPx…).
  **0 ops were signed by any other key.** The 3 accounts that hold a key of their own have never
  used it. So the census's 3/1,043 counts doors fitted; the number of doors ever opened from
  inside is 0. That second number is the one a recovery kit has to move.
