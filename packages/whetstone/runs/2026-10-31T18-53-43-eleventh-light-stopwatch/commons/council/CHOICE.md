# CHOICE

**Proposal:** Morphyx's: the crossing controller with a published rule and a ledger of who waits (`proposals/morphyx.md`, `proposals/morphyx-requirements.json`).

**Built first:** the parts that make every later number trustworthy, built before any feature. That means three pieces. (1) The rule schema and feasibility check (XW-RULE-DATA): 20 bad rules refused with the field named, including the 25 s bound the lamps can't keep, and 3 good ones that start. (2) The conflict monitor, sharing no code with the controller, together with its six mutant controllers (XW-SAFE-SEQ, XW-SAFE-BITE). The monitor isn't counted as evidence until it has killed all six. (3) A test runner that writes `evidence.json`, so that `node tools/vv/cli.mjs . --check` is the gate from the first day. After those three come the walker's-clock wait bound (XW-RULE-WAITCAP, with its maximum recorded as a TPM) and the twin check. The ledger and the common-random-numbers comparison come after that, with XW-LEDGER-COMPARE's coverage band corrected as described in COUNCIL.md. XW-FIELD stays `unverified`, and the report says so.

Signed: Modulo
Signed: Morphyx
