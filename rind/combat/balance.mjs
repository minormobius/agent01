// balance.mjs — the COMBAT BALANCE harness. The tool the whole sandbox is for.
//
// Runs many seeded AI-vs-AI battles across every faction matchup and prints a matrix of win / draw
// rates, time-to-kill, and survivor HP. Because the engine is pure + seeded, a run is reproducible:
// same flags → same numbers, so a balance change is a diff you can read. This is how faction styles
// get tuned before the kernel is vendored back into hoop/v098/arena/.
//
// Usage:
//   node rind/combat/balance.mjs                 # 300 battles per matchup, default
//   node rind/combat/balance.mjs --n 1000        # more battles → tighter numbers
//   node rind/combat/balance.mjs --power 14      # higher-level combatants
//   node rind/combat/balance.mjs --csv           # machine-readable rows instead of the table
//   node rind/combat/balance.mjs --pair drift:continuant   # one matchup, verbose first 3 battles

import { rollCharacter } from './stats.js';
import { FACTIONS, FACTION_ORDER, FACTION_LEAN } from './factions.js';
import * as E from './engine.js';

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const N = +flag('n', 300);
const POWER = +flag('power', 10);
const MAXT = +flag('maxturns', 100);
const CSV = argv.includes('--csv');
const PAIR = flag('pair', null);
const PARTY = +flag('party', 1);   // units per side (NvN) — exercises the multi-agent path

// build a faction-typical combatant: a character rolled to lean its faction's triad domain.
function combatant(faction, seed, id, name) {
  const ch = rollCharacter((seed >>> 0) || 1, { triad: FACTION_LEAN[faction], power: POWER });
  return { id, name, faction, character: ch };
}

// run one battle to the end; return { winner, turns, timedOut, hpPlayer, hpFoe }.
// PARTY>1 fields N units per side (same faction) — the multi-agent path through the engine.
function battle(pf, ff, seed) {
  const player = combatant(pf, seed * 100 + 1, 'P', 'Player');
  const allies = []; for (let i = 1; i < PARTY; i++) allies.push(combatant(pf, seed * 100 + 1 + i, 'P' + i, 'Ally' + i));
  const foes = []; for (let i = 0; i < PARTY; i++) foes.push(combatant(ff, seed * 100 + 50 + i, 'E' + i, 'Foe' + i));
  const s = E.createBattle({ player, allies, foes, seed, maxTurns: MAXT });
  let g = 0; while (!s.winner && g++ < MAXT * 6) E.runAiTurn(s);
  const hpFrac = (team) => { let hp = 0, mx = 0; for (const u of s.units) if (u.team === team) { hp += Math.max(0, u.hp); mx += u.maxhp; } return mx ? hp / mx : 0; };
  return { winner: s.winner || 'draw', turns: s.turn, timedOut: s.timedOut, hpPlayer: hpFrac('player'), hpFoe: hpFrac('foe') };
}

// aggregate N battles for one matchup.
function matchup(pf, ff, n = N) {
  let pw = 0, fw = 0, dr = 0, turns = 0, winnerHp = 0, decided = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = battle(pf, ff, seed);
    turns += r.turns;
    if (r.winner === 'player') { pw++; winnerHp += r.hpPlayer; decided++; }
    else if (r.winner === 'foe') { fw++; winnerHp += r.hpFoe; decided++; }
    else dr++;
  }
  return { pf, ff, n, pw, fw, dr, winRate: pw / n, drawRate: dr / n, avgTurns: turns / n, avgWinnerHp: decided ? winnerHp / decided : 0 };
}

const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const f1 = (x) => x.toFixed(1).padStart(5);

if (PAIR) {
  const [pf, ff] = String(PAIR).split(':');
  if (!FACTIONS[pf] || !FACTIONS[ff]) { console.error(`unknown faction in --pair ${PAIR} (use ${FACTION_ORDER.join('|')})`); process.exit(2); }
  console.log(`\n${pf} (player) vs ${ff} (foe) — first 3 battles, then ${N}-battle summary:\n`);
  for (let seed = 1; seed <= 3; seed++) {
    const player = combatant(pf, seed * 2 + 1, 'P', 'Player'), foe = combatant(ff, seed * 2 + 2, 'E', 'Foe');
    const s = E.createBattle({ player, foes: [foe], seed, maxTurns: MAXT });
    let g = 0; while (!s.winner && g++ < MAXT * 6) E.runAiTurn(s);
    console.log(`  seed ${seed}: ${s.winner}${s.timedOut ? ' (timeout)' : ''} in ${s.turn} turns`);
    for (const l of s.log.slice(-6)) console.log(`      · ${l.msg}`);
  }
  const m = matchup(pf, ff);
  console.log(`\n  ${pf} win ${pct(m.winRate)}  draw ${pct(m.drawRate)}  avg ${f1(m.avgTurns)} turns  winner HP ${pct(m.avgWinnerHp)}\n`);
  process.exit(0);
}

if (CSV) {
  console.log('player,foe,n,player_win,foe_win,draw,player_winrate,draw_rate,avg_turns,avg_winner_hp');
  for (const pf of FACTION_ORDER) for (const ff of FACTION_ORDER) {
    const m = matchup(pf, ff);
    console.log([pf, ff, m.n, m.pw, m.fw, m.dr, m.winRate.toFixed(3), m.drawRate.toFixed(3), m.avgTurns.toFixed(2), m.avgWinnerHp.toFixed(3)].join(','));
  }
  process.exit(0);
}

// ── the matrix ──
console.log(`\nCOMBAT BALANCE — ${N} battles/matchup, power ${POWER}, ${MAXT}-turn cap`);
console.log('Cell = PLAYER-faction win rate (row plays player, column plays foe). [d]=draw rate.\n');
const head = 'player ↓ / foe →'.padEnd(16) + FACTION_ORDER.map((f) => f.padStart(13)).join('');
console.log(head);
const all = {};
for (const pf of FACTION_ORDER) {
  let row = pf.padEnd(16);
  for (const ff of FACTION_ORDER) {
    const m = matchup(pf, ff); all[pf + 'x' + ff] = m;
    row += `${pct(m.winRate)} [d${(100 * m.drawRate).toFixed(0)}]`.padStart(13);
  }
  console.log(row);
}

// per-faction overall (averaged across the three opponents, as the player side)
console.log('\nOverall (as player, avg across opponents):');
for (const pf of FACTION_ORDER) {
  const ms = FACTION_ORDER.map((ff) => all[pf + 'x' + ff]);
  const win = ms.reduce((a, m) => a + m.winRate, 0) / ms.length;
  const draw = ms.reduce((a, m) => a + m.drawRate, 0) / ms.length;
  const turns = ms.reduce((a, m) => a + m.avgTurns, 0) / ms.length;
  const hp = ms.reduce((a, m) => a + m.avgWinnerHp, 0) / ms.length;
  console.log(`  ${pf.padEnd(12)} win ${pct(win)}   draw ${pct(draw)}   avg ${f1(turns)} turns   winner HP ${pct(hp)}`);
}

// mirror-match draw rates (a high mirror draw = a faction that can't close on itself)
console.log('\nMirror matches (faction vs itself):');
for (const f of FACTION_ORDER) { const m = all[f + 'x' + f]; console.log(`  ${f.padEnd(12)} draw ${pct(m.drawRate)}   avg ${f1(m.avgTurns)} turns`); }
console.log('');
