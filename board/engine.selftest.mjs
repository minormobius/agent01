#!/usr/bin/env node
// board/engine.selftest.mjs — known-answer tests for the canvas core.
//
// Run: node board/engine.selftest.mjs
//
// The bar here is "would a browser have told me?" — and for nesting the answer
// is no. Dropping four notes into a child board and watching the arrows that
// crossed the boundary land on the portal is a five-second visual check that
// hides a dozen ways to lose an edge. So nesting, absorbing and unpacking get
// the most attention below, followed by the record round-trip (where a dropped
// field means silent data loss on the user's PDS).

import {
  mint, idFactory, createBoard, createItem, createEdge, atUri, parseAtUri,
  itemsBounds, rectContains, normalizeRect, screenToWorld, worldToScreen, zoomAt,
  panBy, cameraFor, viewportRect, hitTest, marqueeSelect, itemsInFrame, paintOrder,
  autoSide, anchorPoint, edgeGeometry, liveEdges, dedupeEdges,
  moveItems, deleteItems, bringToFront, alignItems, tidyItems,
  nest, absorb, unnest, boardLinks, withIdentity,
  toRecord, fromRecord, recordSize, sizeStatus, MIN_ZOOM, MAX_ZOOM,
} from './engine.js';

let passed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
const eq = (name, a, b) => ok(name, Object.is(a, b) || a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const near = (name, a, b, tol = 1e-6) => ok(name, Math.abs(a - b) <= tol, `expected ~${b}, got ${a}`);
const deep = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const DID = 'did:plc:testtesttesttesttesttest';
const NOW = '2026-07-28T12:00:00.000Z';

// ---------------------------------------------------------------- fixture --
// A parent board shaped like the thing this app is for: a cluster of three
// notes wired together, one outside note pointing into the cluster, and one
// unrelated note off on its own.
//
//    [a] → [b] → [c]        cluster (nested below)
//     ↑
//    [out]                  outside, points at a
//    [lone]                 outside, unconnected
function fixture() {
  const doc = createBoard({ rkey: '3kparent', did: DID, title: 'Parent', createdAt: NOW });
  doc.items = [
    createItem('text', { id: 'a', x: 0, y: 0, w: 100, h: 100, text: 'A' }),
    createItem('text', { id: 'b', x: 200, y: 0, w: 100, h: 100, text: 'B' }),
    createItem('text', { id: 'c', x: 400, y: 0, w: 100, h: 100, text: 'C' }),
    createItem('text', { id: 'out', x: 0, y: 400, w: 100, h: 100, text: 'Out' }),
    createItem('text', { id: 'lone', x: -600, y: -600, w: 100, h: 100, text: 'Lone' }),
  ];
  doc.edges = [
    createEdge('a', 'b', { id: 'e1' }),
    createEdge('b', 'c', { id: 'e2' }),
    createEdge('out', 'a', { id: 'e3' }),
    createEdge('out', 'b', { id: 'e4' }),
  ];
  return doc;
}

// ------------------------------------------------------------------- ids ---
{
  eq('mint is deterministic', mint(0), mint(0));
  ok('mint differs across seeds', mint(0) !== mint(1));
  ok('mint rolls over the alphabet', mint(31).length > mint(30).length || mint(31) !== mint(30));

  const doc = fixture();
  const next = idFactory(doc);
  const fresh = [next(), next(), next()];
  const taken = new Set([...doc.items.map((i) => i.id), ...doc.edges.map((e) => e.id)]);
  ok('idFactory avoids existing ids', fresh.every((id) => !taken.has(id)));
  eq('idFactory is internally unique', new Set(fresh).size, 3);

  deep('parseAtUri round-trips', parseAtUri(atUri(DID, '3kabc')), {
    did: DID, collection: 'com.minomobi.board.canvas', rkey: '3kabc',
  });
  eq('parseAtUri rejects junk', parseAtUri('https://example.com'), null);
}

// -------------------------------------------------------------- geometry ---
{
  const items = [
    createItem('text', { id: '1', x: 10, y: 20, w: 100, h: 50 }),
    createItem('text', { id: '2', x: -40, y: 0, w: 20, h: 20 }),
  ];
  deep('itemsBounds spans both', itemsBounds(items), { x: -40, y: 0, w: 150, h: 70 });
  eq('itemsBounds of nothing', itemsBounds([]), null);
  deep('normalizeRect flips a backwards drag', normalizeRect(100, 100, 20, 40), { x: 20, y: 40, w: 80, h: 60 });
  ok('rectContains is inclusive', rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }));
}

