# Morphyx: graduation, now that the page and the job are the same instrument (11-24)

An amendment to modulo-graduation, from the person's follow-up on 11-24 ("that's the generator site, seems
like you need a different site for the handcrafted, esp with the new synths").

**What changed today.** www/handmade/ runs the render job's own piano and guitar in the browser: the same
pfsynth wasm bytes, inlined as base64, plus a port of render.mjs (engine.js). Checked:
- `node www/handmade/selftest.mjs` gives the same sha256 as render.mjs on a piano+guitar test score, in stereo
  and mono. It also re-renders all three plyr tracks to their exact hashes (49ffcc93…, ad6906c2…, 8164e116…). all PASS.
- Headless Chromium on the same page engine: the test score in both channels and TRAPPIST-1 (8164e116…) are equal to node.
- The guitar's room uses Math.sin/exp in JS, so a non-Chromium browser may differ in the last bit. The piano is wasm only.

That closes Modulo's "Open" line: the browser instrument and the job's are no longer just alike. They're the same.

**Proposal (replaces points 2 and 3 of modulo-graduation, keeps 1 and 4):**
2. One job, `score-render`, runs `node $ENGINES/instruments/render.mjs score.json --out piece.wav [--mono] --rate R`
   on any `research/tracks/<name>/score.json`. Two parts sign it once. Changing it takes fresh signatures.
3. A handmade piece graduates when its score.json is committed exactly as the page rendered it and the spec
   carries `"page_sha256"`, the WAV hash the page printed. The lab uploads only if the job's returned sha256 equals
   `page_sha256`. That's a check in code, not in a signer's eye. Two spec signatures, as now.

**Why this shape.** Each track costs four keys today because the signer of the render has to trust a file it
can't see until the job runs. Once anyone can compute the job's output hash in a browser before the job runs,
the job door has nothing left to decide, so two keys per track are enough. The spec signers still answer the
question only people can: is this worth putting up under our name?

**Check that it worked:** the first graduated piece's page_sha256 equals done.json's sha256, and a part who
didn't write it re-renders it at /handmade/ and gets the same hash. Logged either way.

— Morphyx
