// deckscene.js — renders a Deck in three.js. The kinematic mount tree IS the
// three.js scene graph: each device is a group parented under its mount target
// (the deck origin, a parent's frame, or a parent's MOVING carriage anchor), so
// sliding a parent carriage drags every descendant along for free. setState()
// poses every joint from a state map; pickDeviceAt() supports click-to-select in
// the editor. Geometry comes from the pure specs in devices.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEVICE_TYPES, carriageOffset } from './devices.js';

const MM = 0.1;            // world units per mm
const ACCENT = 0x39d6c8, SEL = 0xffb454, BAD = 0xff4d6d;

export class DeckView {
  constructor(container, { editor = false } = {}) {
    this.container = container;
    this.editor = editor;
    this.nodes = new Map();   // deviceId -> { group, frameGroup, carriageAnchor, carriageParts[], toolGroup, reach }
    this.deck = null;
    this.showReach = false;
    this.selected = null;
    this._init();
  }

  _init() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 500;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b10);
    scene.fog = new THREE.Fog(0x0b0b10, 80, 220);
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 800);
    camera.position.set(60, 52, 74);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.target.set(0, 14, 0);
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0x88aacc, 0x202028, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(40, 70, 36); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 90;
    Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 240 });
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT, 0.45); rim.position.set(-50, 30, -40); scene.add(rim);

    // deck floor + grid
    const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 48), new THREE.MeshStandardMaterial({ color: 0x101018, metalness: 0.2, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(220, 44, 0x2a2a38, 0x1b1b24); grid.position.y = 0; scene.add(grid);

    this.root = new THREE.Group(); scene.add(this.root);
    this.selBox = new THREE.BoxHelper(new THREE.Object3D(), SEL); this.selBox.visible = false; scene.add(this.selBox);

    this.scene = scene; this.camera = camera; this.renderer = renderer; this.controls = controls;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    addEventListener('resize', () => this.resize());
  }

  _mat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.42, ...opts }); }

  _buildPart(part, deviceId) {
    const s = part.size.map((v) => v * MM);
    let geo;
    if (part.shape === 'cyl') geo = new THREE.CylinderGeometry(s[0] / 2, s[0] / 2, s[1], 20);
    else if (part.shape === 'cone') geo = new THREE.ConeGeometry(s[0] / 2, s[1], 18);
    else geo = new THREE.BoxGeometry(s[0], s[1], s[2] ?? s[0]);
    const mat = this._mat(part.color, part.emissive ? { emissive: part.emissive, emissiveIntensity: 0.14 } : {});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.deviceId = deviceId;
    if (part.along) {
      const v = new THREE.Vector3(...part.along).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      const L = (part.length || part.size[1]) * MM;
      mesh.position.set(v.x * L / 2, v.y * L / 2, v.z * L / 2);
    } else if (part.pos) {
      mesh.position.set(part.pos[0] * MM, part.pos[1] * MM, part.pos[2] * MM);
    }
    mesh.userData.basePos = mesh.position.clone();
    mesh.userData.follow = part.follow || [1, 1, 1];
    mesh.userData.canTint = !!part.emissive; // only authored-emissive parts get recoloured
    return mesh;
  }

  _buildTool(kind) {
    const g = new THREE.Group();
    const refs = { group: g, kind, jl: null, jr: null, plunger: null };
    if (kind === 'gripper') {
      const m = this._mat(0xffb454, { metalness: 0.5, roughness: 0.4 });
      const jl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 1.2), m); jl.position.set(-0.7, -1.6, 0);
      const jr = jl.clone(); jr.position.x = 0.7; jl.castShadow = jr.castShadow = true;
      g.add(jl, jr); refs.jl = jl; refs.jr = jr;
    } else if (kind === 'pipettor') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2, 16), this._mat(0xdedfe6, { metalness: 0.2, roughness: 0.5 }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 16), this._mat(ACCENT, { roughness: 0.6 }));
      tip.position.y = -1.8; tip.rotation.x = Math.PI; barrel.castShadow = true;
      const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 12), this._mat(0x2a2a34)); plunger.position.y = 1.2;
      g.add(barrel, tip, plunger); refs.plunger = plunger;
    }
    return refs;
  }

  // Spin a device's motor meshes from its joint state (so "watch the motor" is
  // literal during playback). hbot: pulleys A/B; linear screw: the lead screw.
  spinMotors(id, joint) {
    const node = this.nodes.get(id); if (!node) return;
    const dev = this.deck.getDevice(id); const p = dev.params;
    if (dev.type === 'hbot') {
      const rMm = (p.pulleyTeeth * p.beltPitch) / (2 * Math.PI);
      const a = ((joint.x ?? 0) + (joint.y ?? 0)) / rMm, b = ((joint.x ?? 0) - (joint.y ?? 0)) / rMm;
      if (node.named.motorA) node.named.motorA.rotation.x = a;
      if (node.named.motorB) node.named.motorB.rotation.x = b;
    } else if (dev.type === 'linear' && p.drive === 'screw' && node.named.rail) {
      node.named.rail.rotation.y = ((joint.p ?? 0) * 2 * Math.PI) / p.lead;
    }
  }

  // Actuate a device's tool. st: { open?:bool, plunge?:0..1 }.
  actuateTool(id, st) {
    const node = this.nodes.get(id); const t = node && node.tool; if (!t) return;
    if (t.kind === 'gripper' && t.jl) { const o = st.open === false ? 0.32 : 0.7; t.jl.position.x = -o; t.jr.position.x = o; }
    if (t.kind === 'pipettor' && t.plunger) t.plunger.position.y = 1.2 - (st.plunge || 0) * 0.8;
  }

  // Flag a device as stalled (carriage glows red) during motion playback.
  setStall(id, bad) {
    const node = this.nodes.get(id); if (!node) return;
    for (const part of node.carriageParts) if (part.userData.canTint) part.material.emissive.setHex(bad ? BAD : (id === this.selected ? SEL : ACCENT));
  }

  setDeck(deck) {
    // tear down
    this.root.clear(); this.nodes.clear();
    this.deck = deck;
    if (!deck) return;
    const order = (() => { try { return deck.topo(); } catch { return deck.devices; } })();

    for (const dev of order) {
      const type = DEVICE_TYPES[dev.type];
      if (!type) continue;
      const spec = type.spec(dev.params);
      const frameGroup = new THREE.Group();
      frameGroup.position.set(dev.mount.position[0] * MM, dev.mount.position[1] * MM, dev.mount.position[2] * MM);
      frameGroup.rotation.set(rad(dev.mount.rotation[0]), rad(dev.mount.rotation[1]), rad(dev.mount.rotation[2]));

      const named = {};
      for (const part of spec.frame) { const m = this._buildPart(part, dev.id); frameGroup.add(m); if (part.name) named[part.name] = m; }
      const carriageParts = spec.carriage.map((part) => { const m = this._buildPart(part, dev.id); frameGroup.add(m); if (part.name) named[part.name] = m; return m; });
      const carriageAnchor = new THREE.Group(); frameGroup.add(carriageAnchor);

      // tool hangs from the carriage anchor
      let tool = null;
      if (dev.tool && dev.tool !== 'none') { tool = this._buildTool(dev.tool); carriageAnchor.add(tool.group); }

      // reach envelope
      const reach = this._buildReach(type.reach(dev.params)); reach.visible = this.showReach; frameGroup.add(reach);

      // attach to parent's anchor / frame, or to the root
      let parentObj = this.root;
      if (dev.mount.parent && this.nodes.has(dev.mount.parent)) {
        const pn = this.nodes.get(dev.mount.parent);
        parentObj = dev.mount.attach === 'carriage' ? pn.carriageAnchor : pn.frameGroup;
      }
      parentObj.add(frameGroup);
      this.nodes.set(dev.id, { group: frameGroup, frameGroup, carriageAnchor, carriageParts, named, tool, type: dev.type });
    }
    this.setState({});
  }

  _buildReach(box) {
    const sx = (box.max[0] - box.min[0]) * MM, sy = (box.max[1] - box.min[1]) * MM, sz = (box.max[2] - box.min[2]) * MM;
    const g = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, .1), Math.max(sy, .1), Math.max(sz, .1)),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.07, depthWrite: false }));
    g.position.set((box.max[0] + box.min[0]) / 2 * MM, (box.max[1] + box.min[1]) / 2 * MM, (box.max[2] + box.min[2]) / 2 * MM);
    g.userData.isReach = true;
    return g;
  }

  setReachVisible(v) { this.showReach = v; for (const n of this.nodes.values()) n.frameGroup.children.forEach((c) => { if (c.userData?.isReach) c.visible = v; }); }

  // Pose all joints. stateMap: deviceId -> joint state ({p} or {x,y}).
  setState(stateMap = {}) {
    if (!this.deck) return;
    this._lastState = stateMap;
    for (const dev of this.deck.devices) {
      const node = this.nodes.get(dev.id); if (!node) continue;
      const off = carriageOffset(dev, stateMap[dev.id] || dev.previewState || {});
      const o = [off[0] * MM, off[1] * MM, off[2] * MM];
      node.carriageAnchor.position.set(o[0], o[1], o[2]);
      for (const part of node.carriageParts) {
        const f = part.userData.follow, bp = part.userData.basePos;
        part.position.set(bp.x + o[0] * f[0], bp.y + o[1] * f[1], bp.z + o[2] * f[2]);
      }
    }
    // collision tint on the carriages
    const cols = this.deck.collisions(stateMap);
    const bad = new Set(); for (const c of cols) if (c.violated) { bad.add(c.between[0]); bad.add(c.between[1]); }
    for (const [id, node] of this.nodes) {
      const hot = bad.has(id);
      for (const part of node.carriageParts) if (part.userData.canTint) part.material.emissive.setHex(hot ? BAD : (id === this.selected ? SEL : ACCENT));
    }
    if (this.selected) this._refreshSelBox();
  }

  select(id) {
    this.selected = id;
    const node = id && this.nodes.get(id);
    if (node) { this.selBox.setFromObject(node.frameGroup); this.selBox.visible = true; }
    else this.selBox.visible = false;
    this.setState(this._lastState || {});
  }
  _refreshSelBox() { const n = this.nodes.get(this.selected); if (n) this.selBox.setFromObject(n.frameGroup); }

  pickDeviceAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.root.children, true);
    for (const h of hits) { if (h.object.userData?.deviceId) return h.object.userData.deviceId; }
    return null;
  }

  frame() { this.controls.update(); this.renderer.render(this.scene, this.camera); }
  resize() { const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); }
}

function rad(d) { return (d * Math.PI) / 180; }