// ---------------------------------------------------------------- camera ---
{
  const cam = { x: 100, y: 50, zoom: 2 };
  const w = screenToWorld(cam, 40, 20);
  deep('screenToWorld', w, { x: 120, y: 60 });
  const s = worldToScreen(cam, w.x, w.y);
  near('worldToScreen inverts', s.x, 40);
  near('worldToScreen inverts (y)', s.y, 20);

  // The invariant that makes wheel-zoom feel right: the world point under the
  // cursor must not move.
  const zoomed = zoomAt(cam, 40, 20, 1.7);
  const after = screenToWorld(zoomed, 40, 20);
  near('zoomAt pins the cursor (x)', after.x, w.x, 1e-9);
  near('zoomAt pins the cursor (y)', after.y, w.y, 1e-9);
  eq('zoomAt clamps at the ceiling', zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 0, 0, 4).zoom, MAX_ZOOM);
  eq('zoomAt clamps at the floor', zoomAt({ x: 0, y: 0, zoom: MIN_ZOOM }, 0, 0, 0.1).zoom, MIN_ZOOM);

  const panned = panBy(cam, 20, -10);
  near('panBy moves the world opposite the drag', panned.x, 90);
  near('panBy y', panned.y, 55);

  const fit = cameraFor({ x: 0, y: 0, w: 1000, h: 500 }, 800, 600, 50);
  ok('cameraFor zooms out to fit', fit.zoom < 1 && fit.zoom > 0);
  const c = screenToWorld(fit, 400, 300);
  near('cameraFor centres the bounds (x)', c.x, 500, 1e-6);
  near('cameraFor centres the bounds (y)', c.y, 250, 1e-6);

  const vr = viewportRect({ x: 0, y: 0, zoom: 1 }, 800, 600, 100);
  deep('viewportRect includes the margin', vr, { x: -100, y: -100, w: 1000, h: 800 });
}

// ----------------------------------------------------------- hit testing ---
{
  const items = [
    createItem('frame', { id: 'f', x: 0, y: 0, w: 400, h: 400, title: 'Frame' }),
    createItem('text', { id: 't', x: 100, y: 100, w: 100, h: 100 }),
    createItem('text', { id: 'top', x: 120, y: 120, w: 60, h: 60, z: 5 }),
  ];
  eq('frame interior hits nothing', hitTest(items, { x: 320, y: 40 }), null);
  eq('frame border is grabbable', hitTest(items, { x: 4, y: 4 })?.id, 'f');
  eq('topmost z wins', hitTest(items, { x: 150, y: 150 })?.id, 'top');
  eq('miss returns null', hitTest(items, { x: -50, y: -50 }), null);

  eq('frames paint first', paintOrder(items)[0].id, 'f');

  deep('marquee encloses', marqueeSelect(items, { x: 90, y: 90, w: 120, h: 120 }).sort(), ['t', 'top']);
  eq('marquee ignores partial overlap', marqueeSelect(items, { x: 150, y: 150, w: 500, h: 500 }).length, 0);
  ok('touch mode grazes', marqueeSelect(items, { x: 150, y: 150, w: 500, h: 500 }, true).length >= 2);

  deep('itemsInFrame finds contents', itemsInFrame(items, items[0]).sort(), ['t', 'top']);
}

