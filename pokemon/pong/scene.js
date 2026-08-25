// scene.js — the table, the bats, the ball. No simulation happens here.
//
// Everything is core three.js: no loaders, no examples/ modules, nothing
// fetched at runtime. The environment map is generated procedurally, the same
// few lines /armline/ and /mimic/ use, because gloss with nothing to reflect
// reads as grey plastic.
//
// Two things here are doing real work rather than decoration:
//
//   The ball is TEXTURED and its orientation is integrated from the actual spin
//   vector, so what you see turning is the omega the physics is using. A white
//   sphere would make the entire subject of this page invisible.
//
//   The trail is the ball's own past positions. A curve is not something you can
//   see in a single frame, and without the trail the difference between a shot
//   that dips and one that does not is a couple of centimetres at the far end.

import * as THREE from '../vendor/three.module.min.js';
import { TABLE, BALL, PLAYER_X, RIVAL_X } from './aero.js';
import { BAT, FACE_CLOSE, STROKE_TILT } from './game.js';

const PAL = {
  cloth: 0x14304e, // ITTF blue
  line: 0xf2f5f8,
  frame: 0x1b1f26,
  leg: 0x2a2f37,
  floor: 0x0b0d11,
  netMesh: 0xdfe5ec,
  rubberRed: 0xc0392b,
  rubberBlack: 0x17191d,
  blade: 0xb08048,
  ball: 0xffffff,
};

