// eigensite/questions.js — the question bank for the eigensite quiz.
//
// Each question is a yes/no asked of the visitor, and a predicate over a site's
// metadata that says which sites a "yes" points at. The engine (engine.js)
// evaluates every predicate against every site once, then picks at each step
// the unasked question that best halves what it still believes. A question is
// good when it splits the field near the middle AND cuts across the others;
// the selftest (eigensite.selftest.mjs) measures both.
//
// Predicate leaves, all matched against the site record the engine builds:
//   { wing: 'play' }                  the site's wing (bluesky procgen oneill play study bench about)
//   { kind: ['toy','game'] }          kind, one or a list
//   { top: 'g' }                      the hub it lives in (or its own id if standalone)
//   { domain: 'oneill' }
//   { tech: 'seed' }                  a procgen technique it carries
//   { tag: 'wasm' }                   a stack tag from the catalogue
//   { text: 'fractal|zoom' }          a regex over name + description + domain + id
//   { any: [...] } { all: [...] } { not: {...} }
window.EIGEN_QUESTIONS = [
  // ---- posture: what do you want to do right now
  { id: 'play', q: 'Are you here to play something?', if: { kind: ['game', 'toy'] } },
  { id: 'use', q: 'Do you want a tool you would actually use again next week?', if: { kind: ['app'] } },
  { id: 'learn', q: 'Would you rather learn one thing properly than poke at ten?', if: { kind: ['explainer', 'reading'] } },
  { id: 'watch', q: 'Would you rather watch something happen than make it happen?', if: { any: [{ kind: 'toy' }, { tech: 'grow' }, { text: 'simulat|watch|grow|evolv' }] } },
  { id: 'make', q: 'Do you want to end up with something you made?', if: { any: [{ text: 'draw|paint|compose|editor|build|breed|design|write|sequenc' }, { kind: 'app' }] } },
  { id: 'rules', q: 'Do you want rules, a score, and an end?', if: { kind: 'game' } },
  { id: 'ten', q: 'Do you have about ten minutes, no more?', if: { any: [{ kind: ['toy', 'explainer', 'game'] }, { text: 'quick|minute|one-page|single' }] } },
  { id: 'deep', q: 'Would you sit with one thing for an hour?', if: { any: [{ kind: ['reading', 'engine', 'app'] }, { text: 'campaign|chapter|novel|whole|hour' }] } },

  // ---- the social layer
  { id: 'bsky', q: 'Do you have a Bluesky account?', if: { any: [{ wing: 'bluesky' }, { tag: 'atproto' }, { text: 'bluesky|atproto|pds|feed' }] } },
  { id: 'self', q: 'Do you want to see yourself, your posts and your circle, measured?', if: { any: [{ top: 'atmosphere' }, { text: 'your (posts|account|follows|timeline|circle|network)|posting|handle' }] } },
  { id: 'others', q: 'Are you more curious about other people than about yourself?', if: { any: [{ text: 'community|neighbo|crowd|anyone|other people|friends|multiplayer|party' }, { top: 'simcluster' }] } },
  { id: 'post', q: 'Do you want to publish something to the network, not just read it?', if: { any: [{ text: 'post|publish|record|share|rant|vote|poll' }, { top: 'rite' }] } },
  { id: 'image', q: 'Is it about pictures?', if: { any: [{ top: 'photo' }, { text: 'photo|image|picture|pixel|glitch|camera' }] } },
  { id: 'words', q: 'Is it about words: reading them, writing them, weighing them?', if: { any: [{ top: 'rite' }, { kind: 'reading' }, { text: 'text|prose|sentence|word|book|tale|poem|read' }] } },

  // ---- things no one wrote
  { id: 'gen', q: 'Do you like things that were generated rather than authored?', if: { any: [{ wing: 'procgen' }, { tech: 'seed' }, { text: 'generat|procedural|seeded|random' }] } },
  { id: 'seed', q: 'Does it please you that a number can be a permalink to a whole world?', if: { any: [{ tech: 'seed' }, { text: 'seed|permalink' }] } },
  { id: 'judge', q: 'Do you like the idea of a machine that throws most of its own work away?', if: { any: [{ tech: 'judge' }, { text: 'judg|rubric|crowd|certif|discard' }] } },
  { id: 'grow', q: 'Would you rather grow a thing from local rules than draw it?', if: { any: [{ tech: 'grow' }, { text: 'grow|crystal|colony|agent|swarm|cellular|organism' }] } },
  { id: 'creature', q: 'Do you want creatures?', if: { text: 'creature|organism|fish|monster|critter|species|animal|insect|bee|isopod|sprite|amoeba|slime|garden' } },
  { id: 'story', q: 'Do you want a story?', if: { any: [{ kind: 'reading' }, { text: 'tale|story|novel|book|essay|pitch|myth|saga|legend' }] } },

  // ---- the cylinder
  { id: 'space', q: 'Would you live in a space habitat if you could?', if: { any: [{ wing: 'oneill' }, { text: "o'neill|cylinder|habitat|hoop|megaproject" }] } },
  { id: 'ecology', q: 'Do you care whether the life-support loop can close at all?', if: { any: [{ top: 'oneill' }, { text: 'ecolog|biome|food web|thermodynam|life-support|closed' }] } },
  { id: 'model', q: 'Do you want a model with several faces rather than a single page?', if: { kind: 'engine' } },

  // ---- toys and games
  { id: 'gpu', q: 'Do you want your graphics card to sweat?', if: { any: [{ tag: 'webgpu' }, { tag: 'webgl' }, { text: 'webgpu|webgl|gpu|3d|shader|ray' }] } },
  { id: 'torus', q: 'Do you have feelings about the torus?', if: { any: [{ top: 'torus' }, { text: 'torus|toroid|donut|knot' }] } },
  { id: 'fractal', q: 'Do you want to zoom in forever?', if: { text: 'fractal|zoom|infinite|endless|recurs' } },
  { id: 'arcade', q: 'Do you miss the arcade?', if: { any: [{ text: 'pac-?man|arcade|platformer|roguelike|chess|shoot|wave|horde|race' }, { top: 'torus' }] } },
  { id: 'pressure', q: 'Do you make better decisions under pressure?', if: { any: [{ top: 'pressure' }, { text: 'pressure|decision|deciding|risk|convoy|spend' }] } },
  { id: 'together', q: 'Do you want to play with other people in the room?', if: { text: 'multiplayer|party|two-phone|networked|rooms?\\b|seats|opponent|with friends' } },
  { id: 'canvas', q: 'Do you want to draw on it?', if: { any: [{ top: 'canvas' }, { text: 'draw|paint|stroke|canvas|sketch|whiteboard' }] } },
  { id: 'physics', q: 'Is it the physics you want to see: fields, forces, flows?', if: { text: 'physics|magnet|gravity|field|force|fluid|flow|particle|dynamics|molecul|orbit|current' } },

  // ---- reading and math
  { id: 'math', q: 'Do you want a proof, or at least the shape of one?', if: { any: [{ top: 'math' }, { kind: 'explainer' }, { tag: 'math' }, { text: 'theorem|conjecture|lemma|proof|geometry|combinator' }] } },
  { id: 'medieval', q: 'Would you read a medieval text if it were set beside the original?', if: { any: [{ top: 'tales' }, { text: 'medieval|welsh|arthur|merlin|middle english|latin|mabinogi|romance' }] } },
  { id: 'oracle', q: 'Would you consult an oracle?', if: { any: [{ top: 'oracle' }, { text: 'oracle|i ching|yijing|geomancy|alchemy|yarrow|divination|astrolog' }] } },
  { id: 'fast', q: 'Do you read fast?', if: { any: [{ top: 'read' }, { text: 'speed read|bionic|reader' }] } },
  { id: 'teach', q: 'Do you want to be taught?', if: { any: [{ kind: 'explainer' }, { text: 'teach|learn|explainer|curriculum|dojo|practice|drill|education' }] } },

  // ---- tools and science
  { id: 'lab', q: 'Do you have data of your own to bring?', if: { any: [{ text: 'your (data|csv|image|files?|repo)|upload|drop a|import|workbench|sql|duckdb|notebook' }, { tag: 'duckdb' }] } },
  { id: 'bio', q: 'Is it biology?', if: { text: 'biolog|protein|molecul|dna|pcr|cloning|cell|neuron|microb|phylo|species|fossil|jurassic|ensifer' } },
  { id: 'money', q: 'Is it money?', if: { any: [{ top: 'finance' }, { text: 'finance|financ|stock|market|money|price|fund|bounty|perp|trade|deal' }] } },
  { id: 'map', q: 'Is it a map?', if: { text: 'map|globe|county|geograph|atlas|world|city|hinterland|choropleth|flows' } },
  { id: 'sound', q: 'Is it sound?', if: { text: 'sound|audio|music|noise|sonif|podcast|voice|sing|hear|beat|synth|notation' } },
  { id: 'work', q: 'Is this for work: a team, a project, a client?', if: { any: [{ top: 'org' }, { text: 'team|project|organi[sz]ation|calendar|crm|kanban|gantt|issue|bug|ticket|clients?' }] } },
  { id: 'wasm', q: 'Do you care that it runs in the tab and nothing leaves your browser?', if: { any: [{ tag: 'wasm' }, { tag: 'rust' }, { text: 'wasm|in the browser|in the tab|client-side|nothing leaves|entirely in' }] } },
  { id: 'reference', q: 'Do you just need to look something up?', if: { text: 'unicode|emoji|converter|parser|reference|lookup|table of|every .* in one' } },
  { id: 'ai', q: 'Do you want a model in the loop, judging or generating?', if: { any: [{ tag: 'embeddings' }, { tag: 'ai' }, { tag: 'agents' }, { text: 'embedding|llm|ai |agent|model grading|whisper|neural' }] } },

  // ---- about this site
  { id: 'meta', q: 'Are you more interested in how this site got built than in any one page of it?', if: { any: [{ wing: 'about' }, { text: 'repo|commit|deploy|spec|stats|audit|loop|the site' }] } },
  { id: 'hardware', q: 'Do you want something you could hold in your hand?', if: { text: 'hardware|nfc|card|print|physical|phone|device|tape' } },
];
