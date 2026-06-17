// hoop/story/prompt.js — the SIDE-QUEST GENERATION PROMPT builder. Pure, no DOM, no network, no LLM.
//
// Turns the bible + a chunk's thick characteristics + the nearby pool into {system, prompt, schema} for
// the segregated adapter (story/llm/). The model emits content_items (the engine's shape) + optional
// storyboard beats, which the orchestrator (sidequest.js) then runs through the review.js/gates.js/
// validate.js gate before anything is frozen. Keeping this pure makes the prompt itself node-testable.
//
// THE STEER: the bible is grounding (the world is the Tabard, not a generic dungeon); the chunk
// descriptor + thicknessGap tell the model HOW THICK the arc must be (a rich building/civ chunk demands
// a multi-beat arc, not a one-line fragment); the nearby pool prevents id collisions + repeated names.

// The shape the model must emit, described compactly (also handed to the adapter as a JSON schema hint).
export const SIDEQUEST_SCHEMA = {
  items: [{
    id: 'sq-<short-stable-slug>', type: 'npc|item|lore_fragment|creature|plot_beat',
    revelation_tier: '1..5', narrative_tier: '1..5', power_tier: '1..5',
    tags: ['world/role tags'], approved: true, status: 'active',
    requires: { facts: {}, items: [], min_rep: {} },
    content: { name: 'string', description: 'string', mechanics: {}, dialogue: { start: 'n0', nodes: {} } },
  }],
  beats: [{
    id: 'sb-<slug>', act: 'string', title: 'string', log: 'string', done: 'string',
    requires: { beats: [], facts: {}, items: [] }, completes_when: { facts: {} },
    advances: { narrative_tier: '1..5' }, marker: { anchor: 'id', hint: 'string' },
  }],
};

const SYSTEM = [
  'You are the Tabard\'s story engine — the inference lane of an inference-free game. You write SIDE-QUEST',
  'content for a living O\'Neill cylinder ship, grounded ONLY in the provided bible (the Tabard, the Seven,',
  'the factions Continuants/Drift/Rind-walkers, the Nave/Rind/Bay-14 geography, the revelation & narrative',
  'ladders 1..5). Never invent a setting the bible doesn\'t support.',
  '',
  'You emit JSON: { "items": [...], "beats": [...] } matching the engine\'s content_item shape. RULES:',
  '• ids are namespaced "sq-…"/"sb-…" and MUST NOT collide with any existing id listed below.',
  '• tiers are integers 1..5. Set approved:true, status:"active".',
  '• NPCs may carry a dialogue tree {start, nodes:{id:{says, choices:[{id,text,goto|effects}]}}} — every',
  '  goto must point at a real node; no dead ends. Keep trees small and clean.',
  '• NO ORPHAN GATES: any requires.facts/items you gate on MUST be produced within this same batch (by a',
  '  dialogue effect set_facts / give_items, or a take verb) or be left empty. A quest that can never close',
  '  is rejected. Prefer self-contained arcs.',
  '• MATCH THE THICKNESS: a thick chunk (many roles/domains/factions) needs a thick arc — multiple linked',
  '  items + beats, not a single lore line. Hit the requested item count.',
].join('\n');

function listExisting(existing) {
  const rows = (existing || []).slice(0, 40).map((c) => `${c.id} (${c.type}${c.content && c.content.name ? ': ' + c.content.name : ''})`);
  return rows.length ? rows.join('; ') : '(none nearby)';
}

// want: { items: minItemCount } derived from thicknessGap by the caller.
export function buildSidequestPrompt({ bible, profile = {}, descriptor = '', chunkThickness = 0, thicknessGap = 0, existing = [], want = {} } = {}) {
  const minItems = Math.max(want.items || 0, thicknessGap > 0 ? thicknessGap + 1 : 2);
  const prompt = [
    '=== BIBLE (canon — ground everything here) ===',
    String(bible || '').trim(),
    '',
    '=== THIS PLACE (the chunk to write for) ===',
    `descriptor: ${descriptor || '(unspecified)'}`,
    `thickness: ${chunkThickness} (the number of distinct narrative axes this place demands)`,
    profile.factions ? `factions present: ${Object.keys(profile.factions).join(', ')}` : '',
    profile.roles ? `roles/programme: ${Object.keys(profile.roles).join(', ')}` : '',
    profile.tier ? `civic vitality: ${profile.tier}` : '',
    '',
    '=== EXISTING NEARBY CONTENT (extend it; never reuse these ids/names) ===',
    listExisting(existing),
    '',
    `=== TASK ===`,
    `Write a self-contained side-quest arc rooted in THIS place. Emit at least ${minItems} items` +
      `${thicknessGap > 0 ? ` (the best existing match is ${thicknessGap} axes too thin — go richer)` : ''}` +
      ` plus 1–3 beats that chain them. Return ONLY the JSON object.`,
  ].filter((l) => l !== '').join('\n');
  return { system: SYSTEM, prompt, schema: SIDEQUEST_SCHEMA, minItems };
}

// Repair pass: re-issue the same task with the gate's conflict report appended, so the model fixes the
// exact violations (orphan gate, id collision, tier range, broken dialogue) rather than starting over.
export function buildRepairPrompt(base, report) {
  const conflicts = (report.conflicts || []).map((c) => `- [${c.code}] ${c.id}: ${c.msg}`).join('\n');
  return {
    system: base.system, schema: base.schema, minItems: base.minItems,
    prompt: base.prompt + '\n\n=== YOUR PREVIOUS OUTPUT WAS REJECTED ===\n' + conflicts +
      '\n\nFix EVERY issue above and re-emit the COMPLETE corrected JSON object (all items + beats).',
  };
}
