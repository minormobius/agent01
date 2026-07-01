// tjs/beelix/beemesh.js — builds ONE bee mesh (body + banded abdomen + wings) and a
// MeshStandardMaterial whose shader (a) flaps the wings per-instance and (b) adds an
// emissive glow per-instance from an `iBright` attribute (so pulse-lit bees light up).
// THREE + mergeGeometries are passed in so this module needs no importmap of its own.
// The instanced attributes `iPhase` / `iBright` are supplied by the caller's InstancedMesh.

export function buildBeeMesh(THREE, mergeGeometries, opts = {}) {
  const FLAP_FREQ = opts.flapFreq ?? 38.0, FLAP_AMP = opts.flapAmp ?? 0.9;
  const glow = new THREE.Color(opts.glow || '#ffe39a');

  const ensure = (g) => {
    const n = g.attributes.position.count;
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (!g.attributes.aWing) g.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(n), 1));
  };
  const paintBody = (g) => {
    ensure(g); const pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z > 0.22) c.setHex(0x201810);
      else c.set(Math.sin(z * 30) > 0.1 ? '#2a2118' : '#f0a93a');
      col.setXYZ(i, c.r, c.g, c.b); g.attributes.aWing.setX(i, 0);
    }
  };
  const tagWing = (g, sign) => {
    ensure(g); const col = g.attributes.color, c = new THREE.Color('#a7b0c4');
    for (let i = 0; i < col.count; i++) { col.setXYZ(i, c.r, c.g, c.b); g.attributes.aWing.setX(i, sign); }
  };

  const body = new THREE.SphereGeometry(0.5, 12, 9); body.scale(0.42, 0.4, 0.95); paintBody(body);
  const mkWing = () => {
    const g = new THREE.PlaneGeometry(0.5, 0.3);
    g.translate(0.25, 0, 0); g.rotateX(-Math.PI / 2); g.rotateZ(0.32); g.translate(0.06, 0.14, 0.04);
    return g;
  };
  const wl = mkWing(); tagWing(wl, +1);
  const wr = mkWing(); wr.scale(-1, 1, 1); tagWing(wr, -1);
  const geometry = mergeGeometries([body, wl, wr], false);
  geometry.scale(0.85, 0.85, 0.85);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
  const wingTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wingTime;
    shader.uniforms.uGlow = { value: glow };
    shader.vertexShader = 'uniform float uTime;\nattribute float aWing;\nattribute float iPhase;\nattribute float iBright;\nvarying float vBright;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vBright = iBright;
       if (abs(aWing) > 0.5) {
         float ang = sin(uTime * ${FLAP_FREQ.toFixed(1)} + iPhase) * ${FLAP_AMP} * aWing;
         float ca = cos(ang), sa = sin(ang);
         transformed = vec3(ca*transformed.x - sa*transformed.y, sa*transformed.x + ca*transformed.y, transformed.z);
       }`);
    shader.fragmentShader = 'uniform vec3 uGlow;\nvarying float vBright;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += uGlow * vBright * 1.6;`);
  };
  return { geometry, material, wingTime };
}
