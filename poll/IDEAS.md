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

## 2. Reputation-Staked Prediction Markets

Prediction markets where participants stake **reputation** (not money) on outcomes. Positions are anonymous; resolution outcomes flow back to the user's DID as a public accuracy score without revealing individual bets.

**Key mechanism**: One-way reputation bridge.
- Blind-signed token scoped to a market → anonymous position
- Market resolves → worker computes outcome per token
- Token holder redeems reputation delta via ZK proof ("I hold a winning token" without revealing which)
- DID's public reputation record increments

**Why it matters**: No money = no gambling regulation. Pure epistemic skin in the game. Track records are worth more than money to analysts, researchers, VCs, and policy experts.

**Biotech application**: "Will this Phase III read out positive?" — weighted by predictor accuracy, resolved against reality. The Mino Times runs it as an editorial product.

**New primitive needed**: Zero-knowledge reputation redemption — proving you hold a resolved token without revealing which one. This is the main unsolved piece.

## 3. Anonymous Tipping / Whistleblowing

Verified ATProto users submit tips to journalists. The journalist knows the source has a real account with real reputation, but can't identify them. Directly applicable to The Mino Times (`tips@minomobi.com`) for biotech insiders leaking trial data or regulatory concerns.

## 4. Anonymous Peer Review

Researchers post preprints on ATProto. Verified academics submit blind-signed reviews. Reviewer is provably real, but unidentifiable. Solves accountability-without-retaliation.

## 5. Anonymous Governance / Voting

ATProto-verified voting on proposals where the vote is unlinkable to the voter but provably one-per-member. Works for DAOs, unions, faculty senates, any group that needs private ballots with membership verification.

---

*All of these share the same core stack: ATProto OAuth for identity verification, RSA blind signatures for unlinkability, scoped tokens for sybil resistance. The poll app is the proof of concept.*
