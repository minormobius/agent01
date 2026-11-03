# commit — math.mino.mobi/commit/

Coin flipping by telephone (Blum 1981), and the counting argument that no
commitment both hides and binds perfectly. A member of the `math` surface
(registry dir `geometry/`); deployed by `.github/workflows/deploy-math.yml`,
which stages this directory from the repo root.

## Files

| Path | What |
|---|---|
| `index.html` | the page: stage (mirror histogram) over a four-tab panel, the pack's shell |
| `commit.js` | **the only copy of the maths**: SHA-256, the real commit/open, the toy schemes, the census, the two attacks |
| `commit.selftest.mjs` | imports `commit.js` unchanged; `node commit/commit.selftest.mjs`, ~2 s, 11,170 checks |

## What the page claims, and where each claim is checked

| Claim | Checked by |
|---|---|
| The SHA-256 is correct | NIST vectors (incl. one million `a`) and 300 random inputs against node's `crypto`, every padding boundary |
| An honest opening verifies; the other bit, or a one-bit nonce change, does not | 400 random commitments |
| Blum's coin is fair if either side is uniform | exhaustive over deterministic strategies |
| **p ≥ 1 − δ for every scheme** | 3 schemes × k 1..8 × r 0..9 × 4 salts, plus 2,000 random functions |
| Σ min(D₀, D₁) = 1 − δ | same sweep, to 1e-12 |
| shift with r ≥ k: δ = 0, p = 1. tag: δ = 1, p = 0 | same sweep, exactly |
| A longer nonce hides better on the truncated hash | δ at r = 12 below δ at r = 4, and below 0.05 |
| Bob's brute force sees exactly what the census says | every c for four (k, r) sizes, all schemes |
| A double opening costs √(π·2ᵏ) hashes on average | measured at k = 8, 12, 16 (within 12%); every pair found re-verified |

## Things not to break

- **Measures come from counts, never from formulas.** `measure()` computes δ,
  the overlap and p independently from D₀ and D₁. The selftest's
  `Σmin = 1 − δ` check only means something because the two are computed
  separately; don't derive one from the other.
- **The real commitment's message format is fixed**: `"math.mino.mobi/commit v1" ‖ bit byte ‖ 16-byte nonce`.
  The page's "you recompute the hash" line calls `digest()`, which is the
  same function `opens()` uses, so the shown hash is the one being checked.
- **`toyHash` takes the top k bits of the first word**, so k ≤ 32. The page caps k at 10.
- The cheating Alice opens `1 XOR call`. When that happens to equal her real
  bit she is honest by accident and the opening is valid; that is correct, not a bug.

## Sources on the page

Blum, "Coin flipping by telephone", CRYPTO 1981. Pedersen, "Non-interactive and
information-theoretic secure verifiable secret sharing", CRYPTO 1991 (named, as
the real-world cousin of the shift scheme).
