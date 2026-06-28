// mega worker — serves the static dashboard + /sprite lab as assets, and the /sprite/api/*
// procedural-sprite HTTP API. The API is canvas-free: it renders the same pure kernel
// (sprite/core.js) the browser lab uses, as SVG (a scalable, portable image) or JSON (the
// genome + cell rects). Everything is deterministic from the query, so responses are immutable.
import { genomeFromParams, frameSVG, frameRects, dirFromKey, DIR8 } from './sprite/core.js';
import { beeAtlas, beeSVG } from './bees/swarm.js';
import { buildRadialGenome, radialSVG, radialFrame } from './sprite/radial/radial.js';

const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'*' };
const json = (o,status)=> new Response(JSON.stringify(o,null,2), {status:status||200, headers:{'content-type':'application/json; charset=utf-8', ...CORS}});

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if(url.pathname.startsWith('/sprite/api')){
      if(req.method==='OPTIONS') return new Response(null,{headers:CORS});
      try { return api(url); } catch(e){ return json({error:String(e&&e.message||e)},400); }
    }
    if(url.pathname.startsWith('/bees/api')){
      if(req.method==='OPTIONS') return new Response(null,{headers:CORS});
      try { return beesApi(url); } catch(e){ return json({error:String(e&&e.message||e)},400); }
    }
    // every other path is a static asset (dashboard at /, lab at /sprite, core.js, etc.)
    if(env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('not found',{status:404});
  }
};

function api(url){
  const route = url.pathname.replace(/^\/sprite\/api\/?/,'') || '';
  const p = Object.fromEntries(url.searchParams);
  if(route==='' ) return json({
    service:'mega sprite api', portable:'every sprite is its genome — regenerate from these params',
    endpoints:{
      'GET /sprite/api/sprite.svg':'params: seed,size,arch,dir(S..NW),phase,scale,sym,head,legs,eyes,item → image/svg+xml',
      'GET /sprite/api/sprite.json':'same params → genome + cell rects',
      'GET /sprite/api/walk.json':'+ frames → full 8-direction walk-cycle rects',
      'GET /sprite/api/radial.svg':'radial echinoderm still. params: seed,arms,depth,splay,taper,writhe,glow,accentHue,size,scale → image/svg+xml',
      'GET /sprite/api/radial.json':'same params → radial genome + rest-pose rects',
    }, archetypes:['balanced','dormitory','company','commons'] });

  const g = genomeFromParams(p);
  const dir = dirFromKey(String(p.dir||'S').toUpperCase());
  const phase = (p.phase!=null && p.phase!=='') ? (+p.phase|0) : null;

  if(route==='sprite.svg'){
    const scale = Math.max(1, Math.min(64, Math.round(+(p.scale||16))||16));
    return new Response(frameSVG(g,dir,phase,scale), {headers:{
      'content-type':'image/svg+xml; charset=utf-8',
      'cache-control':'public, max-age=31536000, immutable', ...CORS }});
  }
  if(route==='sprite.json') return json({
    seed:g.seed, size:g.size, dir:dir.k, phase, archetype:g.opts.arch, role:g.role,
    glyph:g.glyph, tier:g.tier, item:g.item, domain:g.domain, good:g.good,
    head:g.head, face:g.face, ramps:g.ramps, rects:frameRects(g,dir,phase) });
  if(route==='walk.json'){
    const frames=g.opts.frames, dirs={};
    for(const d of DIR8){ dirs[d.k]=[]; for(let f=0;f<frames;f++) dirs[d.k].push(frameRects(g,d,f)); }
    return json({ seed:g.seed, size:g.size, frames, dirs });
  }
  if(route==='radial.svg' || route==='radial.json'){
    const rg = buildRadialGenome(p.seed!=null?String(p.seed):'echino:0', {
      arms:+p.arms||undefined, depth:p.depth!=null?+p.depth:undefined,
      splay:p.splay!=null?+p.splay:undefined, taper:p.taper!=null?+p.taper:undefined,
      writhe:p.writhe!=null?+p.writhe:undefined, glow:p.glow!=null?+p.glow:undefined,
      accentHue:p.accentHue!=null?+p.accentHue:undefined, size:p.size!=null?+p.size:undefined });
    if(route==='radial.svg'){
      const scale=Math.max(1,Math.min(48,Math.round(+(p.scale||12))||12));
      return new Response(radialSVG(rg, scale), {headers:{
        'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=31536000, immutable', ...CORS }});
    }
    return json({ seed:rg.seed, arms:rg.arms, depth:rg.depth, size:rg.size, rects:radialFrame(rg, null, rg.size) });
  }
  return json({error:'unknown endpoint', endpoints:['sprite.svg','sprite.json','walk.json','radial.svg','radial.json']}, 404);
}

// ── /bees/api/* — the portable BAKE for the swarm. Motion is live in the browser/engine; the
// appearance (the bee micro-atlas) is canvas-free, deterministic from the query, hence immutable.
function beesApi(url){
  const route = url.pathname.replace(/^\/bees\/api\/?/,'') || '';
  const p = Object.fromEntries(url.searchParams);
  if(route===''){ return json({
    service:'mega bee swarm api', portable:'appearance is its seed — bake once, simulate motion live',
    endpoints:{
      'GET /bees/api/atlas.json':'params: seed,headings(4..32) → baked micro-atlas: cells[bin][wingFrame] of {x,y,c}, the artifact an engine uploads to a texture',
      'GET /bees/api/bee.svg':'params: seed,heading(deg),wing(0|1),scale → one bee as image/svg+xml',
    }, note:'the swarm lab (live boids-lite + curl-noise sim) is the static page at /bees/' }); }

  const seed = p.seed!=null ? String(p.seed) : 'hive:0';
  if(route==='atlas.json'){
    const headings = Math.max(4, Math.min(32, (p.headings|0)||8));
    return json({ seed, ...beeAtlas(seed, { headings }) });
  }
  if(route==='bee.svg'){
    const heading = (+p.heading||0), wing = (+p.wing)?1:0;
    const scale = Math.max(1, Math.min(64, Math.round(+(p.scale||14))||14));
    return new Response(beeSVG(seed, heading, wing, scale), {headers:{
      'content-type':'image/svg+xml; charset=utf-8',
      'cache-control':'public, max-age=31536000, immutable', ...CORS }});
  }
  return json({error:'unknown endpoint', endpoints:['atlas.json','bee.svg']}, 404);
}
