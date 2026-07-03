/* hoop — an intellectual history · data + render
   All entries verified against the repo (git history, route tables, find over *.html). */

const LINEAGE = [
  {v:'v2',  nm:'the solved world',  d:'First deterministic ship engine + Voronoi-foam rooms. A chunk becomes a pure function of (seed, coord) — reproducible, forkable across PDS repos.'},
  {v:'v3',  nm:'the stitch',        d:'Seamless multi-chunk tiling: adjacent chunks share edge-cells by construction. NPCs become ID’d residents; first multi-floor stairs & ladders.'},
  {v:'v4',  nm:'furnished',         d:'Room fixtures and art-deco character. A pure Voronoi room is bland; v4 makes it feel inhabited. Tap-anywhere intracell navigation.'},
  {v:'v5',  nm:'halls-first',       d:'Organic multi-cell rooms grown by seeding order; concourse-crossing seams with interior rooms.'},
  {v:'v6',  nm:'halls sandbox',     d:'A design sandbox for traversal — doorways, inter-room visibility, how the view adapts room to room.'},
  {v:'v7',  nm:'hex chunks',        d:'Streaming chunk generation: chunks load as you approach. Click a chunk edge to seed the next; ROLE_MIX dials a chunk’s character.'},
  {v:'v8',  nm:'the world',         d:'The plumbing hidden — a clean, streaming player surface. The procedural engine is feature-complete; story/economy/combat remain to wire in.'},
  {v:'v090',nm:'painted',           d:'Ported live to hoop.mino.mobi. WebGPU Voronoi walls, sprite-lit fixtures, and the first ATProto lexicons: place = forum thread, message = record. “The map is the forum.”'},
  {v:'v091',nm:'lived-in',          d:'Traffic-sized rooms, impassable wall fixtures grown from the membrane, grand civic anchors, and the econ society layer (residents with multiplexed affiliations).'},
  {v:'v094',nm:'Chapter One opening',d:'The hand-authored Tabard bible: Bay 14, the Three Factions, the Seven, five revelation tiers, chambers as permanent addresses. Determinism survives story.'},
  {v:'v095',nm:'content loop',      d:'Pool-based content dispatch, per-player saves to the player’s own PDS, a rumour outbox and a verdict feed — advancement gated on earned facts, no model in the hot path.'},
  {v:'v096',nm:'live inference',    d:'Optional Gemini side-quests, fully guarded behind the inference-free path; the ✨ weave button; records monitoring + publish spec; “why no DB” settled (the PDS is the store).'},
  {v:'v097',nm:'the Tabard (testimony)',d:'A playable loop: turn-based combat, a coin shop with durable gear, gem-socketing (Lapidary), inventory, and per-seed multi-profile saves.'},
  {v:'v098',nm:'home stretch',      d:'Performance (nav-mesh restitch O(54)→O(1)), a full mobile audit, and an NPC restructure: the crowd becomes ambience; only discovered souls are promoted to named characters.'},
  {v:'v099',nm:'development surface',d:'The current dev bed. Worship-oracle fixtures (divination), a Chapter One progression audit, the story spine. New work proves out here before the main site.'},
];

const WINGS = [
  {role:'game · narrative time', nm:'hoop', dom:'hoop.mino.mobi', accent:'#d8a657',
   p:'The witness. A Voronoi glyph-world where every place anchors a forum thread; the deterministic ship engine (js/ship.js), HoopRoom presence, the story, the forge, the floors. The surface that visits all the others.'},
  {role:'structure · static', nm:'rind', dom:'rind.mino.mobi', accent:'#7fa8d8',
   p:'The foam space-frame shell, split out of hoop. cylinder.html sizes the shell with a Rust/WASM frame solver; foamview.html reads the layered foam + wayfinding routes; walk.html walks a planar cut. Now also hosts /brawl combat.'},
  {role:'thermodynamics · dynamical', nm:'tide', dom:'tide.mino.mobi', accent:'#6dc2b6',
   p:'The interior climate, split out of biome. The centrifugal barometer g(r)=ω²r, a 1-D radial atmosphere column with Mie fog optics, a rotating-frame fountain + linear sun, and a conserving water/energy ledger.'},
  {role:'ecosystem · ecological', nm:'biome', dom:'biome.mino.mobi', accent:'#8fbf7f',
   p:'The closed food-web box model: element-exact (C·H·O·N conserve by construction), Kleiber allometry, a real-organism roster from iNaturalist/GloBI, and a community-matrix stability lab. The forge vendors it verbatim as life support.'},
  {role:'design study · end-on', nm:'iris', dom:'iris.mino.mobi', accent:'#a98fd8',
   p:'The end-on cross-section: looking down the axis at a small ring habitat (4 km floor inside a 5 km radiator skin). One coupled steady-state solve — lights in, radiator out — pins every temperature.'},
  {role:'satellite · NPC genome', nm:'mega / sprite', dom:'mega.mino.mobi/sprite', accent:'#c47b54',
   p:'The breeding ground. A seed-deterministic, atproto-persistable engine that grows NPC bodies (five body plans), items and chamber fixtures for hoop’s world — plus /v092 and /v093, playable clones of the world itself.'},
];

