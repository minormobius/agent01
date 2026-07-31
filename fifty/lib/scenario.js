// fifty/lib/scenario.js — the daily game-theory scenario (concept 33).
//
// Wordle's real trick is not the word, it is that everybody gets the same one.
// So the scenario, its payoffs and its opponent field are all derived from the
// UTC date: no server decides what today is, and two people on opposite sides
// of the network can verify they were playing the same game.
//
// Payoffs are computed against the field rather than a fixed matrix, because
// the interesting scenarios are the ones where your score depends on how many
// others did what you did.

import { rng, hash32 } from './ui.js';

export const SCENARIOS = [
  {
    id: 'stag',
    name: 'Stag Hunt',
    scale: 'small group',
    brief: 'Six of you are hunting. A stag feeds everyone but needs at least four hunters committed. A hare feeds only you, and you get it whether or not anyone else helps.',
    options: [
      { id: 'stag', label: 'Hunt the stag', hint: 'Big payoff, but only if four of you show up.' },
      { id: 'hare', label: 'Take the hare', hint: 'Small, certain, and it costs the group nothing directly.' },
    ],
    score(mine, field) {
      // You are one of the hunters, so your own choice counts toward the four.
      const stags = field.filter((f) => f === 'stag').length + (mine === 'stag' ? 1 : 0);
      if (mine === 'hare') return stags >= 4 ? 3 : 4;
      return stags >= 4 ? 10 : 0;
    },
    lesson: 'Two equilibria, and the good one needs coordination you cannot enforce. Talk is how you get there — which is why the talk is allowed.',
  },
  {
    id: 'commons',
    name: 'The Commons',
    scale: 'global',
    brief: 'A shared pasture regrows if total grazing stays under 60% of capacity. Everyone chooses how hard to graze. Overshoot and the pasture is degraded for everyone, this round and the next.',
    options: [
      { id: 'light', label: 'Graze lightly', hint: 'Sustainable. Costs you if others do not reciprocate.' },
      { id: 'normal', label: 'Graze normally', hint: 'The default. Fine if enough others restrain.' },
      { id: 'hard', label: 'Graze hard', hint: 'Best individual return, if the commons holds.' },
    ],
    score(mine, field) {
      const all = field.concat([mine]);
      const load = all.reduce((s, f) => s + ({ light: 0.4, normal: 1, hard: 1.8 }[f] || 1), 0) / all.length;
      const healthy = load <= 1.0;
      const base = { light: 3, normal: 5, hard: 8 }[mine] || 5;
      return healthy ? base : Math.round(base * 0.35);
    },
    lesson: 'Nobody defects here — everyone just acts reasonably, and reasonable sums to ruin. That is the actual shape of the tragedy.',
  },
  {
    id: 'beauty',
    name: 'Guess Two-Thirds',
    scale: 'global',
    brief: 'Everyone picks a number from 0 to 100. The winner is whoever lands closest to two-thirds of the average of all picks.',
    options: null,     // numeric
    numeric: { min: 0, max: 100, label: 'Your number' },
    score(mine, field) {
      const all = field.concat([mine]).map(Number);
      const target = (all.reduce((a, b) => a + b, 0) / all.length) * (2 / 3);
      const err = Math.abs(Number(mine) - target);
      return Math.max(0, Math.round(10 - err / 3));
    },
    lesson: 'The Nash equilibrium is 0 and almost nobody plays it. Your score depends on how many levels of "but they will think that too" the field actually ran.',
  },
  {
    id: 'volunteer',
    name: "Volunteer's Dilemma",
    scale: 'small group',
    brief: 'Something has broken and one person needs to fix it. Whoever volunteers pays a real cost in time. If nobody volunteers, everybody suffers a much larger cost.',
    options: [
      { id: 'volunteer', label: 'Volunteer', hint: 'Certain small cost to you, problem solved for everyone.' },
      { id: 'wait', label: 'Wait for someone else', hint: 'Free if anyone steps up. Expensive if nobody does.' },
    ],
    score(mine, field) {
      const volunteers = field.filter((f) => f === 'volunteer').length + (mine === 'volunteer' ? 1 : 0);
      if (mine === 'volunteer') return volunteers === 1 ? 6 : 4;
      return volunteers >= 1 ? 8 : 0;
    },
    lesson: 'Adding people makes it worse. The larger the group, the lower each person\'s chance of being the one who moves — and the higher the chance nobody does.',
  },
  {
    id: 'chicken',
    name: 'Two Trucks, One Bridge',
    scale: '1v1',
    brief: 'You and one other player are driving at a single-lane bridge from opposite ends. Swerving loses you a little face. Neither swerving is catastrophic for both.',
    options: [
      { id: 'straight', label: 'Hold your line', hint: 'Wins big if they blink.' },
      { id: 'swerve', label: 'Swerve', hint: 'Small loss, guaranteed survival.' },
    ],
    score(mine, field) {
      const them = field[0] || 'swerve';
      if (mine === 'straight' && them === 'swerve') return 10;
      if (mine === 'swerve' && them === 'straight') return 3;
      if (mine === 'swerve') return 5;
      return 0;
    },
    lesson: 'The winning move is to be credibly unable to swerve. Which is why, in this one, talking first can hurt you.',
  },
  {
    id: 'trust',
    name: 'The Trust Game',
    scale: '1v1',
    brief: 'You are given 10 units. Anything you send to your partner is tripled on arrival. They then decide how much, if any, to send back.',
    options: [
      { id: 'send0', label: 'Send nothing', hint: 'Keep 10. Nothing can go wrong.' },
      { id: 'send5', label: 'Send half', hint: 'They receive 15 and choose.' },
      { id: 'send10', label: 'Send everything', hint: 'They receive 30 and choose.' },
    ],
    score(mine, field) {
      const kept = { send0: 10, send5: 5, send10: 0 }[mine] ?? 10;
      const sent = 10 - kept;
      // The field's generosity decides what comes back.
      const generous = field.filter((f) => f === 'send5' || f === 'send10').length / Math.max(1, field.length);
      const returned = Math.round(sent * 3 * generous * 0.55);
      return kept + returned;
    },
    lesson: 'Backward induction says send nothing. Real players send about half and get about half back, which is the standard result and a reasonable thing to feel good about.',
  },
  {
    id: 'auction',
    name: 'All-Pay Auction',
    scale: 'global',
    brief: 'One prize, worth 20. Everybody bids, the highest bid wins — and every bidder pays their own bid whether they win or not.',
    options: null,
    numeric: { min: 0, max: 30, label: 'Your bid' },
    score(mine, field) {
      const bid = Number(mine);
      const high = Math.max(...field.map(Number), 0);
      const won = bid > high;
      return Math.max(0, Math.round((won ? 20 : 0) - bid + 10));
    },
    lesson: 'Total bids reliably exceed the prize. This is the cleanest model of a bidding war, a patent race, or an argument nobody can afford to concede.',
  },
  {
    id: 'majority',
    name: 'Minority Wins',
    scale: 'global',
    brief: 'Pick a side. Whichever side ends up with fewer players scores; the majority gets nothing. There is no correct answer, only an unpopular one.',
    options: [
      { id: 'left', label: 'Left', hint: 'No intrinsic difference. That is the point.' },
      { id: 'right', label: 'Right', hint: 'Also no intrinsic difference.' },
    ],
    score(mine, field) {
      const all = field.concat([mine]);
      const mineCount = all.filter((f) => f === mine).length;
      return mineCount * 2 <= all.length ? 8 : 1;
    },
    lesson: 'The El Farol bar problem. Any strategy that becomes common stops working, so there is no stable rule — only churn.',
  },
];

