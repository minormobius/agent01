# packages/attractor

See `README.md` for the modules. Before changing it:

- **Everything is a function of (seed, t).** A character is its seed plus overrides; points hash from
  their index, orbits are read by index from clouds integrated once. No running random in a draw.
- **A part's attractor is laid on its principal axes**, the longest along the bone, and scaled to the
  part's radius × `reach`. The right side reads its attractor mirrored (z negated), so the two sides
  match without being copies.
- **Regenerate the bestiary with the tool**, never by hand: `node packages/attractor/tools/bestiary.mjs
  240` (~90 s). Then `node scripts/sync-dataviz.mjs --write` for the studio's copy.
- The studio selftest checks the bestiary (every entry strange), that a seed makes the same character
  every time, and that every point lands finite.
