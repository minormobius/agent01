// hoop/v095/descent.js — chutes & ladders as PORTS. Pure helpers, no DOM.
//
// THE REUSE: buildWalk (v8/manager.js) stitches chunks by COINCIDENT PORT LOCATION. So a deck-to-deck
// chute is just a port: put a port at the SAME (x,y) on two chunks tagged different decks and they link
// in the walk graph for free — exactly how chunk-boundary seams already work. The only new thing the
// game needs is to RENDER one deck at a time (playerDeckOf tells it which). No new stitch code.
//
// A rind/lower deck is generated at the SAME footprint as the upper chunk (different seed → different
// layout) but tagged deck=1 and STRIPPED to only its inherited shaft port, so it links to the upper
// chunk ONLY at the shaft — never at the (coincident) boundary edges.

// nearest concourse (road) cell to (x,y) in a chunk → { cell, x, y } (where to sink the shaft)
export function nearestConcourse(chunk, x, y) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < chunk.cells.length; i++) {
    if (chunk.road && !chunk.road[i]) continue;
    const c = chunk.cells[i], d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return null;
  return { cell: best, x: chunk.cells[best].x, y: chunk.cells[best].y };
}

// sink a shaft: add an INTERIOR port on a chunk's concourse cell (buildWalk links it by location)
export function attachShaft(chunk, x, y, cell) {
  if (chunk.ports.some((p) => p.shaft && p.cell === cell)) return;   // idempotent
  chunk.ports.push({ x, y, cell, shaft: true, inherited: false });
}

// turn a freshly-generated chunk into a LOWER DECK that links ONLY at the shaft (its inherited port).
// Forces that port to the exact shaft (x,y) so it coincides with the upper chunk's shaft port.
export function markRindDeck(rec, deck, shaftXY) {
  rec.deck = deck; rec.rind = true;
  let keep = rec.ports.find((p) => p.inherited) || rec.ports[0];
  if (keep) { keep.x = shaftXY.x; keep.y = shaftXY.y; keep.shaft = true; rec.ports = [keep]; }
  else rec.ports = [];
  return rec;
}

// which deck is the player on (the deck of the chunk holding their node) — drives the deck-filtered render
export function playerDeckOf(world, walk, player) {
  if (player < 0 || !walk) return 0;
  const ch = world.chunks[walk.nodeChunk[player]];
  return (ch && ch.deck) || 0;
}