// status: nav (homepage-linked) · route (worker clean-URL, unlinked) · buried · sib (sibling surface)
const CENSUS = [
  // ---- hoop: the live game + the dossier ----
  {p:'/',                       g:'core', s:'nav',    t:'The live game — canvas world + forum rail; current iteration.'},
  {p:'/research.html',          g:'core', s:'nav',    t:'The O’Neill cylinder research dossier (secant cable web, ratchet topography).'},
  // ---- hoop: the browsable design history ----
  {p:'/v2/',   g:'history', s:'buried', t:'“The solved world” — first deterministic engine. Unlinked.'},
  {p:'/v3/',   g:'history', s:'nav',    t:'“The stitch” — seamless tiling + ID’d NPCs.'},
  {p:'/v4/',   g:'history', s:'nav',    t:'“Furnished” — fixtures + intracell nav.'},
  {p:'/v5/',   g:'history', s:'nav',    t:'“Halls-first” — organic multi-cell rooms.'},
  {p:'/v6/',   g:'history', s:'nav',    t:'“Halls sandbox” — traversal experiments.'},
  {p:'/v7/',   g:'history', s:'nav',    t:'“Hex chunks” — streaming + click-to-seed tiling.'},
  {p:'/v8/',   g:'history', s:'nav',    t:'“The world” — clean streaming player surface.'},
  {p:'/v090/', g:'history', s:'nav',    t:'“Painted” — WebGPU walls + ATProto place/message lexicons.'},
  {p:'/v091/', g:'history', s:'nav',    t:'“Lived-in” — traffic rooms + econ society.'},
  {p:'/v094/', g:'history', s:'buried', t:'“Chapter One opening” — the hand-authored Tabard bible. Unlinked.'},
  // ---- hoop: the story versions (routed shells + their buried internals) ----
  {p:'/v095/',                g:'story', s:'buried', t:'Story content loop — pool dispatch + per-player PDS saves.'},
  {p:'/v095/arena/',          g:'story', s:'buried', t:'Combat arena (v095).'},
  {p:'/v095/storyboard/',     g:'story', s:'buried', t:'Declarative story-progression source.'},
  {p:'/v096/',                g:'story', s:'route',  t:'Live-inference story (optional Gemini side-quests). Clean route, unlinked.'},
  {p:'/v096/arena/',          g:'story', s:'buried', t:'Combat arena (v096).'},
  {p:'/v096/records.html',    g:'story', s:'buried', t:'Published-records monitor.'},
  {p:'/v096/feed.html',       g:'story', s:'buried', t:'Live records feed.'},
  {p:'/v096/storyboard/',     g:'story', s:'buried', t:'Story progression board.'},
  {p:'/v096/architecture.html',g:'story',s:'buried', t:'Story data-flow documentation (force-directed graph).'},
  {p:'/v097/',                g:'story', s:'route',  t:'“Testimony pass” — combat, shop, gems, inventory. Clean route, unlinked.'},
  {p:'/v097/arena/',          g:'story', s:'buried', t:'Combat arena (v097).'},
  {p:'/v097/records.html',    g:'story', s:'buried', t:'Published-records monitor.'},
  {p:'/v097/feed.html',       g:'story', s:'buried', t:'Live records feed.'},
  {p:'/v097/storyboard/',     g:'story', s:'buried', t:'Story progression board.'},
  {p:'/v097/architecture.html',g:'story',s:'buried', t:'Story data-flow documentation.'},
  {p:'/v098/',                g:'story', s:'route',  t:'“Home stretch” — perf + mobile + NPC hierarchy. Stable test surface.'},
  {p:'/v098/arena/',          g:'story', s:'buried', t:'Combat arena (v098).'},
  {p:'/v098/records.html',    g:'story', s:'buried', t:'Published-records monitor.'},
  {p:'/v098/feed.html',       g:'story', s:'buried', t:'Live records feed.'},
  {p:'/v098/storyboard/',     g:'story', s:'buried', t:'Story progression board.'},
  {p:'/v098/architecture.html',g:'story',s:'buried', t:'Story data-flow documentation.'},
  {p:'/v099/',                g:'story', s:'route',  t:'Current development surface (worship oracle, audit).'},
  {p:'/v099/arena/',          g:'story', s:'buried', t:'Combat arena (v099).'},
  {p:'/v099/records.html',    g:'story', s:'buried', t:'Published-records monitor.'},
  {p:'/v099/feed.html',       g:'story', s:'buried', t:'Live records feed.'},
  {p:'/v099/storyboard/',     g:'story', s:'buried', t:'Story progression board.'},
  {p:'/v099/architecture.html',g:'story',s:'buried', t:'Story data-flow documentation.'},
  {p:'/v099/story/spine.html',g:'story', s:'buried', t:'The flag spine: load-bearing NPC quests + deck-stacking guarantee demo.'},
  // ---- hoop: economy + the maker's workbench ----
  {p:'/over/',           g:'tools', s:'buried', t:'“Level Zero: the Overworld” — a hidden meta-layer with its own theme.'},
  {p:'/paint/',          g:'tools', s:'buried', t:'Membrane-seeded Voronoi playground — the foam-design sandbox (live sliders).'},
  {p:'/econ/',           g:'econ',  s:'buried', t:'Economies as ecosystems — town gen + viability oracle.'},
  {p:'/econ/foam/',      g:'econ',  s:'buried', t:'A society painted over a 3D chamber foam (WebGPU) — the most elaborate hidden view.'},
  {p:'/econ/deck/',      g:'econ',  s:'buried', t:'Econ deck view.'},
  {p:'/econ/report.html',g:'econ',  s:'buried', t:'Formal econ technical writeup.'},
  {p:'/chunkroller/',    g:'tools', s:'route',  t:'Chunk-design tool — bounded-floor view + port-count tuning.'},
  {p:'/chunkroller/tess.html',g:'tools',s:'buried',t:'Tessellation editor.'},
  {p:'/nave/',           g:'floors',s:'route',  t:'Floor 1 — the central commons ringed by six faction wards.'},
  {p:'/nave/slots.html', g:'floors',s:'buried', t:'Content-slot manifest for the hoopy story handoff.'},
  {p:'/rind/',           g:'floors',s:'route',  t:'Floor 2 (internal) — the cold structural underworld. (Name collides with the rind.mino.mobi wing!)'},
  // ---- hoop: the forge suite ----
  {p:'/forge/',           g:'forge', s:'route',  t:'The everything-factory — closed-loop production Sankey (scrap→stock→deployed→scrap).'},
  {p:'/forge/elements.html',g:'forge',s:'buried',t:'Element-tagged product catalogue (~50 classes).'},
  {p:'/forge/facilities.html',g:'forge',s:'buried',t:'Facilities partitioned into the foam.'},
  {p:'/forge/foam3d.html',g:'forge', s:'buried', t:'Volumetric foam, two non-touching physarum species (bots vs peds).'},
  {p:'/forge/micro.html', g:'forge', s:'buried', t:'The chunk floor — gradient+barriers, capillaries as woven surfaces (the final commit).'},
  {p:'/forge/region.html',g:'forge', s:'buried', t:'A forge region composed of multiple chunks sewn together.'},
  {p:'/forge/ship.html',  g:'forge', s:'buried', t:'Looking down the bore of the infinite cylinder — the axial view from inside the shell.'},
  {p:'/forge/slices.html',g:'forge', s:'buried', t:'Plan + section slice navigator for the 3D chunk.'},
  {p:'/forge/stack.html', g:'forge', s:'buried', t:'Two-deck factory: material floor + pedestrian mezzanine (corkscrew ramps).'},
  {p:'/forge/tower.html', g:'forge', s:'buried', t:'The supply chain stood up into a vertical tower.'},
  {p:'/forge/walk.html',  g:'forge', s:'buried', t:'Playable 19-chunk factory prototype.'},
  // ---- sibling: rind (structure wing, rind.mino.mobi) ----
  {p:'rind.mino.mobi/',             g:'rind', s:'sib', t:'The STRUCTURE wing landing.'},
  {p:'rind.mino.mobi/cylinder.html',g:'rind', s:'sib', t:'Structural + radiative scratchpad; sizes the shell with the frame solver.'},
  {p:'rind.mino.mobi/foamview.html',g:'rind', s:'sib', t:'3D read of the layered foam + drivable spiral-ramp / road wayfinding.'},
  {p:'rind.mino.mobi/walk.html',    g:'rind', s:'sib', t:'Walk a planar cut through the foam.'},
  {p:'rind.mino.mobi/brawl/',       g:'rind', s:'sib', t:'Combat: per-faction 5-tier tech tree, summons, radial controls.'},
  {p:'rind.mino.mobi/combat/dojo.html',g:'rind',s:'sib',t:'Combat sandbox (continuum).'},
  // ---- sibling: mega/sprite (NPC labs, mega.mino.mobi) ----
  {p:'mega/sprite/',         g:'sprite', s:'sib', t:'The NPC Sprite Lab — breeds creatures for hoop’s world.'},
  {p:'mega/sprite/docs/',    g:'sprite', s:'sib', t:'Sprite engine documentation.'},
  {p:'mega/sprite/item/',    g:'sprite', s:'sib', t:'Item genome + characteristics engine (phylogeny, breeding).'},
  {p:'mega/sprite/fixture/', g:'sprite', s:'sib', t:'Chamber fixtures grown from hoop v3’s Voronoi tiling.'},
  {p:'mega/sprite/radial/',  g:'sprite', s:'sib', t:'Body plan: psychic echinoderm (radial).'},
  {p:'mega/sprite/radial/play/',g:'sprite',s:'sib',t:'Phase-space explorer for the radial plan.'},
  {p:'mega/sprite/quad/',    g:'sprite', s:'sib', t:'Body plan: quadruped (boar/hound/bear/robot).'},
  {p:'mega/sprite/quad/play/',g:'sprite',s:'sib', t:'Phase-space explorer for quadrupeds.'},
  {p:'mega/sprite/poly/',    g:'sprite', s:'sib', t:'Body plan: polypod (ant/spider/crab/spiderbot).'},
  {p:'mega/sprite/poly/play/',g:'sprite',s:'sib', t:'Phase-space explorer for polypods.'},
  {p:'mega/sprite/axial/',   g:'sprite', s:'sib', t:'Body plan: vermiform (worm/snake/eel).'},
  {p:'mega/sprite/axial/play/',g:'sprite',s:'sib',t:'Phase-space explorer for undulators.'},
  {p:'mega/sprite/isopod/',  g:'sprite', s:'sib', t:'Body plan: isopod (axial × polypod hybrid).'},
  {p:'mega/sprite/isopod/play/',g:'sprite',s:'sib',t:'Phase-space explorer for isopods.'},
];

