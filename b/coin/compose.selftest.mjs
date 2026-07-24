// node b/coin/compose.selftest.mjs
// Gates the composer's machinery: facet byte-offsets (a UTF-16 offset silently
// mis-links any post containing an emoji), grapheme counting, and the thread
// reply wiring — a thread whose 3rd post points at the wrong root renders as
// orphan replies rather than a chain.
import { linkFacets, textLength, postThread, postUrl, LIMIT } from './compose.js';
let f=0; const ck=(c,m)=>{c?console.log('  ✓ '+m):(f++,console.error('  ✗ '+m));};

console.log('— link facets (byte offsets, not UTF-16) —');
{
  const t='see https://example.com/x now';
  const [fa]=linkFacets(t);
  const enc=new TextEncoder();
  ck(enc.encode(t).slice(fa.index.byteStart,fa.index.byteEnd).length>0,'facet spans bytes');
  ck(new TextDecoder().decode(enc.encode(t).slice(fa.index.byteStart,fa.index.byteEnd))==='https://example.com/x','facet covers exactly the URL');
  const emoji='🎲🎲 https://a.io/b';
  const [g]=linkFacets(emoji);
  ck(new TextDecoder().decode(enc.encode(emoji).slice(g.index.byteStart,g.index.byteEnd))==='https://a.io/b','emoji before a link does not shift the offsets');
  ck(linkFacets('end https://a.io/b.')[0]?.features[0].uri==='https://a.io/b','trailing punctuation trimmed');
}
console.log('— grapheme counting —');
{
  ck(textLength('abc')===3,'ascii');
  ck(textLength('👨‍👩‍👧‍👦')===1,'a family emoji is one grapheme, not 11 code units');
  ck(LIMIT===300,'limit is 300');
}
console.log('— thread wiring —');
{
  const calls=[];
  const pds={ async createRecord(col,rec){ calls.push(rec); const n=calls.length; return {uri:'at://d/app.bsky.feed.post/p'+n, cid:'cid'+n}; } };
  const segs=[{text:'one',images:[]},{text:'two',images:[]},{text:'three',images:[{blobRef:{$type:'blob'},alt:'a',width:10,height:5}]}];
  const res=await postThread(segs,pds);
  ck(res.length===3,'three posts created');
  ck(!calls[0].reply,'root has no reply');
  ck(calls[1].reply.root.uri==='at://d/app.bsky.feed.post/p1' && calls[1].reply.parent.uri==='at://d/app.bsky.feed.post/p1','2nd replies to root');
  ck(calls[2].reply.root.uri==='at://d/app.bsky.feed.post/p1','3rd keeps the ROOT (chain, not orphan)');
  ck(calls[2].reply.parent.uri==='at://d/app.bsky.feed.post/p2','3rd parents to the 2nd');
  ck(calls[2].embed.$type==='app.bsky.embed.images' && calls[2].embed.images[0].aspectRatio.width===10,'images embed with aspect ratio');
  ck(postUrl(res[0].uri)==='https://bsky.app/profile/d/post/p1','permalink built');
}
console.log(f?`\n✗ ${f} failed`:'\n✓ all passed');
process.exit(f?1:0);
