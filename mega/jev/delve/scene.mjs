// scene.mjs — the spinnable 3D dungeon.
//
// Browser-only (it imports three), so it is NOT covered by the node
// selftests; it is verified by driving the real page in a headless browser.
// Anything here that is pure arithmetic and worth asserting belongs in
// delve.mjs or telemetry.mjs instead, where node can reach it.
//
// The geometry is the canonical foam-dungeon document, used as-is:
//   room.outline  — rings of [x, z] in metres; ring 0 is the outer wall,
//                   any further rings are holes. Extruded into a floor slab.
//   room.floorY   — the slab's height. The dungeon is genuinely 3D; rooms
//                   stack, which is why a flat plan of it overlaps.
//   room.doors[].at — [x, y, z] of each doorway
//   trapdoors     — vertical links, drawn as dashed drops
//
// three.js r160, vendored at vendor/ (the same pinned build foam uses) —
// no build step, no CDN, matching the house pattern.

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

// The sequential depth ramp, as three colours. Same hues as the CSS ramp:
// one hue, monotonic in lightness, shallow -> deep.
const RAMP_LIGHT = [0xddefee, 0xa9d9d6, 0x6fbeba, 0x3d9a96, 0x1f6b68];
const RAMP_DARK = [0x183634, 0x235f5c, 0x33908b, 0x4fc3be, 0x8fdeda];

const DELVER = 0xd64c77;
const VAULT = 0xb8720c;
const VAULT_DARK = 0xe0a64a;