const SECRETS = [
  {tag:'no front door', pp:'hoop/v099/worship/lib/', h:'A working divination engine',
   p:'A full I-Ching (zhouyi + hexagrams), yarrow-stalk casting, and geomancy-in-sand — implemented as JS modules (iching.js, zhouyi.js, yarrow.js, scry.js, sand.js, geomancy.js) consumed by the worship fixture. There is no /worship page. The oracle is real; it just has no URL.'},
  {tag:'hidden layer', pp:'/over/', h:'Level Zero: the Overworld',
   p:'A secret meta-layer with a completely different visual theme — fully playable, zero navigation links, discoverable only by reading the source. A whole alternate floor of the game hiding in plain sight.'},
  {tag:'the elaborate one', pp:'/econ/foam/', h:'A society over 3D foam',
   p:'A live town economy painted across a multi-thousand-chamber foam in WebGPU — buildings assigned to chambers, supply routed by road distance. Built as a design exploration and never advertised anywhere.'},
  {tag:'perspective trick', pp:'/forge/ship.html', h:'Down the bore of the cylinder',
   p:'Almost everything renders the cylinder from inside a room. This one flies axially down the infinite shell — the view from the structure looking in. Counter-intuitive enough that no visitor would guess it exists.'},
  {tag:'the whole museum', pp:'/v2/ … /v091/', h:'The entire design history, served',
   p:'Fifteen playable iterations — every fossilised decision from “the solved world” to “lived-in” — sit at guessable paths. The homepage links a handful; the rest is an accidental museum nobody knows is open.'},
  {tag:'load-bearing', pp:'/v099/story/spine.html', h:'The flag spine',
   p:'A technical demo of the narrative constraint engine: NPC quests that must stay solvable, and the deck-stacking guarantee that keeps Chapter One winnable however the world re-rolls. The proof that the story can’t deadlock.'},
];

