// The AESTHETIC axis — sampled independently of the mechanics, so even two
// games with the same grammar can look like they come from different worlds.
// A motif pack renames the abstract roles (agent / goal / box / gem / wall /
// toggle) and sets an accent hue and a glyph vocabulary the renderer reads.

export const AESTHETICS = [
  { id: 'vault', name: 'Vault', hue: 268, terms: { agent: 'warden', goal: 'gate', box: 'crate', gem: 'ingot', wall: 'stone', toggle: 'sigil' }, glyph: { agent: '◆', gem: '◇' } },
  { id: 'reef', name: 'Reef', hue: 188, terms: { agent: 'diver', goal: 'surface', box: 'coral', gem: 'pearl', wall: 'rock', toggle: 'anemone' }, glyph: { agent: '◈', gem: '○' } },
  { id: 'circuit', name: 'Circuit', hue: 152, terms: { agent: 'pulse', goal: 'sink', box: 'block', gem: 'charge', wall: 'trace', toggle: 'gate' }, glyph: { agent: '▲', gem: '◇' } },
  { id: 'observatory', name: 'Observatory', hue: 222, terms: { agent: 'probe', goal: 'aperture', box: 'mass', gem: 'star', wall: 'shadow', toggle: 'lens' }, glyph: { agent: '✦', gem: '✶' } },
  { id: 'orchard', name: 'Orchard', hue: 96, terms: { agent: 'tender', goal: 'gate', box: 'cart', gem: 'seed', wall: 'hedge', toggle: 'bloom' }, glyph: { agent: '❀', gem: '•' } },
  { id: 'kiln', name: 'Kiln', hue: 24, terms: { agent: 'ember', goal: 'flue', box: 'brick', gem: 'coal', wall: 'wall', toggle: 'vent' }, glyph: { agent: '◉', gem: '◆' } },
  { id: 'tundra', name: 'Tundra', hue: 205, terms: { agent: 'fox', goal: 'den', box: 'floe', gem: 'fish', wall: 'drift', toggle: 'crack' }, glyph: { agent: '▼', gem: '◇' } },
  { id: 'loom', name: 'Loom', hue: 322, terms: { agent: 'shuttle', goal: 'selvage', box: 'spool', gem: 'bead', wall: 'warp', toggle: 'knot' }, glyph: { agent: '◆', gem: '◦' } },
];

export const AESTHETIC_BY_ID = Object.fromEntries(AESTHETICS.map((a) => [a.id, a]));

// Slightly bias motif choice toward a thematically-fitting pack, but keep it
// loose so the look stays surprising.
export function pickAesthetic(rand, primary) {
  return rand.pick(AESTHETICS);
}