export function createScene(canvas, world, { dark = false } = {}) {
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT;
  const bg = dark ? 0x0f1219 : 0xf2f4f8;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 40, 160);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 0.9;

  scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.75 : 0.95));
  const key = new THREE.DirectionalLight(0xffffff, dark ? 1.1 : 0.8);
  key.position.set(1, 2, 0.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(dark ? 0x4fc3be : 0x237e7a, 0.35);
  rim.position.set(-1, -0.4, -0.8);
  scene.add(rim);

  // ---------------------------------------------------------- the rooms ---
  const rooms = [...world.rooms.values()];
  const maxDepth = Math.max(1, world.maxDepth);
  const rampIndex = (d) => Math.min(ramp.length - 1, Math.floor((d / maxDepth) * ramp.length));

  // Centre the whole dungeon on the origin so orbiting feels right, and frame
  // it from its true 3D extent. Using only the centroids' x/z (as a plan view
  // would) leaves the camera too far out and the model floating in the top of
  // the canvas: this dungeon is 14 levels deep, so its vertical extent is a
  // large part of what has to fit.
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const swallow = (x, y, z) => {
    if (x < box.minX) box.minX = x; if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y; if (y > box.maxY) box.maxY = y;
    if (z < box.minZ) box.minZ = z; if (z > box.maxZ) box.maxZ = z;
  };
  for (const r of rooms) {
    swallow(r.centroid[0], r.floorY, r.centroid[2]);
    for (const ring of r.outline || []) for (const [x, z] of ring) swallow(x, r.floorY, z);
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const sizeX = box.maxX - box.minX, sizeY = box.maxY - box.minY, sizeZ = box.maxZ - box.minZ;
  // radius of the bounding sphere, then the distance at which it fills the view
  const radius = Math.max(6, 0.5 * Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ));

  const world3 = new THREE.Group();
  world3.position.set(-cx, -cy, -cz);
  scene.add(world3);

  const slabByRoom = new Map();
  const baseColorByRoom = new Map();

  for (const room of rooms) {
    const rings = room.outline || [];
    if (!rings.length) continue;

    // ring 0 is the outer wall; the rest are holes
    const shape = new THREE.Shape(rings[0].map(([x, z]) => new THREE.Vector2(x, z)));
    for (let i = 1; i < rings.length; i++) {
      shape.holes.push(new THREE.Path(rings[i].map(([x, z]) => new THREE.Vector2(x, z))));
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
    // shapes are built in XY; lay them flat into XZ
    geo.rotateX(Math.PI / 2);

    const color = new THREE.Color(ramp[rampIndex(room.depth)]);
    baseColorByRoom.set(room.id, color.clone());
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = room.floorY;
    mesh.userData.roomId = room.id;
    world3.add(mesh);
    slabByRoom.set(room.id, mesh);

    // a wire outline makes the stacking legible where slabs overlap in plan
    const pts = rings[0].map(([x, z]) => new THREE.Vector3(x, room.floorY + 0.36, z));
    const edge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 }),
    );
    world3.add(edge);
  }

  // ---------------------------------------------------------- the doors ---
  const doorGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const doorMat = new THREE.MeshBasicMaterial({ color: dark ? 0x7c8296 : 0x9aa0ae });
  const seenDoor = new Set();
  for (const room of rooms) {
    for (const d of room.exits) {
      const key2 = [room.id, d.to].sort((a, b) => a - b).join('-');
      if (seenDoor.has(key2)) continue;
      seenDoor.add(key2);
      const m = new THREE.Mesh(doorGeo, doorMat);
      m.position.set(d.at[0], d.at[1] + 0.4, d.at[2]);
      world3.add(m);
    }
  }

  // --------------------------------------------------- entrance & vaults ---
  const ent = world.rooms.get(world.entrance);
  if (ent) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshBasicMaterial({ color: dark ? 0xe9ecf3 : 0x161923, wireframe: true }),
    );
    m.position.set(ent.centroid[0], ent.floorY + 1.4, ent.centroid[2]);
    world3.add(m);
  }
  const vaultMeshes = new Map();
  for (const id of world.endpoints) {
    const v = world.rooms.get(id);
    if (!v) continue;
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: dark ? VAULT_DARK : VAULT, wireframe: true }),
    );
    m.position.set(v.centroid[0], v.floorY + 1.6, v.centroid[2]);
    world3.add(m);
    vaultMeshes.set(id, m);
  }

  // ------------------------------------------------------- the trapdoors ---
  for (const t of world.trapdoors || []) {
    const a = world.rooms.get(t.fromRoom);
    const b = world.rooms.get(t.toRoom);
    if (!a || !b) continue;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.centroid[0], a.floorY, a.centroid[2]),
        new THREE.Vector3(b.centroid[0], b.floorY, b.centroid[2]),
      ]),
      new THREE.LineDashedMaterial({ color: dark ? 0xe0a64a : 0xb8720c, dashSize: 0.5, gapSize: 0.4 }),
    );
    line.computeLineDistances();
    world3.add(line);
  }

  // ---------------------------------------------------------- the delver ---
  const delver = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 12),
    new THREE.MeshBasicMaterial({ color: DELVER }),
  );
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.08, 8, 32),
    new THREE.MeshBasicMaterial({ color: DELVER, transparent: true, opacity: 0.85 }),
  );
  halo.rotation.x = Math.PI / 2;
  delver.add(body, halo);
  world3.add(delver);

  // the trail it has actually walked
  const trailMat = new THREE.LineBasicMaterial({ color: dark ? 0x4fc3be : 0x237e7a, linewidth: 2 });
  let trail = new THREE.Line(new THREE.BufferGeometry(), trailMat);
  world3.add(trail);

  // ------------------------------------------------------------- camera ---
  // Distance that makes the bounding sphere fill the frame, accounting for
  // the narrower of the two FOVs so it fits in portrait as well as landscape.
  function fitDistance() {
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.63;
  }
  function frameAll() {
    const d = fitDistance();
    const k = d / Math.sqrt(3);
    camera.position.set(k, k * 0.62, k);
    controls.target.set(0, 0, 0);
    camera.near = Math.max(0.1, d / 500);
    camera.far = d * 6;
    camera.updateProjectionMatrix();
    scene.fog.near = d * 0.6;
    scene.fog.far = d * 2.6;
    controls.update();
  }

  let raf = 0;
  let t0 = performance.now();
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = performance.now();
    const dt = (t - t0) / 1000; t0 = t;
    halo.rotation.z += dt * 1.2;
    body.scale.setScalar(1 + Math.sin(t / 260) * 0.07);
    for (const m of vaultMeshes.values()) m.rotation.y += dt * 0.6;
    controls.update();
    renderer.render(scene, camera);
  }
  frame();

  let framed = false;
  function resize() {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // frame once the canvas has a real size; re-framing on every resize would
    // yank the camera back while someone is orbiting
    if (!framed && w > 1 && h > 1) { frameAll(); framed = true; }
  }
  resize();
  frameAll();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let lastRoom = null;
  return {
    /** Move the marker, light the current room, redraw the trail. */
    update(run) {
      const here = world.rooms.get(run.at);
      if (here) {
        delver.position.set(here.centroid[0], here.floorY + 1.6, here.centroid[2]);
      }
      if (run.at !== lastRoom) {
        // the room the delver stands in is opaque; everything else recedes
        for (const [id, mesh] of slabByRoom) {
          const visited = run.visited.has(id);
          mesh.material.opacity = id === run.at ? 0.92 : visited ? 0.5 : 0.18;
          mesh.material.color.copy(baseColorByRoom.get(id));
          if (id === run.at) mesh.material.color.lerp(new THREE.Color(DELVER), 0.28);
        }
        lastRoom = run.at;
      }
      const pts = run.trail
        .map((id) => world.rooms.get(id))
        .filter(Boolean)
        .map((r) => new THREE.Vector3(r.centroid[0], r.floorY + 0.9, r.centroid[2]));
      trail.geometry.dispose();
      trail.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    },
    setSpin(on) { controls.autoRotate = on; },
    getSpin() { return controls.autoRotate; },
    resetView() { frameAll(); },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