// ------------------------------------------------------------ edge routing --
{
  const a = createItem('text', { id: 'a', x: 0, y: 0, w: 100, h: 100 });
  const b = createItem('text', { id: 'b', x: 400, y: 0, w: 100, h: 100 });
  const above = createItem('text', { id: 'u', x: 0, y: -400, w: 100, h: 100 });

  eq('autoSide picks east for a right-hand neighbour', autoSide(a, { x: 450, y: 50 }), 'e');
  eq('autoSide picks north for one above', autoSide(a, { x: 50, y: -350 }), 'n');
  // A wide card should connect from its short sides even at a shallow angle.
  const wide = createItem('text', { id: 'w', x: 0, y: 0, w: 400, h: 40 });
  eq('autoSide respects aspect', autoSide(wide, { x: 200, y: -60 }), 'n');

  deep('anchorPoint east', anchorPoint(a, 'e'), { x: 100, y: 50 });

  const g = edgeGeometry(createEdge('a', 'b', { id: 'e' }), a, b);
  eq('edge leaves east', g.fromSide, 'e');
  eq('edge arrives west', g.toSide, 'w');
  deep('edge starts on the border', g.from, { x: 100, y: 50 });
  deep('edge ends on the border', g.to, { x: 400, y: 50 });
  ok('edge path is a cubic', /^M [\d.-]+ [\d.-]+ C /.test(g.path));
  near('straight edge arrives horizontally', g.angle, 0, 1e-6);
  near('midpoint sits on the chord', g.mid.y, 50, 1e-6);

  const vg = edgeGeometry(createEdge('u', 'a', { id: 'e' }), above, a);
  eq('vertical edge leaves south', vg.fromSide, 's');
  near('vertical edge points down', vg.angle, 90, 1e-6);

  const bent = edgeGeometry(createEdge('a', 'b', { id: 'e', bend: 60 }), a, b);
  ok('bend moves the midpoint off the chord', Math.abs(bent.mid.y - 50) > 10);

  const explicit = edgeGeometry(createEdge('a', 'b', { id: 'e', fromSide: 'n', toSide: 's' }), a, b);
  eq('explicit sides override auto', `${explicit.fromSide}${explicit.toSide}`, 'ns');
}

// -------------------------------------------------------- edge hygiene -----
{
  const doc = fixture();
  doc.edges.push(createEdge('a', 'ghost', { id: 'dangling' }));
  doc.edges.push(createEdge('a', 'a', { id: 'selfloop' }));
  const live = liveEdges(doc);
  ok('dangling edges are dropped', !live.some((e) => e.id === 'dangling'));
  ok('self-loops are dropped', !live.some((e) => e.id === 'selfloop'));

  const deduped = dedupeEdges([
    createEdge('x', 'y', { id: '1' }),
    createEdge('x', 'y', { id: '2' }),
    createEdge('y', 'x', { id: '3' }),
  ]);
  eq('dedupe collapses parallel edges', deduped.length, 2);
  eq('dedupe keeps the first', deduped[0].id, '1');
  ok('dedupe treats direction as significant', deduped.some((e) => e.id === '3'));
}

// -------------------------------------------------------------- mutations --
{
  const doc = fixture();
  const moved = moveItems(doc, ['a', 'b'], 10, -5);
  eq('moveItems shifts the selection', moved.items.find((i) => i.id === 'a').x, 10);
  eq('moveItems leaves the rest alone', moved.items.find((i) => i.id === 'c').x, 400);
  eq('moveItems does not mutate', doc.items.find((i) => i.id === 'a').x, 0);

  const pruned = deleteItems(doc, ['b']);
  eq('deleteItems removes the item', pruned.items.length, 4);
  ok('deleteItems removes its edges', !pruned.edges.some((e) => e.from === 'b' || e.to === 'b'));

  const raised = bringToFront(doc, ['lone']);
  ok('bringToFront raises z', raised.items.find((i) => i.id === 'lone').z > 0);

  const aligned = alignItems(doc, ['a', 'b', 'c'], 'left');
  eq('alignItems squares the left edges', new Set(['a', 'b', 'c'].map((id) => aligned.items.find((i) => i.id === id).x)).size, 1);

  const tidied = tidyItems(doc, ['a', 'b', 'c', 'out']);
  const grid = ['a', 'b', 'c', 'out'].map((id) => tidied.items.find((i) => i.id === id));
  eq('tidy lays out a square grid', new Set(grid.map((i) => i.x)).size, 2);
  eq('tidy uses two rows', new Set(grid.map((i) => i.y)).size, 2);
}

