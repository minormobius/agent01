// scene.js — two marionettes on a small stage. No simulation happens here.
//
// The figures are drawn entirely from puppet.js's pose(), so the shape on
// screen is the shape the physics computed and the selftest measured. Nothing
// here nudges a limb for looks.
//
// The strings are the one piece of deliberate theatre. They are drawn from the
// control bar down to the hands and feet whether or not they are being pulled,
// because a marionette with strings only when it is moving is not a marionette
// — and they GO TAUT AND BRIGHTEN when their key is down, which is the one
// piece of information the player is otherwise reading indirectly. That is a
// real choice with a cost: it makes the WATCH phase easier than pure mimicry
// would be. It is made deliberately, because a player who cannot see the
// strings is not reading a puppet, they are decoding a cipher.

import * as THREE from '../vendor/three.module.min.js';
import { pose, RIG } from './puppet.js';

const PAL = {
  rivalBody: 0xe8e2d2, rivalJoint: 0x8fa8c8, rivalCloth: 0x4a6f9c,
  mineBody: 0xf0e0c8, mineJoint: 0xd8a04c, mineCloth: 0xa8632c,
  bar: 0x6b5334,
  stage: 0x2a1f16,
  string: 0xb9a077,
  stringLive: 0xfff0c0,
};

function makeEnvironment(renderer) {
  const w = 64, h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const sky = [120, 116, 128], mid = [96, 78, 62], gnd = [18, 14, 12];
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
  pmrem.dispose(); tex.dispose();
  return env;
}

// A limb segment: a tapered cylinder that gets re-aimed between two points
// every frame rather than rebuilt.
function segment(rTop, rBot, mat) {
  const g = new THREE.CylinderGeometry(rTop, rBot, 1, 12);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);
function spanTo(mesh, ax, ay, bx, by, minLen = 0.01) {
  vA.set(ax, ay, 0); vB.set(bx, by, 0);
  const dir = vB.clone().sub(vA);
  const len = Math.max(minLen, dir.length());
  mesh.position.copy(vA).add(vB).multiplyScalar(0.5);
  mesh.scale.set(1, len, 1);
  if (dir.lengthSq() > 1e-12) {
    dir.normalize();
    mesh.quaternion.setFromUnitVectors(vUp, dir);
  }
}

