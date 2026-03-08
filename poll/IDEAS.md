# Anonymous Credential Stack — Future Applications

The blind-signature-over-ATProto-OAuth stack built for anonymous polling is a general-purpose **anonymous credential system**. These are candidate applications that reuse the same core primitive: "prove you're a real ATProto user without revealing which one."

## 1. Anonymous Imageboard (Sybil-Resistant 4chan on ATProto)

Anonymous posting where every poster is provably a unique real ATProto user, but identity is unlinkable to posts. Solves the sock puppet / bot flood problem that plagues anonymous forums.

**Key mechanism**: Scope the blind signature to control anonymity granularity:
- Thread-scoped → anonymous thread-local identity (unforgeable, like 4chan thread IDs but real)
- Board-scoped → persistent anon within a topic
- Time-window-scoped → daily/weekly rotating anonymous identity
- Global → pure ephemeral anonymity

**What's already built**: OAuth flow, blind signature issuance/verification, token scoping, Cloudflare Worker backend. The imageboard is mostly a frontend problem.

## 2. Prediction Markets — Fit Analysis

### What the blind signature stack gives you: nothing useful here

Prediction markets want **persistent, scored identity** — the opposite of anonymity. A pseudonym making public predictions and being graded on accuracy is just a leaderboard. No cryptography required. The blind signature primitive solves identity-hiding, but predictions need identity-accumulation.

### The ZK reputation bridge is real but expensive

Connecting anonymous bets to public scores without revealing which bet was yours requires ZK proofs (Semaphore-style Merkle membership proofs). This is shipping code in Ethereum's ecosystem but porting it to ATProto is a real cryptographic engineering project, not a weekend integration. And you'd be importing the same complexity class as blockchain development.

### The "reputation token" problem

A reputation score stored on your PDS is structurally a self-attested token — worthless. Third-party attested = centralized token issuer. Consensus-attested = blockchain. There is no door number four. You'd be reinventing cryptocurrency from first principles.

### What actually works with the existing stack

The poll system can run **prediction polls** without any new primitives:
1. Create a poll: "Will Cepheid's GI panel hit $X revenue by Q3?" with time-bound resolution
2. Anonymous, sybil-resistant voting (already built)
3. Track poll outcomes vs reality on a public scorecard page
4. Editorial product: "Our readers predicted X at Y% confidence — here's what happened"

This is **crowd wisdom aggregation**, not individual reputation tracking. Different product, but it ships today with zero new crypto. The blind signatures still do their job (anonymous votes), and the resolution layer is just a static page comparing predictions to outcomes.

### If you really wanted individual reputation

For pseudonymous users (not anonymous), the answer is simpler: make predictions publicly from your handle, get scored publicly. That's Metaculus/Manifold. ATProto adds Bluesky distribution and the existing eligibility gating (followers, mutuals, lists) for quality control, but no novel crypto. The pseudonym IS the reputation container.

## 3. Anonymous Tipping / Whistleblowing

Verified ATProto users submit tips to journalists. The journalist knows the source has a real account with real reputation, but can't identify them. Directly applicable to The Mino Times (`tips@minomobi.com`) for biotech insiders leaking trial data or regulatory concerns.

## 4. Anonymous Peer Review

Researchers post preprints on ATProto. Verified academics submit blind-signed reviews. Reviewer is provably real, but unidentifiable. Solves accountability-without-retaliation.

## 5. Anonymous Governance / Voting

ATProto-verified voting on proposals where the vote is unlinkable to the voter but provably one-per-member. Works for DAOs, unions, faculty senates, any group that needs private ballots with membership verification.

---

*All of these share the same core stack: ATProto OAuth for identity verification, RSA blind signatures for unlinkability, scoped tokens for sybil resistance. The poll app is the proof of concept.*
