// scene.js — the look of the cell. No simulation happens here.
//
// The arm's SHAPE is not invented: every link is drawn between two consecutive
// joint origins taken straight out of arm.js's forward kinematics, so the
// proportions are the AR4 MK3's own and a change to the URDF transcription
// shows up on screen without touching this file. What is ours is the shell —
// the AR4's real STL meshes are megabytes and this surface ships as static
// assets with no build step, so the links are drawn as machined-looking
// housings sized to the real bones underneath.
//
// Everything here is core three.js. No loaders, no examples/ modules, nothing
// fetched at runtime — the environment map is generated in a few lines rather
// than shipped as an HDR, because a metal arm with no environment to reflect
// looks like grey plastic and that was not acceptable for this one.

import * as THREE from '../vendor/three.module.min.js';
import { forward, JOINTS, GRIPPER, TCP_OFFSET } from './arm.js';
import { CELL, PARTS } from './game.js';

const PAL = {
  shell: 0xd9dde2,       // machined aluminium housings
  shellDark: 0x2f343a,   // graphite castings
  accent: 0xf08a2a,      // the safety-orange every robot cell has
  jaw: 0x9aa3ad,
  floor: 0x14161a,
  belt: 0x1b1f24,
  rail: 0x3d444c,
  product: 0x3f7fd0,     // blue spheres
  reject: 0xe0463c,      // red wedges
};

// A tiny procedural environment: a vertical gradient, PMREM'd into a proper
// roughness-aware env map. This is what makes the metal read as metal.
function makeEnvironment(renderer) {
  const w = 64, h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    // Bright cool ceiling fading to a dark floor, with a warm band at the
    // horizon so the highlights are not all the same colour.
    const sky = [206, 218, 232], mid = [120, 108, 96], gnd = [16, 17, 20];
    const c = t < 0.5
      ? sky.map((v, i) => v + (mid[i] - v) * (t / 0.5))
      : mid.map((v, i) => v + (gnd[i] - v) * ((t - 0.5) / 0.5));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

const metal = (color, roughness = 0.42, metalness = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1.0 });

