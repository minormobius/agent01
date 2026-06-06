// ─────────────────────────────────────────────────────────────────────────────
// data.js — the sixteen geomantic figures, with an ORIGINAL English redaction of
// their significations after the Latin geomancers (Heinrich Cornelius Agrippa,
// "Of Geomancy"; the "Fasciculus Geomanticus", 1687 — Robert Fludd, Henri de
// Pisis, Alfakini). This is the canonical home of the text.
//
// PROVENANCE — read this honestly. The figures, their names, and their fourfold
// line-patterns are standard. The significations here are our own modern English,
// redacted from the Western Latin tradition cited above — the fetchable "cousin"
// of the older Arabic ʿilm al-raml. They are a working stand-in: the intended spine
// is a faithful translation of al-Zanātī's "Kitāb al-Faṣl fī uṣūl ʿilm al-raml",
// which we will set beside the Arabic, term by term, once a clean source is in hand.
// Element schemes differ between authors; where we give one, the note flags it.
// CC BY-SA 4.0. A transparent working text — corrections welcome.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const GEOMANCY = {
  meta: {
    title: 'The Sixteen Figures',
    license: 'CC BY-SA 4.0',
    method: 'A figure is four lines, top to bottom Fire · Air · Water · Earth; a line is single (•, active, an odd tally) or double (• •, passive, even). The significations below are an original English redaction after the Latin geomancers, pending a faithful translation of al-Zanātī’s Arabic — the spine to come.',
    sources: [
      { label: 'Agrippa, “Of Geomancy” (tr. R. Turner, 1655)', host: 'princeton.edu/~ezb/geomancy', url: 'https://www.princeton.edu/~ezb/geomancy/agrippa.html' },
      { label: 'Fasciculus Geomanticus (1687) — Fludd, de Pisis, Alfakini', host: 'archive.org', url: 'https://archive.org/details/b3299753x' },
      { label: 'al-Zanātī, Kitāb al-Faṣl fī uṣūl ʿilm al-raml — the spine to come', host: 'forthcoming', url: 'https://en.wikipedia.org/wiki/Arabic_geomancy' },
    ],
  },
  // rows: [Fire, Air, Water, Earth]; 1 = single (active/odd), 2 = double (passive/even)
  figures: [
    { la:'Via', en:'The Way', rows:[1,1,1,1], planet:'Moon', element:'Water', nature:'mixed',
      sig:'The road, and motion along it: journeys, change, news that travels, the turning of a course. It carries things from one state to another — favourable for travel and for what must move or alter, contrary to whatever needs to stand still.',
      note:'Via, “the way / the road” — all four lines single, a single track of points; the Arabic is Ṭarīq (طريق), the road. Ruled by the Moon, ever-changing.' },
    { la:'Cauda Draconis', en:'The Tail of the Dragon', rows:[1,1,1,2], planet:'Descending Node', element:'Fire', nature:'ill',
      sig:'A threshold outward: endings, exits, release, the close of a matter. Good for what should be finished or let go, and for losing what one wishes rid of; ill for beginnings and for keeping.',
      note:'Cauda Draconis, the descending lunar node (☋) — the door out. Of an ill, “going-out” nature; pairs with Caput, its head.' },
    { la:'Puer', en:'The Boy', rows:[1,1,2,1], planet:'Mars', element:'Air', nature:'ill, save in war and love',
      sig:'The young soldier: heat, rashness, drive, conflict. Reckless and headstrong, ill in most affairs — but strong in war, contest, and passion, where boldness wins.',
      note:'Puer, “the boy”; the figure is read as a rod or weapon. Martial. Its reversion is Puella, the girl.' },
    { la:'Fortuna Minor', en:'The Lesser Fortune', rows:[1,1,2,2], planet:'Sun', element:'Fire', nature:'good, but fleeting',
      sig:'Swift, outward fortune — success had quickly, through others or by speed, but not built to last. Good for matters wanting a fast result; weak for what must endure.',
      note:'Fortuna Minor — “fortune going out” (the upper lines single), help from without. A solar figure, like its greater twin.' },
    { la:'Puella', en:'The Girl', rows:[1,2,1,1], planet:'Venus', element:'Water', nature:'good',
      sig:'Harmony, beauty, affection, peace. Favourable in love, friendship, and pleasant dealings; pure and well-mannered, though changeable in graver matters.',
      note:'Puella, “the girl” — Venusian; the reversion of Puer. Good in nearly all questions but war.' },
    { la:'Amissio', en:'Loss', rows:[1,2,1,2], planet:'Venus', element:'Fire', nature:'ill (good for release)',
      sig:'Loss, the slipping-away of things, what leaves the hand. The mirror of Acquisitio: ill where one wishes to gain or keep, but favourable where one wishes to be free of a thing or end a burden.',
      note:'Amissio, “loss” — an emptied purse, the inversion of Acquisitio. Good only when loss itself is the wish.' },
    { la:'Carcer', en:'The Prison', rows:[1,2,2,1], planet:'Saturn', element:'Earth', nature:'ill (stable)',
      sig:'Binding, restriction, delay, confinement, isolation. Things held fast and slow to move; ill for freedom and progress, yet steadying for what must be fixed in place or kept.',
      note:'Carcer, “the prison” — a closed cell (the outer lines single, walling the centre). Saturnine; a symmetrical, locked figure.' },
    { la:'Laetitia', en:'Joy', rows:[1,2,2,2], planet:'Jupiter', element:'Air', nature:'good',
      sig:'Joy, health, gladness, good news; things rising and lightening. Favourable for happiness, recovery, and elevation — the spirit lifted up.',
      note:'Laetitia, “joy” — the single Fire line at the head; only Fire active, its ruling element. An upward, Jovial figure.' },
    { la:'Caput Draconis', en:'The Head of the Dragon', rows:[2,1,1,1], planet:'Ascending Node', element:'Earth', nature:'good',
      sig:'A threshold inward: beginnings, entries, the open door, a good foundation. Favourable for starting and for receiving; it takes on the good or ill of the figures it keeps company with, but is good of itself.',
      note:'Caput Draconis, the ascending lunar node (☊) — the door in; reversion of Cauda. A figure of thresholds.' },
    { la:'Acquisitio', en:'Gain', rows:[2,1,2,1], planet:'Jupiter', element:'Fire', nature:'good',
      sig:'Gain, profit, the getting of the thing desired; money, increase, success in business and ambition. One of the most fortunate figures — the full purse.',
      note:'Acquisitio, “gain.” The Latin geomancers give it bonum finem, fortunatum — receptionem rei desideratæ, “a good and fortunate end, the receiving of the thing desired.” Jovial; the inversion of Amissio.' },
    { la:'Coniunctio', en:'Conjunction', rows:[2,1,1,2], planet:'Mercury', element:'Air', nature:'mixed',
      sig:'Meeting, union, the coming-together of things or people; recovery of what was lost. Neutral of itself — good with the good and ill with the ill — it joins whatever it touches.',
      note:'Coniunctio, “conjunction” — a symmetrical, Mercurial figure of combination. Its verdict follows its company.' },
    { la:'Rubeus', en:'Red', rows:[2,1,2,2], planet:'Mars', element:'Water', nature:'ill',
      sig:'Heat of the blood: passion, anger, violence, vice, lust, fever and falsehood. An ill figure in nearly all honest matters; favourable only to things base or destructive.',
      note:'Rubeus, “the red” — only Air active. Martial and inflamed; the reversion of Albus, its peaceful opposite.' },
    { la:'Fortuna Major', en:'The Greater Fortune', rows:[2,2,1,1], planet:'Sun', element:'Earth', nature:'good',
      sig:'Great and lasting fortune, won by one’s own strength; power, protection, success that holds. Among the best of figures — the inward, solar victory.',
      note:'Fortuna Major — “fortune going in” (the lower lines single), strength from within. Solar; like beams of light descending.' },
    { la:'Albus', en:'White', rows:[2,2,1,2], planet:'Mercury', element:'Water', nature:'good',
      sig:'Peace, wisdom, clarity, clean counsel, purity of mind. Favourable for thought, learning, and quiet beginnings; bright and untroubled.',
      note:'Albus, “the white” — only Water active, its ruling element. Mercurial and serene; the reversion of Rubeus.' },
    { la:'Tristitia', en:'Sorrow', rows:[2,2,2,1], planet:'Saturn', element:'Earth', nature:'ill',
      sig:'Sorrow, grief, melancholy, lowering and decline; things pressed down and slow. Ill for joy and advancement — yet apt for what should sink, stay hidden, or be rooted deep.',
      note:'Tristitia, “sorrow” — only Earth active, its ruling element; a single point at the foot. Saturnine; the inversion of Laetitia, its joy.' },
    { la:'Populus', en:'The People', rows:[2,2,2,2], planet:'Moon', element:'Water', nature:'neutral',
      sig:'A crowd, a gathering, the multitude; wholly passive, it takes the colour of whatever acts upon it. Neither good nor ill of itself — a still water that reflects its neighbours.',
      note:'Populus, “the people / the assembly” — all lines double, every point paired; the Arabic is Jamāʿa (جماعة), the gathering. Lunar and reflective; the inversion of Via.' },
  ],
};

if (typeof window !== 'undefined') window.GEOMANCY = GEOMANCY;