// ----------------------------------------------------------------- nest ----
{
  const doc = fixture();
  const res = nest(doc, ['a', 'b', 'c'], { rkey: '3kchild', did: DID, title: 'Cluster', createdAt: NOW });
  ok('nest returns both boards', !!res && !!res.parent && !!res.child);

  const { parent, child, portalId } = res;
  eq('parent loses the nested items', parent.items.filter((i) => ['a', 'b', 'c'].includes(i.id)).length, 0);
  eq('parent keeps the rest plus a portal', parent.items.length, 3);
  const portal = parent.items.find((i) => i.id === portalId);
  eq('portal is a portal', portal.kind, 'portal');
  eq('portal points at the child', portal.board, atUri(DID, '3kchild'));
  eq('portal carries a count', portal.count, 3);
  eq('portal id is fresh', doc.items.some((i) => i.id === portalId), false);

  // The portal replaces the selection where the selection was.
  const bb = itemsBounds(doc.items.filter((i) => ['a', 'b', 'c'].includes(i.id)));
  near('portal sits at the selection centre (x)', portal.x + portal.w / 2, bb.x + bb.w / 2, 0.5);
  near('portal sits at the selection centre (y)', portal.y + portal.h / 2, bb.y + bb.h / 2, 0.5);

  // The three edge rules.
  eq('internal edges move to the child', child.edges.length, 2);
  deep('…and they are the right ones', child.edges.map((e) => e.id).sort(), ['e1', 'e2']);
  eq('crossing edges survive in the parent', parent.edges.length, 1);
  eq('…re-pointed at the portal', parent.edges[0].to, portalId);
  eq('…and deduped (out→a and out→b became one)', parent.edges.filter((e) => e.to === portalId).length, 1);
  ok('no edge references a nested item', !parent.edges.some((e) => ['a', 'b', 'c'].includes(e.from) || ['a', 'b', 'c'].includes(e.to)));

  // Child geometry.
  const cbb = itemsBounds(child.items);
  near('child contents are centred on the origin (x)', cbb.x + cbb.w / 2, 0, 0.5);
  near('child contents are centred on the origin (y)', cbb.y + cbb.h / 2, 0, 0.5);
  ok('child keeps relative layout', child.items.find((i) => i.id === 'c').x - child.items.find((i) => i.id === 'a').x === 400);
  eq('child records its parent', child.parent, doc.uri);
  eq('…and its parent rkey, for the signed-out case', child.parentRkey, doc.rkey);
  eq('child knows its own uri', child.uri, atUri(DID, '3kchild'));

  eq('nest of an empty selection is a no-op', nest(doc, [], { rkey: 'x', did: DID }), null);
  eq('nest ignores unknown ids', nest(doc, ['nope'], { rkey: 'x', did: DID }), null);

  deep('boardLinks reports the portal', boardLinks(parent).children.map((c) => c.uri), [atUri(DID, '3kchild')]);
}

// --------------------------------------------------------------- unnest ----
{
  const doc = fixture();
  const { parent, child, portalId } = nest(doc, ['a', 'b', 'c'], { rkey: '3kchild', did: DID, title: 'Cluster', createdAt: NOW });
  const back = unnest(parent, portalId, child);

  eq('unnest restores every item', back.items.length, 5);
  ok('unnest removes the portal', !back.items.some((i) => i.id === portalId));
  ok('unnest restores internal edges', back.edges.some((e) => e.from === 'a' && e.to === 'b'));
  ok('unnest restores the second internal edge', back.edges.some((e) => e.from === 'b' && e.to === 'c'));

  // out→portal is re-attached to whichever restored item is nearest `out`.
  const rewired = back.edges.filter((e) => e.from === 'out');
  eq('the portal edge survives', rewired.length, 1);
  eq('…re-attached to the nearest restored item', rewired[0].to, 'a');

  // Round-trip geometry: contents land back where the portal was.
  const restoredBB = itemsBounds(back.items.filter((i) => ['a', 'b', 'c'].includes(i.id)));
  const portal = parent.items.find((i) => i.id === portalId);
  near('unnest re-centres on the portal (x)', restoredBB.x + restoredBB.w / 2, portal.x + portal.w / 2, 0.5);
  near('unnest re-centres on the portal (y)', restoredBB.y + restoredBB.h / 2, portal.y + portal.h / 2, 0.5);

  // Id collision: the child holds an item whose id is already used in the parent.
  const clashChild = { ...child, items: [...child.items, createItem('text', { id: 'lone', x: 0, y: 0, text: 'clash' })] };
  const clashed = unnest(parent, portalId, clashChild);
  eq('collisions are re-minted, not overwritten', clashed.items.filter((i) => i.id === 'lone').length, 1);
  eq('…and every id stays unique', new Set(clashed.items.map((i) => i.id)).size, clashed.items.length);
  eq('…so nothing is lost', clashed.items.length, 6);

  eq('unnest of a missing portal is a no-op', unnest(parent, 'nope', child), null);
}