/* ---------- render ---------- */
function el(tag, cls, html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}

// lineage
const lg = document.getElementById('lineage-grid');
LINEAGE.forEach(x=>{
  const c = el('div','vcard');
  c.innerHTML = `<div class="v">${x.v}</div><div class="nm">${x.nm}</div><div class="d">${x.d}</div>`;
  lg.appendChild(c);
});

// wings
const wg = document.getElementById('wings-grid');
WINGS.forEach(w=>{
  const c = el('div','wing'); c.style.setProperty('--accent', w.accent);
  c.innerHTML = `<div class="role">${w.role}</div><h3>${w.nm}</h3><div class="dom">${w.dom}</div><p>${w.p}</p>`;
  wg.appendChild(c);
});

// census
const body = document.getElementById('census-body');
const countLine = document.getElementById('census-count');
const BADGE = {nav:['b-nav','nav'], route:['b-route','route'], buried:['b-buried','buried'], sib:['b-sib','sib']};
function renderCensus(filter){
  body.innerHTML='';
  let n=0;
  CENSUS.forEach(r=>{
    if(filter!=='all' && r.s!==filter) return;
    n++;
    const [bc,bt]=BADGE[r.s];
    const tr=el('tr');
    tr.innerHTML = `<td class="p">${r.p}</td><td>${r.t}</td><td class="hide-sm">${r.g}</td><td><span class="badge ${bc}">${bt}</span></td>`;
    body.appendChild(tr);
  });
  const tot=CENSUS.length;
  const nav=CENSUS.filter(r=>r.s==='nav').length;
  const buried=CENSUS.filter(r=>r.s==='buried').length;
  countLine.textContent = `Showing ${n} of ${tot} endpoints · ${nav} on the lit path (homepage + its links) · ${buried} reachable only if you know the path.`;
}
document.querySelectorAll('.fbtn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.fbtn').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    renderCensus(b.dataset.f);
  });
});
renderCensus('all');

