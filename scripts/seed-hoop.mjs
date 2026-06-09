#!/usr/bin/env node
/* seed-hoop — write the canonical "infinite game" design map to a service PDS
   as com.minomobi.hoop.place + com.minomobi.hoop.message records, so mino and
   hoopy read a shared, authoritative scaffold to formulate the request-for-
   product against. Idempotent: places use deterministic rkey `${x}-${y}` and
   the opening messages use deterministic rkeys, so re-running overwrites rather
   than duplicating.

   The records lay the ship out on the world map: a central DIRECTOR (the
   feedback loop that bends every engine toward the player's revealed taste),
   with the world-gen, character, quest, dungeon, minigame, creep-of-the-week,
   story-arc engines and the player-telemetry model around it. Each node opens
   with a framing question — the seed of that engine's requirements.

   Identity: resolves the handle to its DID + PDS at runtime (survives a PDS
   migration). Reads HOOP_HANDLE + HOOP_PASSWORD (an app password) from env.
   Pass --dry to build + print the records without writing (no creds needed).

   Usage:
     HOOP_HANDLE=modulo.minomobi.com HOOP_PASSWORD=xxxx node scripts/seed-hoop.mjs
     node scripts/seed-hoop.mjs --dry
*/
import { resolveHandle, resolvePds, PdsClient } from '../packages/atproto/pds.js';

const PLACE = 'com.minomobi.hoop.place';
const MESSAGE = 'com.minomobi.hoop.message';
const DRY = process.argv.includes('--dry');

// A fixed authored timestamp base keeps re-runs byte-identical (true idempotency).
const T0 = Date.parse('2026-06-09T00:00:00.000Z');
const ts = (i) => new Date(T0 + i * 60000).toISOString();
const pid = (x, y) => `${x}-${y}`;

// ── The ship and its engines. Coordinates land on room centres in the world
//    map (hoop/js/world.js ROOMS), so every node is walkable. ──────────────────
const NODES = [
  {
    x: 24, y: 14, glyph: '✸', kind: 'core', title: 'The Director',
    summary:
      'The spine of the whole machine: the feedback loop. It reads what the player actually does and bends every other engine toward an experience consonant with their revealed preferences. The end-goal of a run is not authored up front — it emerges from play. Shifting sand: the thing you are unpacking is, in no small part, determined by your own actions.',
    open:
      'Start here. The Director is the one truly novel claim of this game: the destination is produced by the journey. What are its INPUTS (signals from the telemetry model), its KNOBS (what it can push on each engine), and its GUARDRAILS (so "give the player what they want" never collapses into pandering or incoherence)? If we get the Director right, everything else is in service of it.',
  },
  {
    x: 24, y: 6, glyph: '✶', kind: 'engine', title: 'Story-Arc Engine',
    summary:
      'What is actually going on aboard this ship. The overarching arc the player slowly unpacks — but which the Director reshapes as their actions reveal what kind of story they are here for. The big answer is a moving target.',
    open:
      'How does an arc stay coherent while its destination is allowed to move? Proposal: a fixed set of arc PRIMITIVES (a mystery, a threat, a faction war, a homecoming) that the Director weights up or down by player behaviour, rather than a single scripted plot. What is the smallest arc grammar that can still feel authored?',
  },
  {
    x: 24, y: 22, glyph: '⊚', kind: 'system', title: 'Player Telemetry & Preference Model',
    summary:
      'The input the Director runs on. Captures every action — where you linger, what you skip, who you talk to, how you solve things — and infers taste. Without a good read on the player, the feedback loop is blind.',
    open:
      'What do we actually log, and how do we turn raw actions into a preference vector the Director can steer by? Where is the line between "responsive" and "creepy"? What is the v1 signal set that is cheap to capture and already useful?',
  },
  {
    x: 6, y: 14, glyph: '❂', kind: 'engine', title: 'World-Gen — The Ship',
    summary:
      'Builds the spaceship for every game: a big old vessel, effectively infinite, full of decks, bays, and systems to consider and build around. The world the player inhabits and the canvas every other engine writes onto.',
    open:
      'What is the unit of generation — deck? district? system? How do we get an effectively-infinite ship that still feels hand-placed and legible, not noise? And how much of the ship is generated up front vs. materialised just-in-time as the player (and the Director) reach for it?',
  },
  {
    x: 14, y: 9, glyph: '☻', kind: 'engine', title: 'Character Engine',
    summary:
      'Builds the NPCs that crew and haunt the ship — wants, memory, relationships. The people the player unpacks the world through.',
    open:
      'What makes a generated NPC worth talking to twice? Proposal: persistent memory + a want that the player can advance or thwart. What is the minimum interiority that reads as a character rather than a quest-dispenser, and how do NPCs get re-tasked when the Director shifts the arc?',
  },
  {
    x: 35, y: 8, glyph: '⚑', kind: 'engine', title: 'Quest Engine',
    summary:
      "Procedurally generated quests that don't suck. Goals that matter because they are tied to the arc and to this particular player — not fetch-quest filler.",
    open:
      'Why do most procedural quests suck, and what is our antidote? Working theory: a quest only matters if its stakes are drawn from the live arc and its shape is chosen to test something the player has shown they care about. What is the quest grammar, and what is the bar a generated quest must clear to ship?',
  },
  {
    x: 33, y: 20, glyph: '⌗', kind: 'engine', title: 'Dungeon Engine',
    summary:
      'Bounded, replayable spaces with escalating pressure — the COD-style procedural cores the player drops into during a run.',
    open:
      'What is a "dungeon" aboard a ship — a sealed deck, a breached section, a rogue subsystem? How do we keep procedural spaces from feeling samey across an infinite vessel, and how does the Director use them to dial difficulty and tone to the player?',
  },
  {
    x: 12, y: 20, glyph: '◈', kind: 'engine', title: 'Minigame Engine',
    summary:
      'Builds the small diegetic games woven into ship life — the texture between the big beats.',
    open:
      'Which minigames are diegetic (repairing, piloting, trading, cards in the mess hall) vs. pure interludes? How many do we need at launch, and how does the Director choose which to surface based on what the player keeps choosing to do?',
  },
  {
    x: 42, y: 14, glyph: '☣', kind: 'engine', title: 'Creep-of-the-Week Engine',
    summary:
      'Recurring antagonists and encounters that come back and evolve — the rhythm section of threat across a run.',
    open:
      'What recurs, and how does it level with the player and the arc? Proposal: a small bestiary of "creeps" the Director re-skins and re-stats to keep pressure matched to the player. What makes a recurring antagonist feel like a nemesis rather than a respawn?',
  },
];