// --------------------------------------------------------------- absorb ----
{
  const doc = fixture();
  const first = nest(doc, ['a'], { rkey: '3kchild', did: DID, title: 'Cluster', createdAt: NOW });
  const portalId = first.portalId;

  // Now drag b and c onto that portal.
  const res = absorb(first.parent, ['b', 'c'], first.child, portalId);
  ok('absorb returns both boards', !!res);
  eq('parent loses the absorbed items', res.parent.items.filter((i) => ['b', 'c'].includes(i.id)).length, 0);
  eq('child gains them', res.child.items.length, 3);
  eq('portal count is refreshed', res.parent.items.find((i) => i.id === portalId).count, 3);
  ok('absorbed items are parked clear of the existing contents',
    Math.min(...res.child.items.filter((i) => ['b', 'c'].includes(i.id)).map((i) => i.x))
      > Math.max(...first.child.items.map((i) => i.x + i.w)));
  ok('b→c came along', res.child.edges.some((e) => e.from === 'b' && e.to === 'c'));
  ok('every parent edge now lands on the portal',
    res.parent.edges.every((e) => e.from === portalId || e.to === portalId));
  eq('parent edges are deduped', res.parent.edges.length, 1);

  eq('absorb into a non-portal is a no-op', absorb(first.parent, ['b'], first.child, 'out'), null);
  eq('absorb of nothing is a no-op', absorb(first.parent, [], first.child, portalId), null);
  eq('a portal cannot absorb itself', absorb(first.parent, [portalId], first.child, portalId), null);

  // Id collision on absorb.
  const clashParent = {
    ...first.parent,
    items: [...first.parent.items, createItem('text', { id: 'a', x: 900, y: 900, text: 'another A' })],
  };
  const clash = absorb(clashParent, ['a'], first.child, portalId);
  eq('absorb re-mints colliding ids', new Set(clash.child.items.map((i) => i.id)).size, clash.child.items.length);
  eq('…keeping both', clash.child.items.length, 2);
}

// ------------------------------------------ signed-out → signed-in promote --
{
  // A board built before signing in: no did, so no at-uris anywhere.
  const local = createBoard({ rkey: '3klocal', title: 'Drafted offline', createdAt: NOW });
  local.items = [
    createItem('text', { id: 't', x: 0, y: 0, text: 'note' }),
    createItem('portal', { id: 'p', x: 200, y: 0, rkey: '3kchildlocal', title: 'Child', board: null }),
  ];
  eq('a local board has no uri', local.uri, null);
  eq('a local portal has no at-uri', local.items[1].board, null);

  // A board nested while signed out: reachable, but with no at-uri to point
  // home with until the DID exists.
  const child = createBoard({ rkey: '3kchildlocal', title: 'Child', parentRkey: '3klocal', createdAt: NOW });
  eq('a signed-out child has no parent uri', child.parent, null);
  eq('…but does know its parent rkey', child.parentRkey, '3klocal');
  eq('signing in resolves the back-link', withIdentity(child, DID).parent, atUri(DID, '3klocal'));

  const promoted = withIdentity(local, DID);
  eq('signing in gives the board a uri', promoted.uri, atUri(DID, '3klocal'));
  eq('…and fills in the portal', promoted.items[1].board, atUri(DID, '3kchildlocal'));
  eq('promotion does not mutate', local.uri, null);
  eq('promotion leaves other items alone', promoted.items[0].text, 'note');

  const already = withIdentity(promoted, 'did:plc:someoneelse');
  eq('an existing portal uri is never rewritten', already.items[1].board, atUri(DID, '3kchildlocal'));
}