// secrets
const sg = document.getElementById('secrets-grid');
SECRETS.forEach(s=>{
  const c=el('div','secret');
  c.innerHTML = `<div class="tag">${s.tag}</div><h4>${s.h}</h4><span class="pp">${s.pp}</span><p>${s.p}</p>`;
  sg.appendChild(c);
});

/* ---------- the ideographic tree ---------- */
// status: origin | crystal (survived, load-bearing) | dev (in flight) | tossed (reverted/superseded)
// order matters: it sets the vertical stacking of trunks and branches.
const TREE = [
  {id:'root', parent:null, s:'origin', t:'a shared drawing canvas'},

  // GENERATION — how the world is made
  {id:'det',     parent:'root',  s:'crystal', t:'deterministic generation'},
  {id:'stitch',  parent:'det',   s:'crystal', t:'infinite chunk stitching'},
  {id:'stream',  parent:'stitch',s:'crystal', t:'streaming chunks'},
  {id:'painted', parent:'stitch',s:'crystal', t:'WebGPU painted world'},

  // PERSISTENCE — where state lives
  {id:'rec',   parent:'root', s:'crystal', t:'place = ATProto record'},
  {id:'forum', parent:'rec',  s:'crystal', t:'the map is the forum'},
  {id:'addr',  parent:'rec',  s:'crystal', t:'chambers as stable addresses'},
  {id:'d1',    parent:'rec',  s:'tossed',  t:'a D1 database backend'},

  // NAVIGATION — how you move & see
  {id:'walk',   parent:'root', s:'crystal', t:'walk the foam'},
  {id:'floors', parent:'walk', s:'crystal', t:'multi-floor: a deck link is a port'},
  {id:'planar', parent:'walk', s:'tossed',  t:'the best-fit planar map cut'},
  {id:'fan',    parent:'planar',s:'dev',    t:'player-centric wayfinding fan'},
  {id:'dim',    parent:'walk', s:'tossed',  t:'per-cell dimming overlay'},
  {id:'hpa',    parent:'walk', s:'crystal', t:'HPA* / postal routing'},

  // SOCIETY & ECONOMY — the living layer
  {id:'npc',     parent:'root', s:'crystal', t:'NPCs as ID’d residents'},
  {id:'rdf',     parent:'npc',  s:'crystal', t:'place = role × domain × flows'},
  {id:'oracle',  parent:'rdf',  s:'crystal', t:'deck → roll → oracle'},
  {id:'closed',  parent:'npc',  s:'crystal', t:'closed-loop conserved economy'},
  {id:'reclaim', parent:'closed',s:'crystal',t:'the reclaimer is the decomposer'},
  {id:'ledger',  parent:'closed',s:'dev',    t:'forge ledger imports biome'},
  {id:'desire',  parent:'npc',  s:'crystal', t:'desire-line roads (Physarum)'},
  {id:'cork',    parent:'desire',s:'tossed', t:'top-down corkscrew highway'},
  {id:'ambient', parent:'npc',  s:'crystal', t:'crowd → ambience; promote souls'},

  // STORY — the narrative spine
  {id:'tabard',  parent:'root',  s:'crystal', t:'the authored Tabard opening'},
  {id:'tiers',   parent:'tabard',s:'crystal', t:'revelation tiers — earned, not timed'},
  {id:'pool',    parent:'tabard',s:'crystal', t:'pool dispatch + PDS saves'},
  {id:'infguard',parent:'tabard',s:'crystal', t:'inference-free + guarded LLM'},
  {id:'ashveil', parent:'tabard',s:'tossed',  t:'Ashveil / “the Quiet”'},
  {id:'keeper',  parent:'tabard',s:'tossed',  t:'the Keeper-derelict tone'},
  {id:'clamp',   parent:'tabard',s:'tossed',  t:'tier labeler clamped 1–3'},

  // THE FRAME — the unifying idea
  {id:'oneill', parent:'root',  s:'crystal', t:'the O’Neill cylinder'},
  {id:'wings',  parent:'oneill',s:'crystal', t:'four wings: hoop·rind·tide·biome'},
  {id:'shell',  parent:'oneill',s:'dev',     t:'the forge as the shell'},
  {id:'capill', parent:'shell', s:'dev',     t:'capillaries as woven surfaces'},
  {id:'sprite', parent:'oneill',s:'dev',     t:'mega/sprite breeds the NPCs'},
  {id:'brawl',  parent:'oneill',s:'dev',     t:'rind/brawl — combat depth'},
  {id:'iris',   parent:'oneill',s:'dev',     t:'iris — end-on sibling study'},
];