/** Which scenario is today's? Derived from the UTC date, same for everyone. */
export function forDate(isoDay) {
  const seed = hash32(`fifty:scenario:${isoDay}`);
  const scenario = SCENARIOS[seed % SCENARIOS.length];
  const random = rng(`${isoDay}:${scenario.id}`);
  const fieldSize = scenario.scale === '1v1' ? 1 : scenario.scale === 'small group' ? 5 : 40;
  return { day: isoDay, scenario, random, fieldSize };
}

/**
 * The opposing field. Real players would fill this; with nobody else here it is
 * simulated from the day's seed — deterministic, so everyone plays the same
 * field, and disclosed on the page rather than presented as other humans.
 */
export function field({ scenario, random, fieldSize }) {
  const out = [];
  for (let i = 0; i < fieldSize; i++) {
    if (scenario.numeric) {
      // A plausible spread of reasoning depths rather than a uniform draw.
      const level = random();
      const { min, max } = scenario.numeric;
      const anchor = level < 0.25 ? (min + max) / 2
        : level < 0.6 ? (min + max) / 3
        : level < 0.85 ? (min + max) / 4.5
        : min + (max - min) * 0.05;
      out.push(Math.max(min, Math.min(max, Math.round(anchor + (random() - 0.5) * (max - min) * 0.2))));
    } else {
      out.push(scenario.options[Math.floor(random() * scenario.options.length)].id);
    }
  }
  return out;
}

/** Everything needed to score a play, with the field revealed. */
export function resolve(isoDay, myMove) {
  const today = forDate(isoDay);
  const f = field(today);
  const score = today.scenario.score(myMove, f);
  const dist = {};
  for (const m of f) dist[m] = (dist[m] || 0) + 1;
  return { ...today, field: f, distribution: dist, score };
}
