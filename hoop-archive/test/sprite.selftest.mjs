// sprite.selftest.mjs — pins the deterministic-asset contract of the sprite kernel.
//   node mega/sprite/sprite.selftest.mjs
import { buildGenome, frameRects, frameSVG, walkPose, genomeFromParams,
         DIR8, DIR_OF, ARCHETYPES, sharedClothFor } from '../v3/sprite-core.js';

let pass=0, fail=0;
const ok=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  ✗ '+name);} };
const setOf=rects=>new Set(rects.map(r=>r.x+','+r.y+':'+r.c));
const eq=(a,b)=>{ if(a.size!==b.size)return false; for(const v of a) if(!b.has(v))return false; return true; };

const O={size:15,dens:0.8,arch:'balanced',frames:4,sym:true,head:true,legs:true,eyes:true,item:true};
const g=buildGenome('hoop:0:0#0', O, null);

// 1. genome shape (the blank-canvas regression: cells MUST be present and full-grid)
ok('genome has cells', Array.isArray(g.cells) && g.cells.length===g.size);
ok('cells rows are HALF wide', g.cells.every(r=>r.length===g.half));
ok('genome has head + face genes', !!g.head && !!g.face && !!g.face.eye && !!g.face.mouth);

// 2. a frame is non-empty (would have caught the undefined-cells crash)
const fr=frameRects(g, DIR_OF.S, null);
ok('frameRects non-empty', fr.length>10);
ok('frame cells in bounds', fr.every(r=>r.x>=0&&r.x<g.size&&r.y>=0&&r.y<g.size));

// 3. determinism across the full size range — same (seed,opts) ⇒ byte-identical genome + frame
let det=true;
for(let N=9;N<=33;N+=2){ const o={...O,size:N};
  if(JSON.stringify(buildGenome('s#3',o,null))!==JSON.stringify(buildGenome('s#3',o,null))) det=false; }
ok('genome deterministic 9..33', det);
ok('frame deterministic', eq(setOf(frameRects(g,DIR_OF.E,1)), setOf(frameRects(g,DIR_OF.E,1))));

// 4. west is the exact horizontal mirror of east
const E=frameRects(g,DIR_OF.E,null), W=frameRects(g,DIR_OF.W,null);
const Wmir=new Set(W.map(r=>(g.size-1-r.x)+','+r.y+':'+r.c));
ok('W == mirror(E)', eq(setOf(E), Wmir));

// 5. walk: profile frames differ; neutral is stable
ok('profile walk frames differ', !eq(setOf(frameRects(g,DIR_OF.E,0)), setOf(frameRects(g,DIR_OF.E,1))));
ok('neutral pose stable', eq(setOf(frameRects(g,DIR_OF.S,null)), setOf(frameRects(g,DIR_OF.S,null))));
ok('walkPose null = standing', walkPose(null,4,false).bob===0);

// 6. archetype biases the role mix (company => more makers than balanced)
const dist=arc=>{ const c={}; for(let i=0;i<3000;i++){ const r=buildGenome('t#'+i,{...O,arch:arc},null).role; c[r]=(c[r]||0)+1; } return c; };
ok('company has more makers than balanced', (dist('company').make||0) > (dist('balanced').make||0));

// 7. head + face variance actually varies across a street
const heads=new Set(), eyes=new Set(), mouths=new Set();
for(let i=0;i<40;i++){ const x=buildGenome('v#'+i,O,null); heads.add(x.head); eyes.add(x.face.eye); mouths.add(x.face.mouth); }
ok('head shapes vary', heads.size>=3);
ok('eye styles vary', eyes.size>=3);
ok('mouth styles vary', mouths.size>=3);

// 8. SVG renderer: valid-ish string with rects, dimensioned (N+2)*scale
const svg=frameSVG(g, DIR_OF.S, null, 16);
ok('SVG starts with <svg', svg.startsWith('<svg'));
ok('SVG has rects', svg.includes('<rect'));
ok('SVG sized (15+2)*16=272', svg.includes('width="272"'));

// 9. genomeFromParams clamps + defaults (the API entrypoint)
const gp=genomeFromParams({seed:'hoop:0:0#2', size:'14', arch:'commons', item:'0'});
ok('size coerced odd', gp.size%2===1);
ok('arch honored', gp.opts.arch==='commons');
ok('item flag honored', gp.opts.item===false);

// 10. hoop delta — opts.role pins the genome's role (accent/emblem/item agree with the resident's job),
//     leaves the body seed-stable, and stays backward-compatible when absent.
const heal=buildGenome('hoop:1:2#5',{...O,role:'heal'},null);
const make=buildGenome('hoop:1:2#5',{...O,role:'make'},null);
ok('role override honored', heal.role==='heal' && heal.glyph==='✚');
ok('override changes accent vs another role', JSON.stringify(heal.ramps.accent)!==JSON.stringify(make.ramps.accent));
ok('body seed-stable across role overrides', JSON.stringify(heal.cells)===JSON.stringify(make.cells));
ok('bad role falls back to rolled', buildGenome('hoop:1:2#5',{...O,role:'nope'},null).role===buildGenome('hoop:1:2#5',{...O},null).role);

console.log(`\n${fail? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail?1:0);