function makeEnvironment(renderer) {
  const w = 64, h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const sky = [198, 214, 234], mid = [104, 106, 112], gnd = [12, 14, 18];
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

/// A ball you can see spinning: white, with one bold meridian and a pole dot,
/// which between them make every axis of rotation legible. A single stripe
/// looks stationary when the spin is about the stripe's own axis.
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#e2483a';
  x.fillRect(30, 0, 10, 64);
  x.fillRect(94, 0, 10, 64);
  x.fillStyle = '#2f3945';
  x.fillRect(0, 28, 128, 8);
  x.beginPath(); x.arc(66, 8, 7, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/// The playing surface's white lines, painted into a texture rather than built
/// from geometry, because coplanar strips z-fight and a texture never does.
function tableTexture() {
  const px = 1024;
  const py = Math.round((px * 2 * TABLE.halfWidth) / (2 * TABLE.halfLength));
  const c = document.createElement('canvas');
  c.width = px; c.height = py;
  const x = c.getContext('2d');
  x.fillStyle = '#14304e';
  x.fillRect(0, 0, px, py);
  // 2 cm side lines, 3 mm centre line — ITTF.
  const mx = (px / (2 * TABLE.halfLength));
  const line = 0.02 * mx;
  x.fillStyle = '#f2f5f8';
  x.fillRect(0, 0, px, line);
  x.fillRect(0, py - line, px, line);
  x.fillRect(0, 0, line, py);
  x.fillRect(px - line, 0, line, py);
  x.fillRect(0, py / 2 - 0.003 * mx, px, 0.006 * mx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/// `dir` is +1 for the near bat, -1 for the far one, and `seen` is the colour of
/// the side that ends up FACING THE CAMERA — which is the side you never hit
/// with, and the only side you ever look at.
///
/// Getting that backwards is not cosmetic. The player's bat was built with its
/// black rubber toward the camera, against a background of #090b0e, and it was
/// simply not there: correctly positioned, correctly lit, and invisible. It
/// took a screenshot to notice, because every number said the bat was fine.
///
/// The group is rotated so its face normal is the one game.js does the physics
/// with — the bat is CLOSED, and a bat drawn square-on while the impulse is
/// computed against a tilted face is a picture of a different game.
function bat(seen, dir) {
  const colorNear = seen === PAL.rubberRed ? PAL.rubberBlack : PAL.rubberRed;
  const g = new THREE.Group();
  g.rotation.y = dir > 0 ? FACE_CLOSE : Math.PI - FACE_CLOSE;
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(BAT.radius, BAT.radius, 0.012, 40),
    new THREE.MeshStandardMaterial({ color: PAL.blade, roughness: 0.6, metalness: 0.05 })
  );
  blade.rotation.z = Math.PI / 2; // long axis along +x, i.e. the face normal
  blade.castShadow = true;
  g.add(blade);
  const face = (z, col) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(BAT.radius * 0.97, BAT.radius * 0.97, 0.003, 40),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, metalness: 0.02 })
    );
    m.rotation.z = Math.PI / 2;
    m.position.x = z;
    return m;
  };
  g.add(face(0.0075, colorNear));
  g.add(face(-0.0075, colorNear === PAL.rubberRed ? PAL.rubberBlack : PAL.rubberRed));
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.032, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.75 })
  );
  handle.position.set(0, 0, -BAT.radius - 0.045);
  handle.castShadow = true;
  g.add(handle);
  return g;
}

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b0e);
  scene.environment = makeEnvironment(renderer);
  scene.fog = new THREE.Fog(0x090b0e, 4.0, 11.0);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
  camera.up.set(0, 0, 1);

  // FIT THE CAMERA TO THE ASPECT. A PerspectiveCamera's `fov` is the VERTICAL
  // field of view, so the horizontal one is 2*atan(tan(fov/2)*aspect) and
  // collapses as the viewport narrows. Both other 3D pages on this surface
  // shipped cropped on phones for exactly this reason; this one keeps the view
  // direction and pushes back along it, which cannot swing the composition
  // around by accident.
  // Over the player's shoulder. Far enough back and high enough that YOUR bat
  // is in shot — it was off the bottom edge at the first framing, which for the
  // one object you control is not a small thing.
  const CAM_TARGET = new THREE.Vector3(-0.10, 0, 0.16);
  const CAM_EYE = new THREE.Vector3(-3.20, 0.40, 1.15);
  const CAM_DIR = CAM_EYE.clone().sub(CAM_TARGET);
  const CAM_DIST = CAM_DIR.length();
  CAM_DIR.normalize();
  const REF_ASPECT = 1.6;
  function frameCamera(aspect) {
    const k = Math.max(1, REF_ASPECT / Math.max(0.0001, aspect));
    camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR, CAM_DIST * k);
    camera.lookAt(CAM_TARGET);
  }
  frameCamera(REF_ASPECT);

  // ---- lighting ---------------------------------------------------------
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(-1.2, 2.6, 3.4);
  key.target.position.set(0, 0, 0);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1.0;
  key.shadow.camera.far = 9.0;
  const s = 2.2;
  key.shadow.camera.left = -s; key.shadow.camera.right = s;
  key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.01;
  scene.add(key);

  // `light.position.set(...)`, NOT `Object.assign(light, { position })`.
  // Object3D.position is a read-only accessor, so assigning to it throws — and
  // a throw here takes the whole module down, which takes index.html's import
  // down, which ships a page with a dead 300x150 canvas and no error anywhere a
  // node test can see. This one did exactly that, live, until a browser check
  // asked the page what it thought had happened.
  const fill = new THREE.DirectionalLight(0x9fc0e8, 0.55);
  fill.position.set(2.4, -1.8, 1.4);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x93a8c4, 0.30));

  // ---- table ------------------------------------------------------------
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(2 * TABLE.halfLength, 2 * TABLE.halfWidth, 0.025),
    [
      new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.55, metalness: 0.02 }),
      new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.9 }),
    ]
  );
  top.position.z = -0.0125;
  top.receiveShadow = true;
  scene.add(top);

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, TABLE.height),
        new THREE.MeshStandardMaterial({ color: PAL.leg, roughness: 0.6, metalness: 0.4 })
      );
      leg.position.set(sx * (TABLE.halfLength - 0.22), sy * (TABLE.halfWidth - 0.12), -TABLE.height / 2);
      leg.castShadow = true;
      scene.add(leg);
    }
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.95 })
  );
  floor.position.z = -TABLE.height;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- net --------------------------------------------------------------
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * TABLE.netHalfWidth, TABLE.netHeight),
    new THREE.MeshStandardMaterial({
      color: PAL.netMesh, roughness: 0.9, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  net.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  net.position.z = TABLE.netHeight / 2;
  scene.add(net);
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 2 * TABLE.netHalfWidth, 0.015),
    new THREE.MeshStandardMaterial({ color: PAL.line, roughness: 0.7 })
  );
  tape.position.z = TABLE.netHeight;
  scene.add(tape);
  for (const sy of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, TABLE.netHeight + 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.6 })
    );
    post.rotation.x = Math.PI / 2;
    post.position.set(0, sy * TABLE.netHalfWidth, (TABLE.netHeight + 0.02) / 2);
    scene.add(post);
  }

  // ---- bats and ball ----------------------------------------------------
  const playerBat = bat(PAL.rubberRed, 1);
  const rivalBat = bat(PAL.rubberBlack, -1);
  // A soft fill from behind the camera. Both bats present their back face to
  // the viewer, and the key light is over the table, so without this the near
  // one sits in its own shadow at the front of the frame.
  const front = new THREE.DirectionalLight(0xdbe6f5, 0.85);
  front.position.set(-3.4, 0.9, 1.3);
  scene.add(front);
  scene.add(playerBat, rivalBat);

  // The stroke plane each bat is confined to, drawn as a faint quad. Without it
  // the constraint the whole game is built on is invisible: a bat that slides
  // up a slope looks like a bat that is simply moving.
  for (const dir of [1, -1]) {
    const h = BAT.maxZ - BAT.minZ;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(BAT.maxY - BAT.minY, h / Math.cos(STROKE_TILT)),
      new THREE.MeshBasicMaterial({
        color: 0x2f5f96, transparent: true, opacity: 0.09,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    // Built from a BASIS, not from Euler angles. A PlaneGeometry spans x and y
    // with its normal along +z, and the stroke plane wants its height along the
    // tilted stroke direction and its width along the table's y. Setting
    // rotation.x and rotation.z together composes in XYZ order and gives a
    // quad at an angle nobody asked for, which is what the first version drew.
    const up = new THREE.Vector3(Math.sin(STROKE_TILT) * dir, 0, Math.cos(STROKE_TILT));
    const nrm = new THREE.Vector3(Math.cos(STROKE_TILT) * dir, 0, -Math.sin(STROKE_TILT));
    const side = new THREE.Vector3().crossVectors(up, nrm);
    plane.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(side, up, nrm)
    );
    const mid = BAT.minZ + h / 2;
    plane.position.set(
      (dir > 0 ? PLAYER_X : RIVAL_X) + dir * mid * Math.tan(STROKE_TILT), 0, mid
    );
    scene.add(plane);
  }

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.R, 28, 20),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.42, metalness: 0.0 })
  );
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // A ring on the table under the ball. Depth along the table is the hardest
  // thing to judge in a view down its length, and this is the cheapest honest
  // cue for it — it is the ball's own (x, y), not a hint.
  const shadowRing = new THREE.Mesh(
    new THREE.RingGeometry(BALL.R * 0.7, BALL.R * 1.25, 24),
    new THREE.MeshBasicMaterial({ color: 0x8fb4e0, transparent: true, opacity: 0.45 })
  );
  shadowRing.position.z = 0.0015;
  scene.add(shadowRing);

  const TRAIL = 90;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.75 })
  );
  trail.frustumCulled = false;
  scene.add(trail);
  let trailN = 0;

  const q = new THREE.Quaternion();
  const dq = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  function placeBat(mesh, b) {
    mesh.position.set(b.x, b.y, b.z);
  }

  function update(g, dt) {
    placeBat(playerBat, g.player);
    placeBat(rivalBat, g.rival);

    const b = g.ball;
    if (!b) return;
    ballMesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    shadowRing.position.set(b.pos[0], b.pos[1], 0.0015);
    shadowRing.visible = Math.abs(b.pos[0]) < TABLE.halfLength && Math.abs(b.pos[1]) < TABLE.halfWidth;

    // Integrate the ball's orientation from the spin the physics is carrying.
    const w = Math.hypot(b.spin[0], b.spin[1], b.spin[2]);
    if (w > 1e-4 && dt > 0) {
      axis.set(b.spin[0] / w, b.spin[1] / w, b.spin[2] / w);
      dq.setFromAxisAngle(axis, w * dt);
      q.premultiply(dq);
      ballMesh.quaternion.copy(q);
    }

    if (g.trailReset) { trailN = 0; g.trailReset = false; }
    if (trailN < TRAIL) trailN++;
    for (let i = Math.min(trailN, TRAIL) - 1; i > 0; i--) {
      trailPos[i * 3] = trailPos[(i - 1) * 3];
      trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
      trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
    }
    trailPos[0] = b.pos[0]; trailPos[1] = b.pos[1]; trailPos[2] = b.pos[2];
    for (let i = trailN; i < TRAIL; i++) {
      trailPos[i * 3] = b.pos[0]; trailPos[i * 3 + 1] = b.pos[1]; trailPos[i * 3 + 2] = b.pos[2];
    }
    trailGeo.attributes.position.needsUpdate = true;
  }

  // ---- pointing ---------------------------------------------------------
  //
  // Turn a place on the canvas into a place on the player's stroke plane, by
  // casting a ray from the camera through the cursor and intersecting the
  // plane the bat is confined to. Doing it properly rather than scaling the
  // canvas rect onto the reach box is the whole difference between "the bat is
  // under my finger" and "the bat is somewhere to the left of my finger": the
  // view is a perspective one, and a linear map is only right at one depth.
  //
  // The plane is x = x0 + z*tan(T), which normalises to
  //   (cos T) x - (sin T) z - (cos T) x0 = 0.
  const planeNormal = new THREE.Vector3(Math.cos(STROKE_TILT), 0, -Math.sin(STROKE_TILT));
  const strokePlane = new THREE.Plane(planeNormal, -Math.cos(STROKE_TILT) * PLAYER_X);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  /// `nx`, `ny` are normalised device coordinates (-1..1, y up). Returns the
  /// bat-plane coordinates, or null if the ray misses the plane entirely —
  /// which happens when the cursor is above the horizon.
  function pointerToPlane(nx, ny) {
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(strokePlane, hit)) return null;
    return { y: hit.y, z: hit.z };
  }

  let lastAspect = 0;
  function resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    if (Math.abs(aspect - lastAspect) > 1e-4) { lastAspect = aspect; frameCamera(aspect); }
    camera.updateProjectionMatrix();
  }

  const render = () => renderer.render(scene, camera);
  return {
    scene, camera, renderer, update, resize, render, pointerToPlane,
    ballMesh, playerBat, rivalBat,
  };
}

export { PLAYER_X, RIVAL_X };
