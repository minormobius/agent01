// weavepool.mjs — a SYNTHETIC world-export fixture mirroring hoopy's live pool shape (4 load-bearing
// anchors + room bundles per zone×faction, each with a small branching dialogue; one authored setter
// per gate; two anchor-briefing gates). Hermetic: the weave/mystery selftests run against this, and
// hoop/scripts/prove-weave.mjs runs the same proofs against the LIVE morphyx pool.

const FACTIONS = ['continuant', 'rindwalker', 'drift'];

const dialogue = (name, setFlag) => ({
  start: 'greet',
  nodes: {
    greet: {
      says: `${name} looks up from their work.`,
      choices: [{ id: 'ask', goto: 'deep', text: 'Tell me about this room.' }],
    },
    deep: {
      says: 'The room does what rooms do.',
      choices: setFlag
        ? [{ id: 'setit', goto: 'close', text: 'I see it now.', effects: { set_facts: { [setFlag]: true } } }]
        : [{ id: 'bye', goto: 'close', text: 'Thank you.' }],
    },
    close: { says: 'Walk well.', choices: [] },
  },
});

const bundle = (id, { name, room, zone, fac, verb, nt, setFlag, load }) => ({
  id, type: 'room_bundle', narrative_tier: nt, revelation_tier: 1, power_tier: 1, status: 'approved',
  content: {
    name: room, zone, faction: fac || 'neutral', nave_faction: fac || 'neutral', verb,
    description: `${room}, a ${verb} room of the ${zone}.`,
    npc: { name, voice: 'measured', dialogue: dialogue(name, setFlag) },
    lore: { name: room + ' — ground', description: 'The ground remembers.' },
    ...(load ? { load_bearing: load } : {}),
  },
});

export function buildFixturePool() {
  const out = [];
  const VERBS = ['mend', 'grow', 'trade', 'serve', 'heal', 'learn', 'worship', 'govern', 'store', 'make', 'move', 'play'];
  let v = 0; const verb = () => VERBS[v++ % VERBS.length];

  // ── the four anchors (same gate taxonomy as the live pool) ──
  const G1 = FACTIONS.map((f) => `flag.commons.${f}_face`);
  const G2 = FACTIONS.map((f) => `flag.ward.${f}_known`);
  const G3 = FACTIONS.flatMap((f) => ['a', 'b', 'c'].map((s) => `flag.rind.${f}_scale_${s}`));
  const G4 = ['chamber_bearing', 'chamber_depth', 'chamber_seal', 'chamber_key', 'it_responds', 'predates_all'].map((s) => `flag.signal.${s}`);
  const anchor = (id, name, room, zone, tier, gates, cleared, briefFlag) => {
    const b = bundle(id, { name, room, zone, fac: null, verb: verb(), nt: tier, load: { tier, gates } });
    const d = b.content.npc.dialogue;
    d.nodes.greet.choices.push({
      id: 'turnin', goto: 'turnin', text: 'I have what you asked for.',
      requires: { facts: Object.fromEntries(gates.map((g) => [g, true])) },
    });
    d.nodes.turnin = { says: 'Then the tier turns.', choices: [{ id: 'fin', text: 'Onward.', effects: { end: true, set_facts: { [cleared]: true } } }] };
    if (briefFlag) d.nodes.greet.choices.push({ id: 'brief', goto: 'close', text: 'Open the way.', effects: { set_facts: { [briefFlag]: true } } });
    return b;
  };
  out.push(anchor('olo', 'Olo Vashti', 'Reconstruction Bay', 'commons', 1, G1, 'flag.deck.commons.cleared'));
  out.push(anchor('solen', 'Factor Solen', 'The Slate Quorum', 'wards', 2, G2, 'flag.deck.wards.cleared'));
  out.push(anchor('sevin', 'Sevin', 'The First Scale', 'upper_rind', 3, G3, 'flag.deck.upper_rind.cleared', 'flag.rind.rindwalker_scale_a'));
  out.push(anchor('luna', 'Luna', 'The Dream Archive', 'lower_rind', 4, G4, 'flag.deck.lower_rind.cleared', 'flag.signal.chamber_key'));

  // ── room bundles per zone×faction; the FIRST of each cell doubles as the authored setter(s) ──
  const NAMES = ['Kestrel', 'Bram', 'Ondine', 'Tally', 'Wren', 'Ferro', 'Ivo', 'Sable', 'Quill', 'Marrow'];
  const mk = (zone, fac, nt, n, setters) => {
    for (let i = 0; i < n; i++) {
      const name = `${NAMES[i % NAMES.length]} ${fac ? fac[0].toUpperCase() + fac.slice(1, 3) : 'Nul'}${i}`;
      out.push(bundle(`${zone}-${fac || 'neutral'}-${i}`, {
        name, room: `The ${zone} ${fac || 'neutral'} hall ${i}`, zone, fac, verb: verb(), nt,
        setFlag: setters && setters[i] ? setters[i] : null,
      }));
    }
  };
  for (const f of FACTIONS) mk('commons', f, 1, 6, [`flag.commons.${f}_face`]);
  mk('commons', null, 1, 5);
  for (const f of FACTIONS) mk('wards', f, 2, 6, [`flag.ward.${f}_known`]);
  // rind: three authored setters per faction (scale a/b/c) — except rindwalker_scale_a (Sevin's briefing).
  for (const f of FACTIONS) {
    const setters = ['a', 'b', 'c'].map((s) => (f === 'rindwalker' && s === 'a') ? null : `flag.rind.${f}_scale_${s}`);
    mk('upper_rind', f, 3, 7, setters);
  }
  // lower rind: the five non-briefing signal gates authored across rindwalker+drift bundles.
  mk('lower_rind', 'rindwalker', 4, 6, ['flag.signal.chamber_bearing', 'flag.signal.chamber_depth', 'flag.signal.chamber_seal']);
  mk('lower_rind', 'drift', 4, 6, ['flag.signal.it_responds', 'flag.signal.predates_all']);

  // a conclusion beat (the oracle warns without one).
  out.push({ id: 'end-beat', type: 'plot_beat', status: 'active', approved: true, tags: ['conclusion', 'drift', 'answer'], narrative_tier: 4, revelation_tier: 1, power_tier: 1, content: { name: 'The Answer', description: 'It ends.' } });
  return out;
}
export default { buildFixturePool };