// ------------------------------------------------------- serialisation -----
{
  const doc = fixture();
  doc.background = 'grid';
  doc.tags = ['research'];
  doc.camera = { x: -120.7, y: 40.2, zoom: 1.25 };
  doc.items.push(createItem('image', {
    id: 'img', x: 10.6, y: -3.2, w: 320, h: 240,
    image: { $type: 'blob', ref: { $link: 'bafkreiimage' }, mimeType: 'image/png', size: 1234 },
    alt: 'a diagram', aspectRatio: { width: 1600, height: 1200 }, tint: 'amber',
  }));
  doc.items.push(createItem('audio', {
    id: 'aud', x: 0, y: 700,
    audio: { $type: 'blob', ref: { $link: 'bafkreiaudio' }, mimeType: 'audio/webm', size: 9999 },
    durationMs: 4200, peaks: [0, 40, 100, 12], transcript: 'note to self',
  }));
  doc.items.push(createItem('weblink', { id: 'url', x: 0, y: 900, uri: 'https://example.com/x', title: 'Example', description: 'desc' }));
  doc.items.push(createItem('portal', { id: 'p', x: 0, y: 1100, board: atUri(DID, '3kchild'), title: 'Child', count: 4 }));
  doc.items.push(createItem('frame', { id: 'fr', x: -50, y: -50, w: 600, h: 400, title: 'Cluster' }));
  doc.items.push(createItem('ink', { id: 'ink', x: 0, y: 1300, strokes: [{ points: [0, 0, 500, 500, 1000, 200], width: 4, tint: 'rose' }] }));
  doc.items.push(createItem('embed', {
    id: 'emb', x: 0, y: 1500,
    record: { uri: 'at://did:plc:x/app.bsky.feed.post/3k', cid: 'bafyrecord' }, snapshot: '@someone: hello',
  }));

  const rec = toRecord(doc, NOW);
  eq('record carries its $type', rec.$type, 'com.minomobi.board.canvas');
  eq('record stamps updatedAt', rec.updatedAt, NOW);
  eq('camera zoom is an integer per-mille', rec.camera.zoom, 1250);
  eq('coordinates are rounded', rec.items.find((i) => i.id === 'img').x, 11);
  eq('every item has a content union', rec.items.every((i) => typeof i.content?.$type === 'string'), true);
  eq('image content is namespaced', rec.items.find((i) => i.id === 'img').content.$type, 'com.minomobi.board.defs#image');
  ok('blob refs survive verbatim',
    rec.items.find((i) => i.id === 'img').content.image.ref.$link === 'bafkreiimage');
  ok('empty optionals are stripped', !('label' in rec.items.find((i) => i.id === 'a')));
  ok('default arrow style is implicit', !('style' in rec.edges[0]));

  const back = fromRecord(rec, { did: DID, rkey: '3kparent', cid: 'bafyparent' });
  eq('round-trip keeps the title', back.title, doc.title);
  eq('round-trip keeps the item count', back.items.length, doc.items.length);
  eq('round-trip keeps the edge count', back.edges.length, doc.edges.length);
  eq('round-trip keeps background', back.background, 'grid');
  deep('round-trip keeps tags', back.tags, ['research']);
  near('round-trip keeps zoom', back.camera.zoom, 1.25, 1e-9);
  eq('round-trip keeps camera x', back.camera.x, -121);
  eq('round-trip restores kinds', back.items.find((i) => i.id === 'aud').kind, 'audio');
  eq('round-trip keeps peaks', back.items.find((i) => i.id === 'aud').peaks.length, 4);
  eq('round-trip keeps transcripts', back.items.find((i) => i.id === 'aud').transcript, 'note to self');
  eq('round-trip keeps alt text', back.items.find((i) => i.id === 'img').alt, 'a diagram');
  eq('round-trip keeps tint', back.items.find((i) => i.id === 'img').tint, 'amber');
  eq('round-trip keeps ink strokes', back.items.find((i) => i.id === 'ink').strokes[0].points.length, 6);
  eq('round-trip keeps embeds', back.items.find((i) => i.id === 'emb').record.cid, 'bafyrecord');
  eq('round-trip derives a portal rkey', back.items.find((i) => i.id === 'p').rkey, '3kchild');
  eq('round-trip records where it came from', back.uri, atUri(DID, '3kparent'));
  eq('round-trip records the cid', back.cid, 'bafyparent');

  // Idempotence: a save/load/save cycle must be byte-stable, or every reopen
  // writes a pointless new revision to the user's repo.
  deep('re-serialising is byte-stable', toRecord(back, NOW), rec);

  // Forward compatibility.
  const future = JSON.parse(JSON.stringify(rec));
  future.items.push({ id: 'ufo', x: 0, y: 0, content: { $type: 'com.minomobi.board.defs#hologram', spooky: true } });
  future.items.push({ id: 'noContent', x: 0, y: 0 });
  const survived = fromRecord(future, { did: DID, rkey: '3kparent' });
  eq('unknown content types are dropped, not crashed on', survived.items.length, doc.items.length);

  // Items whose bytes have not been uploaded yet must not reach the PDS.
  const half = { ...doc, items: [...doc.items, createItem('image', { id: 'pending', x: 0, y: 0, pending: 'idb:1' })] };
  const halfRec = toRecord(half, NOW);
  ok('an un-uploaded blob item is withheld', !halfRec.items.some((i) => i.id === 'pending'));
  eq('…and everything else still writes', halfRec.items.length, rec.items.length);
  ok('a portal with no target is withheld',
    !(toRecord({ ...doc, items: [createItem('portal', { id: 'orphan', x: 0, y: 0, board: null })], edges: [] }, NOW).items || []).length);
  // An empty board is a legal record — `items` simply goes missing, and must
  // come back as an empty board rather than an exception.
  eq('an empty board round-trips', fromRecord(toRecord(createBoard({ title: 'Empty', createdAt: NOW }), NOW), {}).items.length, 0);

  const size = recordSize(doc, NOW);
  ok('recordSize is plausible', size > 200 && size < 20000, String(size));
  eq('sizeStatus ok', sizeStatus(1000), 'ok');
  eq('sizeStatus warn', sizeStatus(700 * 1024), 'warn');
  eq('sizeStatus over', sizeStatus(1000 * 1024), 'over');
}

