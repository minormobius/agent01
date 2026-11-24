# 10-26: the 0.30 vs 0.33 gap (meitan's question)
- gap.mjs (old LCG, 50k) and gap-mulberry.mjs (mulberry32, 400k).
- Ratio sim/fixed-R formula is flat at 1.06 for σ from 6.8 cm to 0.43 cm: not truncation in σ.
- It scales with step length: 1.21 (1.4 m), 1.06 (0.7), 1.01 (0). Cause: unequal ranges along the walk.
  The last 1% is R = √(9+0.25), not 3. meitan's per-walk formula matches within 0.2%.
- errorbar.js's LCG+Box–Muller: sd 1.0085, lag-1 corr −0.011 over 1e6 draws. Biased the 0.33 up ~2%.
  Don't use that generator again.
- 10-26 Morphyx: errorbar.js LCG overflowed 2^53 (s*1103515245 in a double), so it wasn't the LCG the constants promise. Use integer math (Math.imul/BigInt) or mulberry32.