const DISCARDS = [
  {t:'a D1 database backend', k:'the player’s PDS became the store itself; a Director rollup can still be rebuilt from the firehose on demand, but it is never the source of truth.'},
  {t:'the best-fit planar map cut', k:'superseded by the player-centric wayfinding fan — a shortest-path tree truncated at a view radius, not a fixed plane sliced through the foam.'},
  {t:'the per-cell dimming overlay', k:'it tanked the framerate; replaced by baked flat geodesic route arrays that render in one stroke per frame.'},
  {t:'the top-down corkscrew highway', k:'almost nothing — it was “a highway system with no streets, imposed top-down.” ~96–99% of climb infrastructure now emerges as grown desire-line streets.'},
  {t:'Ashveil / “the Quiet”', k:'nothing — the vendored-engine derelict fiction was replaced wholesale by a living, maintained ship (the Tabard).'},
  {t:'the Keeper-derelict tone', k:'the “wrong stars” beat, salvaged as a tier-2 “Curve” revelation. The dead-crew/hostile-lurker framing was dropped.'},
  {t:'the tier labeler clamped 1–3', k:'recalibrated to the Tabard’s five revelation tiers before any inference was pointed at the bible.'},
];

(function renderTree(){
  const svg = document.getElementById('tree-svg');
  if(!svg) return;
  const SVGNS='http://www.w3.org/2000/svg';
  const COL=232, ROW=30, PADX=14, PADY=20, R=4.5;
  const byId={}, kids={};
  TREE.forEach(n=>{byId[n.id]=n;kids[n.id]=[];});
  TREE.forEach(n=>{if(n.parent)kids[n.parent].push(n.id);});
  // depth
  function depth(id){let d=0,p=byId[id].parent;while(p){d++;p=byId[p].parent;}return d;}
  TREE.forEach(n=>n._x = PADX + depth(n.id)*COL);
  // tidy layout: leaves get sequential rows, parents centre on their children
  let slot=0;
  (function place(id){
    const ch=kids[id];
    if(!ch.length){ byId[id]._y = PADY + slot*ROW; slot++; return; }
    ch.forEach(place);
    byId[id]._y = (byId[ch[0]]._y + byId[ch[ch.length-1]]._y)/2;
  })('root');

  const maxX = Math.max(...TREE.map(n=>n._x));
  const W = maxX + 270;            // room for the rightmost labels
  const H = PADY*2 + slot*ROW;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('width',W); svg.setAttribute('height',H);
  svg.style.minWidth = W+'px';

  const COLORS={origin:'#e9e4d6',crystal:'#d8a657',dev:'#7fa8d8',tossed:'#c96a5a'};
  const mk=(tag,attrs)=>{const e=document.createElementNS(SVGNS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);return e;};

  // edges first (so nodes sit on top)
  TREE.forEach(n=>{
    if(!n.parent) return;
    const p=byId[n.parent];
    const x1=p._x, y1=p._y, x2=n._x, y2=n._y, mx=x1+COL/2;
    const path=mk('path',{d:`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`,fill:'none',
      stroke:n.s==='tossed'?'#5a3b36':(n.s==='dev'?'#3c4a63':'#4a402b'),
      'stroke-width':n.s==='crystal'?2:1.4});
    if(n.s!=='crystal') path.setAttribute('stroke-dasharray','3 4');
    svg.appendChild(path);
  });

  // nodes + labels
  TREE.forEach(n=>{
    const c=COLORS[n.s];
    if(n.s==='origin'){
      svg.appendChild(mk('circle',{cx:n._x,cy:n._y,r:R+2,fill:'none',stroke:c,'stroke-width':1.5}));
      svg.appendChild(mk('circle',{cx:n._x,cy:n._y,r:2,fill:c}));
    }else if(n.s==='tossed'){
      const g=mk('g',{}); // an x-mark
      g.appendChild(mk('line',{x1:n._x-3.5,y1:n._y-3.5,x2:n._x+3.5,y2:n._y+3.5,stroke:c,'stroke-width':1.8}));
      g.appendChild(mk('line',{x1:n._x-3.5,y1:n._y+3.5,x2:n._x+3.5,y2:n._y-3.5,stroke:c,'stroke-width':1.8}));
      svg.appendChild(g);
    }else if(n.s==='dev'){
      svg.appendChild(mk('circle',{cx:n._x,cy:n._y,r:R,fill:'none',stroke:c,'stroke-width':1.8}));
    }else{
      svg.appendChild(mk('circle',{cx:n._x,cy:n._y,r:R,fill:c}));
    }
    const tx=mk('text',{x:n._x+11,y:n._y+4,'font-size':n.id==='root'?13:12.5,
      fill:n.s==='tossed'?'#b08a82':(n.s==='origin'?'#e9e4d6':'#cfd3de'),
      'font-style':n.s==='tossed'?'italic':'normal','font-weight':n.s==='origin'?'600':'400'});
    tx.textContent=n.t;
    svg.appendChild(tx);
  });
})();

// discards
const dl = document.getElementById('discards-list');
if(dl){ DISCARDS.forEach(d=>{
  const c=el('div','discard');
  c.innerHTML = `<h4><span class="x">✕</span>${d.t}</h4><p><b>what survived:</b> ${d.k}</p>`;
  dl.appendChild(c);
}); }