// ----------------------------------------------- nest → save → load → unnest --
// The full lifecycle, through the wire format, because that is what actually
// happens: you nest today, the boards are written as two records, and you
// unpack tomorrow from what was read back.
{
  const doc = fixture();
  const { parent, child, portalId } = nest(doc, ['a', 'b', 'c'], { rkey: '3kchild', did: DID, title: 'Cluster', createdAt: NOW });

  const parentBack = fromRecord(toRecord(parent, NOW), { did: DID, rkey: '3kparent' });
  const childBack = fromRecord(toRecord(child, NOW), { did: DID, rkey: '3kchild' });

  eq('the portal survives a round-trip', parentBack.items.find((i) => i.id === portalId)?.kind, 'portal');
  const merged = unnest(parentBack, portalId, childBack);
  eq('lifecycle restores every item', merged.items.length, 5);
  eq('lifecycle restores every edge', merged.edges.length, 3);
  deep('lifecycle restores the exact graph',
    merged.edges.map((e) => `${e.from}->${e.to}`).sort(),
    ['a->b', 'b->c', 'out->a']);
}

// -------------------------------------------------------------- results ----
if (failures.length) {
  console.error(`board/engine: ${failures.length} FAILED, ${passed} passed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`board/engine: ${passed} assertions passed`);
