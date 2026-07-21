// mappa/civ/org.js — institutions with insides (Phase IV of civ/STRATEGY.md).
//
// Every civ institution gets an ORG ADDRESS — the parameters that site it as a full
// rite/org organisation — and every great person becomes a full rite/org PERSON
// (craft/drive/wit triad, temperament cast, one of hoop's 13 civic vocations, quirks,
// output + leadership). Nothing here is simulated inside civ: the engine emits the
// address, the org engine generates the hierarchy on demand at rite.mino.mobi/org/.
//
// The org-seed convention extends the suite's siteSeed (`${world}:${city}:${cell}`):
//   institution org seed = `${world}:${seatName}:${seatCell}:${kind}${instId}`
// The engine can't know the `world` request string (it lives at the API layer), so it
// emits the parts (seatName, seat, kind, id) plus this module's {vertical, shape};
// consumers (develop.html, or anything else) compose the seed. Same seed on any
// machine → the same org chart, forever — a 9th-millennium temple hierarchy is a
// permanent address.
//
// Person determinism: (civSeed, agentId) alone → the same person, whatever they led.

import { makePerson } from '../../rite/org/person.js';

// civ institution kind → rite/org vertical (rank ladder + title vocabulary) and
// shape (topology). States are rank ladders (feudal), firms/guilds corporate,
// warbands military cells.
export const INST_ORG = {
  state:   { vertical: 'feudal',   shape: 'tall' },
  firm:    { vertical: 'corp',     shape: 'pyramid' },
  guild:   { vertical: 'corp',     shape: 'flat' },
  warband: { vertical: 'military', shape: 'cellular' },
};

// belief register → org vertical/shape: folk faiths are cellular monastic webs,
// organized religion is an ecclesiastic ladder, philosophies/ideologies academic.
export const BELIEF_ORG = {
  folk:       { vertical: 'monastic',     shape: 'cellular' },
  temple:     { vertical: 'ecclesiastic', shape: 'tall' },
  scripture:  { vertical: 'ecclesiastic', shape: 'tall' },
  philosophy: { vertical: 'academic',     shape: 'flat' },
  ideology:   { vertical: 'academic',     shape: 'wide' },
};

// A great person as a full org person. rankIdx 0 = they sat at an apex (they are in
// the chronicle because they led an institution to eminence), so vocation resolves
// to 'govern' and power leans high — the org engine's promotion-correlates-with-
// capability prior, which is exactly what "great" selected for.
export function civPerson(civSeed, agentId, kind) {
  const vertical = (INST_ORG[kind] || INST_ORG.state).vertical;
  return makePerson(
    { id: 'civ' + agentId, rankIdx: 0 },
    { seed: 'civ:' + civSeed + ':p' + agentId, vertical, rankCount: 6 },
  );
}
