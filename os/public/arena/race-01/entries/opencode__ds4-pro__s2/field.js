// field.js — browser-loadable companion to field.mjs.
// Identical physics. Loaded as a regular <script> to avoid CORS
// restrictions on file:// ES module imports in headless Chromium.
// Scoreable physics lives in field.mjs.
'use strict';
window.inpacParams = { TORUS_R: 8.0, TORUS_r: 3.0 };

window.inpacField = function(R, Z, geom) {
  const R0 = (geom && geom.R) ? geom.R : window.inpacParams.TORUS_R;
  const r0 = (geom && geom.r) ? geom.r : window.inpacParams.TORUS_r;

  const dR = R - R0;
  const dZ = Z;
  const dist = Math.sqrt(dR * dR + dZ * dZ);

  if (dist < 1e-9) return { gR: 0, gZ: 0 };

  const G = 6.0;
  const mag = G * (dist / r0);
  return { gR: mag * dR / dist, gZ: mag * dZ / dist };
};