function buildPuppet(colors) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.62, metalness: 0.05 });
  const joint = new THREE.MeshStandardMaterial({ color: colors.joint, roughness: 0.4, metalness: 0.35 });
  const cloth = new THREE.MeshStandardMaterial({ color: colors.cloth, roughness: 0.85, metalness: 0.0 });

  // Torso and head, carved-looking.
  // Unit height, because spanTo() scales y by the span. A capsule of its own
  // natural length gets scaled by the span on top of that and comes out a
  // stubby fraction of the right size — which is what happened first time.
  const torso = segment(0.088, 0.076, cloth);
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(RIG.headR, 22, 16), body);
  head.castShadow = true;
  g.add(head);
  // A collar, so the head reads as attached rather than floating.
  const collar = segment(0.042, 0.062, joint);
  g.add(collar);

  const segs = [];
  const balls = [];
  for (let i = 0; i < 4; i++) {
    const isArm = i < 2;
    segs.push([
      segment(isArm ? 0.030 : 0.040, isArm ? 0.024 : 0.032, body),
      segment(isArm ? 0.024 : 0.032, isArm ? 0.020 : 0.030, body),
    ]);
    for (const s of segs[i]) g.add(s);
    // Ball joints at shoulder/hip, elbow/knee, and the extremity.
    const set = [
      new THREE.Mesh(new THREE.SphereGeometry(isArm ? 0.034 : 0.042, 14, 10), joint),
      new THREE.Mesh(new THREE.SphereGeometry(isArm ? 0.026 : 0.034, 14, 10), joint),
      new THREE.Mesh(new THREE.SphereGeometry(isArm ? 0.030 : 0.036, 14, 10), body),
    ];
    for (const b of set) { b.castShadow = true; g.add(b); }
    balls.push(set);
  }

  // The control bar, and the strings.
  const bar = new THREE.Group();
  const barBeam = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.022, 0.022),
    new THREE.MeshStandardMaterial({ color: PAL.bar, roughness: 0.8, metalness: 0.05 }));
  barBeam.castShadow = true;
  bar.add(barBeam);
  const barCross = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.26),
    new THREE.MeshStandardMaterial({ color: PAL.bar, roughness: 0.8, metalness: 0.05 }));
  barCross.castShadow = true;
  bar.add(barCross);
  bar.position.set(0, RIG.barY, 0);
  g.add(bar);

  // Strings as thin lines. Four to the extremities plus one to the head, which
  // is the one that actually carries the puppet's weight.
  const strings = [];
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: PAL.string, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    g.add(line);
    strings.push(line);
  }

  // Where on the bar each string is anchored.
  const anchors = [
    [-0.19, 0], [0.19, 0], [-0.08, 0.10], [0.08, 0.10], [0, -0.06],
  ];

  function update(p, held) {
    const ps = pose(p);
    const P = ps.points;

    // Torso: from hip to neck.
    spanTo(torso, P.hip.x, P.hip.y, P.neck.x, P.neck.y);
    head.position.set(P.head.x, P.head.y, 0);
    spanTo(collar, P.neck.x, P.neck.y, P.head.x, P.head.y);

    for (let i = 0; i < 4; i++) {
      const root = P[`root${i}`], mid = P[`mid${i}`], end = P[`end${i}`];
      spanTo(segs[i][0], root.x, root.y, mid.x, mid.y);
      spanTo(segs[i][1], mid.x, mid.y, end.x, end.y);
      balls[i][0].position.set(root.x, root.y, 0);
      balls[i][1].position.set(mid.x, mid.y, 0);
      balls[i][2].position.set(end.x, end.y, 0);
    }

    // Strings. A pulled string goes taut and bright; a slack one dims and sags.
    for (let i = 0; i < 5; i++) {
      const to = i < 4 ? P[`end${i}`] : P.head;
      const a = anchors[i];
      const pos = strings[i].geometry.attributes.position;
      pos.setXYZ(0, a[0], RIG.barY, a[1]);
      pos.setXYZ(1, to.x, to.y, 0);
      pos.needsUpdate = true;
      strings[i].geometry.computeBoundingSphere();
      const live = i < 4 && held && held[i];
      strings[i].material.color.setHex(live ? PAL.stringLive : PAL.string);
      strings[i].material.opacity = live ? 0.95 : 0.42;
    }

    // The bar tips with the pull, the way a puppeteer's hand would.
    if (held) {
      const tilt = ((held[1] ? 1 : 0) - (held[0] ? 1 : 0)) * 0.18;
      bar.rotation.z += (tilt - bar.rotation.z) * 0.12;
      const lift = ((held[2] ? 1 : 0) + (held[3] ? 1 : 0)) * 0.03;
      bar.position.y += (RIG.barY + lift - bar.position.y) * 0.12;
    }
  }

  return { group: g, update };
}

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a09);
  scene.environment = makeEnvironment(renderer);
  scene.fog = new THREE.Fog(0x0d0a09, 3.2, 8.0);

  // FRAMING IS COMPUTED, NOT FIXED, and that is the whole of the mobile fix.
  // A PerspectiveCamera's `fov` is the VERTICAL field of view, so the
  // horizontal one is 2*atan(tan(fov/2) * aspect) — it collapses as the
  // viewport narrows. A camera parked at a fixed distance therefore frames two
  // side-by-side puppets fine on a laptop and crops one of them clean off the
  // edge on a phone, which is exactly what it did.
  //
  // So the camera is fitted to a world-space box every resize: pull back far
  // enough that both halfW and halfH are inside the frustum, whichever binds.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  const FIT = { cy: 0.16, halfH: 0.96, margin: 1.05 };
  let separation = 0.72;

  function frameCamera(aspect) {
    // A puppet reaches about 0.45 from its own centre with its arms out and its
    // control bar counted, so the box is the separation plus that.
    const halfW = separation + 0.50;
    const t = Math.tan((camera.fov * Math.PI / 180) / 2);
    const dH = FIT.halfH / t;
    const dW = halfW / (t * Math.max(0.0001, aspect));
    const d = Math.max(dH, dW) * FIT.margin;
    camera.position.set(0, FIT.cy + 0.26, d);
    camera.lookAt(0, FIT.cy, 0);
  }
  frameCamera(1.6);

  // ---- the stage --------------------------------------------------------
  const boards = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: PAL.stage, roughness: 0.85, metalness: 0.03 }),
  );
  boards.position.set(0, -0.72, 0);
  boards.receiveShadow = true;
  scene.add(boards);

  // Plank seams, so the floor has a direction and the shadows something to
  // fall across.
  for (let i = -4; i <= 4; i++) {
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.002, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x180f0a, roughness: 1 }),
    );
    seam.position.set(i * 0.42, -0.679, 0);
    scene.add(seam);
  }

  // A curtain behind, lit warm at the top so it does not read as a void.
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x2a1013, roughness: 0.95, metalness: 0.0 }),
  );
  curtain.position.set(0, 0.9, -1.15);
  curtain.receiveShadow = true;
  scene.add(curtain);
  // Folds.
  for (let i = -7; i <= 7; i++) {
    const fold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 4, 8, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x33151a, roughness: 0.95 }),
    );
    fold.position.set(i * 0.42, 0.9, -1.10);
    fold.rotation.y = Math.PI;
    fold.receiveShadow = true;
    scene.add(fold);
  }

  // ---- lighting ---------------------------------------------------------
  // Theatre lighting: two warm spots from above and in front, one per puppet,
  // plus a cool backlight to separate them from the curtain.
  const spots = [];
  for (const x of [-0.72, 0.72]) {
    const sp = new THREE.SpotLight(0xffe6bd, 26, 6, 0.42, 0.45, 1.4);
    sp.position.set(x * 0.7, 2.5, 1.5);
    sp.target.position.set(x, 0.1, 0);
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.camera.near = 0.5;
    sp.shadow.camera.far = 7;
    sp.shadow.bias = -0.0012;
    sp.shadow.normalBias = 0.02;
    scene.add(sp); scene.add(sp.target);
    spots.push(sp);
  }
  const back = new THREE.DirectionalLight(0x7f9ad0, 1.5);
  back.position.set(0.4, 1.6, -1.6);
  scene.add(back);
  scene.add(new THREE.HemisphereLight(0x6a5f70, 0.35));
  scene.add(new THREE.AmbientLight(0x2a2230, 0.6));

  // ---- the two figures --------------------------------------------------
  const rival = buildPuppet({ body: PAL.rivalBody, joint: PAL.rivalJoint, cloth: PAL.rivalCloth });
  const mine = buildPuppet({ body: PAL.mineBody, joint: PAL.mineJoint, cloth: PAL.mineCloth });
  scene.add(rival.group);
  scene.add(mine.group);

  // On a narrow screen the two figures also move closer together. Fitting the
  // camera alone would keep them both on screen but shrink them to nothing;
  // closing the gap buys back most of that size, and two puppets standing
  // nearer each other is no worse a picture.
  const pools = [];
  function setSeparation(sep) {
    separation = sep;
    rival.group.position.set(-sep, 0, 0);
    mine.group.position.set(sep, 0, 0);
    for (let i = 0; i < pools.length; i++) pools[i].position.x = i === 0 ? -sep : sep;
    for (let i = 0; i < spots.length; i++) {
      spots[i].position.x = (i === 0 ? -sep : sep) * 0.7;
      spots[i].target.position.x = (i === 0 ? -sep : sep);
    }
  }

  // A dim floor pool under each, so a puppet that is not being lit still reads
  // as standing somewhere.
  for (const x of [-0.72, 0.72]) {
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32),
      new THREE.MeshBasicMaterial({ color: 0x120c0a, transparent: true, opacity: 0.55 }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, -0.678, 0);
    scene.add(pool);
    pools.push(pool);
  }
  setSeparation(0.72);

  function update(duel, rivalHeld, myHeld, focus) {
    rival.update(duel.rival, rivalHeld);
    mine.update(duel.mine, myHeld);
    // The lighting follows the phase: whoever is dancing is lit, the other
    // waits in the half-dark. It is the clearest way to say whose turn it is
    // without writing it on the screen.
    const want = [focus === 'rival' ? 26 : 5.5, focus === 'mine' ? 26 : 5.5];
    if (focus === 'both') { want[0] = 22; want[1] = 22; }
    for (let i = 0; i < 2; i++) spots[i].intensity += (want[i] - spots[i].intensity) * 0.10;
  }

  let lastFit = '';
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // Narrow viewports get the figures closer together as well as the pull-back.
    const want = aspect < 1.15 ? 0.50 : 0.72;
    const key = `${want}|${aspect.toFixed(3)}`;
    if (key !== lastFit) {
      lastFit = key;
      if (want !== separation) setSeparation(want);
      frameCamera(aspect);
    }
    camera.updateProjectionMatrix();
  }

  return { scene, camera, renderer, update, resize, render: () => renderer.render(scene, camera) };
}