// A rounded housing: a box with its long axis along +y, the way a link runs.
function housing(len, w, d, mat) {
  const g = new THREE.BoxGeometry(w, len, d);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c0f);
  scene.environment = makeEnvironment(renderer);
  scene.fog = new THREE.Fog(0x0a0c0f, 1.6, 4.2);

  // Framed deliberately: close enough that the arm fills the frame, low enough
  // that the belt leads the eye in from the left, and offset so the tote is in
  // shot without competing with the gripper.
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
  camera.position.set(0.70, -1.00, 0.62);
  camera.up.set(0, 0, 1);
  camera.lookAt(0.02, -0.30, 0.17);

  // ---- lighting ---------------------------------------------------------
  // Key from high and to the side so the arm casts a readable shadow onto the
  // belt, a cool fill from the opposite side, and a warm rim to lift the
  // silhouette off the background.
  const key = new THREE.DirectionalLight(0xfff2e0, 3.1);
  key.position.set(0.95, -0.35, 1.75);
  key.target.position.set(0, -0.34, 0.12);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 4.5;
  const s = 0.95;
  key.shadow.camera.left = -s; key.shadow.camera.right = s;
  key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.012;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9dbbe0, 0.65);
  fill.position.set(-1.4, -0.6, 0.7);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffb066, 0.9);
  rim.position.set(-0.5, 1.3, 0.5);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0x8fa6c0, 0.28));

  // A practical over the pick point. The gripper works down at belt level where
  // the key light is partly blocked by the arm's own forearm, and without this
  // the business end of the whole game sits in its own shadow.
  const workLamp = new THREE.SpotLight(0xffe9cc, 9.0, 1.6, 0.62, 0.6, 1.6);
  workLamp.position.set(-0.10, -0.62, 0.85);
  workLamp.target.position.set(0, CELL.beltY, CELL.beltTopZ);
  scene.add(workLamp.target);
  scene.add(workLamp);

  // ---- the floor --------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.88, metalness: 0.04 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  // Bay markings. Without something on it the floor is a black void and the
  // arm has nothing to sit on; a faint grid gives the shadows a surface to
  // fall across and the eye a sense of scale.
  const grid = new THREE.GridHelper(6, 40, 0x2b323a, 0x1e242b);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  // A back wall, so the silhouette has something to read against instead of
  // fading into the fog.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3),
    new THREE.MeshStandardMaterial({ color: 0x171b21, roughness: 0.95, metalness: 0.0 }),
  );
  wall.position.set(0, 1.15, 1.5);
  wall.rotation.x = Math.PI / 2;
  wall.receiveShadow = true;
  scene.add(wall);

  // ---- the conveyor -----------------------------------------------------
  const beltLen = (CELL.beltToX - CELL.beltFromX) + 0.5;
  const beltMidX = (CELL.beltToX + CELL.beltFromX) / 2;
  const beltGroup = new THREE.Group();
  beltGroup.position.set(beltMidX, CELL.beltY, 0);
  scene.add(beltGroup);

  const beltMat = new THREE.MeshStandardMaterial({ color: PAL.belt, roughness: 0.75, metalness: 0.1 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(beltLen, CELL.beltHalfWidth * 2, 0.04), beltMat);
  bed.position.z = CELL.beltTopZ - 0.02;
  bed.castShadow = true; bed.receiveShadow = true;
  beltGroup.add(bed);

  // Cleats, so the belt visibly runs. They are scrolled in update().
  const cleats = [];
  const cleatGeo = new THREE.BoxGeometry(0.012, CELL.beltHalfWidth * 2 - 0.01, 0.008);
  const cleatMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.6, metalness: 0.25 });
  const CLEAT_GAP = 0.09;
  for (let i = 0; i < Math.ceil(beltLen / CLEAT_GAP) + 1; i++) {
    const c = new THREE.Mesh(cleatGeo, cleatMat);
    c.position.z = CELL.beltTopZ + 0.001;
    c.receiveShadow = true;
    beltGroup.add(c);
    cleats.push(c);
  }

  const railMat = metal(PAL.rail, 0.55, 0.7);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(beltLen, 0.012, 0.05), railMat);
    rail.position.set(0, side * (CELL.beltHalfWidth + 0.006), CELL.beltTopZ + 0.012);
    rail.castShadow = true; rail.receiveShadow = true;
    beltGroup.add(rail);
  }
  // Legs.
  for (const lx of [-beltLen * 0.36, beltLen * 0.36]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, CELL.beltTopZ - 0.04), railMat);
      leg.position.set(lx, side * (CELL.beltHalfWidth - 0.02), (CELL.beltTopZ - 0.04) / 2);
      leg.castShadow = true;
      beltGroup.add(leg);
    }
  }

  // ---- the tote ---------------------------------------------------------
  const tote = new THREE.Group();
  tote.position.set(CELL.binX, CELL.binY, 0);
  scene.add(tote);
  const toteMat = new THREE.MeshStandardMaterial({ color: 0x24303c, roughness: 0.8, metalness: 0.15 });
  const R = CELL.binRadius;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, 0.008, CELL.binZ), toteMat);
    wall.position.set(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, CELL.binZ / 2);
    wall.rotation.z = a + Math.PI / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    tote.add(wall);
  }
  const toteFloor = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, R * 1.5, 0.006), toteMat);
  toteFloor.position.z = 0.003;
  toteFloor.receiveShadow = true;
  tote.add(toteFloor);

  // ---- the arm ----------------------------------------------------------
  // One group per joint. Each frame's world matrix comes from arm.js; the
  // shells are hung off those frames, so the drawing follows the kinematics
  // rather than duplicating them.
  const armGroup = new THREE.Group();
  scene.add(armGroup);

  const shellMat = metal(PAL.shell, 0.35, 0.9);
  const darkMat = metal(PAL.shellDark, 0.5, 0.7);
  const accentMat = new THREE.MeshStandardMaterial({ color: PAL.accent, roughness: 0.45, metalness: 0.3 });

  // Pedestal.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.112, 0.070, 40), darkMat);
  base.rotation.x = Math.PI / 2;
  base.position.z = 0.035;
  base.castShadow = true; base.receiveShadow = true;
  armGroup.add(base);
  // The safety-orange ring every cell has around the base of the robot.
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.0032, 8, 40), accentMat);
  baseRing.position.z = 0.070;
  baseRing.castShadow = true;
  armGroup.add(baseRing);
  // A bolted plate, so it is standing on the floor rather than hovering.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.010, 40),
    metal(0x1a1e24, 0.7, 0.5));
  plate.rotation.x = Math.PI / 2;
  plate.position.z = 0.005;
  plate.receiveShadow = true; plate.castShadow = true;
  armGroup.add(plate);

  // A link is a housing spanning two joint origins, rebuilt each frame by
  // repositioning rather than regenerating geometry.
  const linkMeshes = [];
  const jointMeshes = [];
  const LINK_W = [0.085, 0.070, 0.058, 0.050, 0.044, 0.040];
  for (let i = 0; i < JOINTS.length; i++) {
    const m = housing(1, LINK_W[i], LINK_W[i] * 0.86, i === 0 ? darkMat : shellMat);
    armGroup.add(m);
    linkMeshes.push(m);
    // The actuator at each joint: a barrel with an orange collar.
    const jg = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(LINK_W[i] * 0.56, LINK_W[i] * 0.56, LINK_W[i] * 0.92, 24), darkMat);
    barrel.castShadow = true; barrel.receiveShadow = true;
    jg.add(barrel);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(LINK_W[i] * 0.58, LINK_W[i] * 0.085, 8, 24), accentMat);
    collar.rotation.x = Math.PI / 2;
    jg.add(collar);
    armGroup.add(jg);
    jointMeshes.push(jg);
  }

  // The gripper: a body and two jaws that slide apart.
  const gripGroup = new THREE.Group();
  armGroup.add(gripGroup);
  const gripBody = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.046, 0.036), darkMat);
  gripBody.castShadow = true;
  gripGroup.add(gripBody);
  const jawMat = metal(PAL.jaw, 0.35, 0.8);
  const jaws = [];
  for (let i = 0; i < 2; i++) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.014, GRIPPER.fingerLen), jawMat);
    j.castShadow = true;
    gripGroup.add(j);
    jaws.push(j);
  }

  // ---- parts ------------------------------------------------------------
  const sphereGeo = new THREE.SphereGeometry(PARTS.sphereR, 24, 16);
  // A red TRIANGLE: a triangular prism, so it reads as a triangle from the
  // camera and still has a body to be gripped.
  const wedgeGeo = new THREE.CylinderGeometry(PARTS.wedgeR, PARTS.wedgeR, 0.013, 3);
  const productMat = new THREE.MeshStandardMaterial({ color: PAL.product, roughness: 0.28, metalness: 0.1 });
  const rejectMat = new THREE.MeshStandardMaterial({
    color: PAL.reject, roughness: 0.34, metalness: 0.1,
    emissive: new THREE.Color(PAL.reject).multiplyScalar(0.16),
  });
  const partPool = [];
  function partMesh(i) {
    if (!partPool[i]) {
      const g = new THREE.Group();
      const sp = new THREE.Mesh(sphereGeo, productMat);
      const wd = new THREE.Mesh(wedgeGeo, rejectMat);
      wd.rotation.x = Math.PI / 2;
      for (const m of [sp, wd]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      g.userData = { sp, wd };
      scene.add(g);
      partPool[i] = g;
    }
    return partPool[i];
  }

  // Scratch objects, so update() allocates nothing per frame.
  const M = new THREE.Matrix4();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vUp = new THREE.Vector3();

  function setFromMat(obj, m) {
    M.set(
      m[0], m[1], m[2], m[3],
      m[4], m[5], m[6], m[7],
      m[8], m[9], m[10], m[11],
      m[12], m[13], m[14], m[15],
    );
    M.decompose(obj.position, obj.quaternion, obj.scale);
  }

  // Stretch a housing so it spans a to b, keeping its local +y along the span.
  function spanHousing(mesh, a, b, minLen = 0.02) {
    vA.set(a.x, a.y, a.z); vB.set(b.x, b.y, b.z);
    const mid = vA.clone().add(vB).multiplyScalar(0.5);
    const dir = vB.clone().sub(vA);
    const len = Math.max(minLen, dir.length());
    mesh.position.copy(mid);
    mesh.scale.set(1, len, 1);
    if (dir.lengthSq() > 1e-12) {
      dir.normalize();
      vUp.set(0, 1, 0);
      mesh.quaternion.setFromUnitVectors(vUp, dir);
    }
    mesh.visible = true;
  }

  let beltScroll = 0;

  function update(st, dt) {
    // The arm, straight off the kinematics.
    const f = forward(st.q);
    const origins = [{ x: 0, y: 0, z: 0 }];
    for (const m of f.frames) origins.push({ x: m[3], y: m[7], z: m[11] });

    for (let i = 0; i < JOINTS.length; i++) {
      spanHousing(linkMeshes[i], origins[i], origins[i + 1]);
      // Hide a zero-length link (joint_4 sits exactly on joint_3) rather than
      // drawing a degenerate stub.
      const d = Math.hypot(
        origins[i + 1].x - origins[i].x,
        origins[i + 1].y - origins[i].y,
        origins[i + 1].z - origins[i].z);
      linkMeshes[i].visible = d > 0.012;
      setFromMat(jointMeshes[i], f.frames[i]);
    }

    // Gripper: sit it on the gripper base frame and slide the jaws.
    setFromMat(gripGroup, f.gripBase);
    gripBody.position.set(0, -GRIPPER.jawOffset * 0.5, 0);
    const open = st.jaw * GRIPPER.jawTravel;
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      jaws[i].position.set(sgn * (0.006 + open), -GRIPPER.jawOffset - GRIPPER.fingerLen * 0.5, 0);
      jaws[i].rotation.set(Math.PI / 2, 0, 0);
    }

    // The belt cleats scroll with the line.
    beltScroll = (beltScroll + CELL.beltSpeed * dt) % CLEAT_GAP;
    for (let i = 0; i < cleats.length; i++) {
      cleats[i].position.x = -beltLen / 2 + i * CLEAT_GAP + beltScroll;
    }

    // Parts.
    let n = 0;
    for (const p of st.parts) {
      if (p.gone && !p.held) continue;
      const g = partMesh(n++);
      g.visible = true;
      g.position.set(p.x, p.y, p.z);
      const isReject = p.kind === 'reject';
      g.userData.sp.visible = !isReject;
      g.userData.wd.visible = isReject;
      g.rotation.z = p.spin + (isReject ? 0 : 0);
      if (!isReject) {
        // Spheres roll along the line.
        g.userData.sp.rotation.y = p.x / PARTS.sphereR;
      }
    }
    for (let i = n; i < partPool.length; i++) if (partPool[i]) partPool[i].visible = false;
  }

  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render() { renderer.render(scene, camera); }

  return { scene, camera, renderer, update, resize, render };
}
