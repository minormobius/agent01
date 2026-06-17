// progression.selftest.mjs — pins the his-story-driven progression derivation (hoop/story/
// progression.js): storyboard + milestones + world flags derived from CONTENT, not hand-authored.
// Proven against hoopy's real plot_beats, and against a synthetic beat with flag triggers.
// Run: node hoop/test/progression.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveStoryboard, deriveMilestones, deriveWorldFlags, deriveOpeningCast } from '../story/progression.js';
import { importWorldExport } from '../story/import.js';
import { computeBoard, tierFloors } from '../v096/story/board.js';
import { MemoryStore } from '../story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const wx = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../v096/story/world_export.json'), 'utf8'));
const { content } = importWorldExport(wx);

// ── derive a storyboard from his plot_beats ──
{
  const sb = deriveStoryboard(content);
  ok(sb._derived && sb.beats.length === 5, 'storyboard derived from his 5 plot_beats');
  ok(sb.beats.every((b) => b.title && b.advances && b.advances.narrative_tier), 'every beat has a title + a tier it advances');
  // ordered by the climb (narrative tier non-decreasing)
  const ns = sb.beats.map((b) => b.advances.narrative_tier);
  ok(ns.every((n, i) => i === 0 || n >= ns[i - 1]), 'beats are ordered by the climb (narrative tier ascending)');
  // sequential chain: each beat (after the first) requires the prior
  ok(sb.beats.slice(1).every((b, i) => (b.requires.beats || [])[0] === sb.beats[i].id), 'beats chain sequentially (requires prior beat)');
  ok(sb.acts.length >= 1 && sb.acts[0].label.includes('Arrival'), 'acts carry the bible ladder names (Arrival…)');

  // markers point at his locations (terminal / rind / named place), each with a hint
  const markers = sb.beats.map((b) => b.marker).filter(Boolean);
  ok(markers.some((m) => m.terminal), 'a beat marker resolves his "Tabard Terminal" ref → a terminal');
  ok(markers.some((m) => m.place === 'rind'), 'a beat marker resolves his "Rind Access Shaft"/"Signal Chamber" → the rind');
  ok(markers.some((m) => m.place && m.place !== 'rind'), 'a beat marker resolves a named place (his "Industrial Margin")');
  ok(markers.every((m) => m.hint), 'every marker carries a hint for the quest log');

  // board.js consumes the derived storyboard unchanged
  const store = new MemoryStore(content, { features: [] });
  const board = computeBoard(sb, store, 'p1');
  ok(board.length === 5 && board[0].status, 'board.js computes the derived storyboard (status per beat)');
  ok(board.some((b) => b.status === 'active'), 'a beat is active');

  // EXPOSURE drives the climb: tier-paced beats complete as power (XP from crystallizing his content)
  // rises, and tierFloors lifts narrative/revelation — the way "out" (tier 2) and "down" (tier 3) open.
  ok(tierFloors(computeBoard(sb, store, 'p1')).narrative_tier === 1, 'at power 1, only the opening tier holds');
  store.setPlayerXp('p1', 300, 5);   // simulate exposure → power tier 5
  const climbed = tierFloors(computeBoard(sb, store, 'p1'));
  ok(climbed.narrative_tier === 3 && climbed.revelation_tier === 3, 'exposure (power↑) lifts narrative + revelation through his beats to tier 3');
}

// ── the opening cast is his Arrival NPCs (not the hand-pinned Olo/Sevin fixture) ──
{
  const cast = deriveOpeningCast(content, 3);
  ok(cast.length === 3 && cast.every((c) => c.type === 'npc'), 'opening cast = 3 of his NPCs');
  ok(cast.every((c) => (c.narrative_tier || 1) <= (cast[cast.length - 1].narrative_tier || 1)), 'cast ordered by narrative tier (Arrival first)');
  ok(cast.every((c) => (c.content || {}).name && c.lane === 'spine'), 'cast are real imported NPCs from his pool (not the dead np-olo fixture)');
  ok(cast.every((c) => (c.narrative_tier || 1) === 1), 'the opening cast are all his Arrival-tier (narrative 1) NPCs');
}

// ── world flags derived from his content (replaces the static manifest) ──
{
  const wf = deriveWorldFlags(content);
  ok(wf.facts.includes('flag.player_rebuilt') && wf.facts.includes('flag.signal_resonance'), 'derived world flags include the journey flags his pool gates on');
  ok(wf.items.includes('translation_apparatus'), 'derived world items include the player-intrinsic apparatus');
  ok(!wf.facts.includes('flag.bay14_truth'), 'a flag his content DOES produce is NOT a world flag (correctly excluded)');
}

// ── milestones: flag-gated beats become tier floors; tier-paced ones do not (advancement stays his) ──
{
  // his current export: plot_beats have empty triggers ⇒ tier-paced ⇒ no auto-milestones (flag-driven only)
  ok(deriveMilestones(deriveStoryboard(content)).length === 0, "no flag triggers yet ⇒ no derived milestones (advancement stays flag-driven, not auto)");

  // a synthetic beat WITH trigger flags ⇒ a real milestone (proves the wiring lights up with his full export)
  const withTrig = [{ id: 'pb-curve', type: 'plot_beat', revelation_tier: 2, narrative_tier: 2, power_tier: 1,
    content: { name: 'The Curve', description: 'you see it' }, trigger_conditions: { flags: ['flag.curve_noticed'] } }];
  const sb2 = deriveStoryboard(withTrig);
  ok(sb2.beats[0].completes_when.facts['flag.curve_noticed'] === true, 'a beat with trigger flags is flag-gated (completes_when from his triggers)');
  const ms = deriveMilestones(sb2);
  ok(ms.some((m) => m.axis === 'narrative_tier' && m.to === 2) && ms.some((m) => m.axis === 'revelation_tier' && m.to === 2), 'flag-gated beat derives narrative + revelation tier floors');
  ok(ms[0].requires.facts['flag.curve_noticed'] === true, 'the milestone gates on his flag — advancement driven by his story');

  // tierFloors agrees once the beat is done
  const store = new MemoryStore([], { features: [] });
  store.setFact('p1', 'flag.curve_noticed', true);
  ok(tierFloors(computeBoard(sb2, store, 'p1')).narrative_tier === 2, 'board tierFloors lifts to tier 2 when his flag holds');
}

console.log(`progression.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