function placeRecord(n, i) {
  return [PLACE, pid(n.x, n.y), {
    $type: PLACE, title: n.title, glyph: n.glyph, kind: n.kind,
    x: n.x, y: n.y, summary: n.summary, createdAt: ts(i),
  }];
}
function openingMessage(n, i) {
  return [MESSAGE, `seed-${pid(n.x, n.y)}-0`, {
    $type: MESSAGE, placeId: pid(n.x, n.y), text: n.open, createdAt: ts(NODES.length + i),
  }];
}

const records = [];
NODES.forEach((n, i) => { records.push(placeRecord(n, i)); });
NODES.forEach((n, i) => { records.push(openingMessage(n, i)); });

(async () => {
  console.log(`hoop seed: ${NODES.length} places + ${NODES.length} opening messages = ${records.length} records`);
  if (DRY) {
    for (const [col, rkey, rec] of records) {
      console.log(`  [DRY] ${col} ${rkey}  ${rec.title || (rec.text || '').slice(0, 60)}`);
    }
    console.log('Dry run — nothing written.');
    return;
  }

  const handle = process.env.HOOP_HANDLE;
  const password = process.env.HOOP_PASSWORD;
  if (!handle || !password) {
    console.error('Missing HOOP_HANDLE / HOOP_PASSWORD. (Use --dry to preview without creds.)');
    process.exit(1);
  }

  const did = await resolveHandle(handle);
  if (!did) throw new Error(`could not resolve handle: ${handle}`);
  const pds = await resolvePds(did);
  if (!pds) throw new Error(`could not resolve PDS for ${did}`);
  const client = new PdsClient(pds);
  await client.login(handle, password);
  console.log(`Logged in as ${handle} (${did}) @ ${pds}`);

  let ok = 0;
  for (const [col, rkey, rec] of records) {
    try {
      await client.putRecord(col, rkey, rec);
      ok++;
      console.log(`  ✓ ${col} ${rkey}`);
    } catch (e) {
      console.error(`  ✗ ${col} ${rkey}: ${e.message}`);
    }
  }
  console.log(`Done. ${ok}/${records.length} records written to ${handle}'s repo.`);
})().catch((e) => { console.error(e); process.exit(1); });
