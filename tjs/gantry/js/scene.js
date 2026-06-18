// scene.js — the three.js view of the HBot gantry. Builds the frame, the two
// stationary corner steppers (with pulleys that actually spin by rotor angle),
// the Y-moving cross-beam, the X-moving carriage, two Z lead-screw columns each
// carrying a tool (gripper or pipettor), the bed and its targets. setState()
// drives all moving parts from a machine sample; the rotor angles come straight
// from the kinematics so "watch the motor" is literal.
//
// Coordinate map: machine (x, y) -> world (x, z); world Y is up. 1 world unit =
// 10 mm. Z tool stroke plunges downward (machine z grows = tool goes down).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MM = 0.1; // world units per mm (10mm = 1 unit)
const ACCENT = 0x39d6c8;
const ACCENT2 = 0xffb454;
const STALL = 0xff4d6d;

export class GantryView {
  constructor(container) {
    this.container = container;
    this.bed = { x: 300, y: 300, z: 120 };
    this._init();
  }

  _init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b10);
    scene.fog = new THREE.Fog(0x0b0b10, 60, 140);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 500);
    camera.position.set(34, 30, 42);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(15, 6, 15);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 18;
    controls.maxDistance = 110;

    // Lighting — studio-ish: cool hemisphere fill + warm key with soft shadows.
    scene.add(new THREE.HemisphereLight(0x88aacc, 0x202028, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(28, 44, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 40;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1; key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT, 0.5);
    rim.position.set(-30, 18, -24);
    scene.add(rim);

    this.scene = scene; this.camera = camera; this.renderer = renderer; this.controls = controls;

    this._buildStatic();
    this._buildGantry();

    addEventListener('resize', () => this.resize());
  }

  _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.42, ...opts });
  }

  _buildStatic() {
    const { x: bx, y: by } = this.bed;
    // Ground plate.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(bx * MM + 6, 1.2, by * MM + 6),
      this._mat(0x16161e, { metalness: 0.3, roughness: 0.8 }),
    );
    plate.position.set(bx * MM / 2, -0.6, by * MM / 2);
    plate.receiveShadow = true;
    this.scene.add(plate);

    // Bed surface with grid.
    const grid = new THREE.GridHelper(Math.max(bx, by) * MM, 12, ACCENT, 0x2a2a38);
    grid.position.set(bx * MM / 2, 0.01, by * MM / 2);
    grid.material.opacity = 0.4; grid.material.transparent = true;
    this.scene.add(grid);

    // Four frame posts.
    const postH = (this.bed.z + 60) * MM;
    const postGeo = new THREE.BoxGeometry(2, postH, 2);
    const postMat = this._mat(0x33343f);
    this.posts = [];
    for (const [px, pz] of [[0, 0], [bx, 0], [0, by], [bx, by]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px * MM, postH / 2, pz * MM);
      post.castShadow = true; this.scene.add(post);
    }

    // Two stationary steppers at the rear corners (the HBot signature).
    this.pulleys = {};
    const railY = postH - 2;
    for (const [name, px] of [['A', 0], ['B', bx]]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 24), this._mat(0x202028, { metalness: 0.7, roughness: 0.3 }));
      body.rotation.z = Math.PI / 2;
      body.position.set(px * MM, railY, by * MM);
      body.castShadow = true; this.scene.add(body);
      // Pulley disk that we spin by rotor angle.
      const pulley = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 20), this._mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.25 }));
      pulley.rotation.z = Math.PI / 2;
      pulley.position.set(px * MM + (px === 0 ? 2.6 : -2.6), railY, by * MM);
      // marker so rotation is visible
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 1.5), this._mat(0x0b0b10));
      mark.position.y = 0.9;
      pulley.add(mark);
      this.scene.add(pulley);
      this.pulleys[name] = pulley;
    }
    this.railY = railY;

    // Side Y-rails the beam slides along.
    const railGeo = new THREE.BoxGeometry(1.4, 1.4, by * MM);
    for (const px of [0, bx]) {
      const rail = new THREE.Mesh(railGeo, this._mat(0x2c2d36));
      rail.position.set(px * MM, railY, by * MM / 2);
      rail.castShadow = true; this.scene.add(rail);
    }
  }

  _buildGantry() {
    const { x: bx } = this.bed;
    // Cross-beam (spans X, moves in Y).
    this.beam = new THREE.Group();
    const beamBar = new THREE.Mesh(new THREE.BoxGeometry(bx * MM + 2, 2, 2.2), this._mat(0x3a3b47));
    beamBar.castShadow = true;
    this.beam.add(beamBar);
    this.beam.position.set(bx * MM / 2, this.railY, 0);
    this.scene.add(this.beam);

    // Carriage (rides the beam in X).
    this.carriage = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), this._mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.12, metalness: 0.6, roughness: 0.3 }));
    block.castShadow = true;
    this.carriage.add(block);
    this.beam.add(this.carriage);

    // Two Z columns hanging off the carriage.
    this.zcol = {};
    this.tools = {};
    for (const [name, offX] of [['z1', -2.6], ['z2', 2.6]]) {
      const col = new THREE.Group();
      col.position.set(offX, 0, 0);
      // lead screw (thin rod) + slider
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, this.bed.z * MM, 12), this._mat(0xb9bcc8, { metalness: 0.9, roughness: 0.25 }));
      screw.position.y = -this.bed.z * MM / 2;
      col.add(screw);
      const slider = new THREE.Group(); // moves down as z grows
      const sbody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), this._mat(0x4a4b58));
      sbody.castShadow = true;
      slider.add(sbody);
      col.add(slider);
      this.carriage.add(col);
      this.zcol[name] = slider;
      this.tools[name] = this._buildTool(name, slider);
    }
  }

  _buildTool(name, parent) {
    const group = new THREE.Group();
    group.position.y = -1.6;
    parent.add(group);
    // gripper jaws
    const jawMat = this._mat(ACCENT2, { metalness: 0.5, roughness: 0.4 });
    const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 1.2), jawMat);
    const jawR = jawL.clone();
    jawL.position.set(-0.7, -1, 0); jawR.position.set(0.7, -1, 0);
    jawL.castShadow = jawR.castShadow = true;
    // pipettor body + tip + plunger
    const pip = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.0, 16), this._mat(0xdedfe6, { metalness: 0.2, roughness: 0.5 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 16), this._mat(ACCENT, { metalness: 0.1, roughness: 0.6 }));
    tip.position.y = -1.7; tip.rotation.x = Math.PI;
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 12), this._mat(0x2a2a34));
    plunger.position.y = 1.4;
    pip.add(barrel, tip, plunger);
    pip.userData.plunger = plunger;
    group.add(jawL, jawR, pip);
    return { group, jawL, jawR, pip, kind: 'gripper' };
  }

  setToolKind(name, kind) {
    const t = this.tools[name]; if (!t) return;
    t.kind = kind;
    const grip = kind === 'gripper';
    t.jawL.visible = t.jawR.visible = grip;
    t.pip.visible = kind === 'pipettor';
  }

  // Drive every moving part from a machine sample. `s` is Machine.sample() output.
  // `angles` carries rotor angles {A,B,Z1,Z2} in radians for the spinners.
  setState(s, angles, tool) {
    const c = s.cart;
    // Beam moves in machine-y -> world Z.
    this.beam.position.z = c.y.p * MM;
    // Carriage moves in machine-x -> world X (relative to beam centre).
    this.carriage.position.x = (c.x.p - this.bed.x / 2) * MM;
    // Z sliders plunge downward.
    this.zcol.z1.position.y = -c.z1.p * MM;
    this.zcol.z2.position.y = -c.z2.p * MM;
    // Stall coloring on the carriage.
    const stalled = s.motors.A.stall || s.motors.B.stall;
    this.carriage.children[0].material.emissive.setHex(stalled ? STALL : ACCENT);
    this.carriage.children[0].material.color.setHex(stalled ? STALL : ACCENT);
    // Spin pulleys.
    if (angles) {
      if (this.pulleys.A) this.pulleys.A.rotation.x = angles.A || 0;
      if (this.pulleys.B) this.pulleys.B.rotation.x = angles.B || 0;
    }
    // Tool actuation.
    if (tool) {
      for (const name of ['z1', 'z2']) {
        const t = this.tools[name]; const st = tool[name];
        if (!t || !st) continue;
        if (t.kind === 'gripper') {
          const open = st.open ? 0.7 : 0.32;
          t.jawL.position.x = -open; t.jawR.position.x = open;
        } else if (t.kind === 'pipettor' && t.pip.userData.plunger) {
          t.pip.userData.plunger.position.y = 1.4 - (st.plunge || 0) * 0.8;
        }
      }
    }
  }

  frame() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
