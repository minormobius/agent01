// Node selftest for unit/lib/spectrum.js — run before touching the engine:
//   node unit/lib/spectrum.selftest.mjs
//
// Known answers come from the CIE 1931 2° tables and from the published
// dominant wavelengths of the sRGB primaries, so this catches a bad table, a
// transposed matrix, or a ray cast that has lost the horseshoe.
import S from './spectrum.js';

let fail = 0;
const approx = (got, want, label, tol = 1e-6) => {
  const rel = Math.abs(got - want) / (Math.abs(want) || 1);
  if (!(rel <= tol)) { console.error(`✗ ${label}: got ${got}, want ${want} (rel ${rel.toExponential(2)})`); fail++; }
};
const near = (got, want, label, abs) => {
  if (!(Math.abs(got - want) <= abs)) { console.error(`✗ ${label}: got ${got}, want ${want} ±${abs}`); fail++; }
};
const eq = (got, want, label) => { if (got !== want) { console.error(`✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } };
const ok = (cond, label) => { if (!cond) { console.error(`✗ ${label}`); fail++; } };

// ── constants ──
approx(S.HC_EV_NM, 1239.8419843320026, 'hc/e in eV·nm', 1e-12);
eq(S.CMF.length, 81, 'CMF table rows (380–780 at 5 nm)');

// ── color-matching functions, against the CIE 1931 2° table ──
const at = (nm) => S.cmf(nm);
near(at(555).X, 0.512050, 'x̄(555)', 1e-5);
near(at(555).Y, 1.000000, 'ȳ(555)', 1e-5);
near(at(555).Z, 0.005750, 'z̄(555)', 1e-5);
near(at(380).X, 0.001368, 'x̄(380)', 1e-6);
near(at(700).X, 0.011359, 'x̄(700)', 1e-5);
near(at(700).Z, 0,        'z̄(700)', 1e-9);
// ȳ is the luminous efficiency function: exactly 1 at its peak, and nowhere more
ok(S.CMF.every(r => r[1] <= 1), 'ȳ peaks at 1');
// linear interpolation lands on the midpoint of two samples
near(at(552.5).Y, (at(550).Y + at(555).Y) / 2, 'interpolated midpoint', 1e-12);
// outside the table there is no color at all
eq(at(300).X + at(300).Y + at(300).Z, 0, 'no response below 380');
eq(at(900).X + at(900).Y + at(900).Z, 0, 'no response above 780');

// ── the spectral locus, against published chromaticities ──
const ch = (nm) => S.chromaticity(nm);
near(ch(700).x, 0.73469, 'x(700)', 1e-5);
near(ch(700).y, 0.26531, 'y(700)', 1e-5);
near(ch(520).x, 0.07430, 'x(520)', 1e-5);
near(ch(520).y, 0.83380, 'y(520)', 1e-5);
near(ch(380).x, 0.17411, 'x(380)', 1e-5);
near(ch(380).y, 0.00496, 'y(380)', 1e-5);
// D65 white is inside the horseshoe; a point off to the lower right is not
ok(S.inLocus(S.WHITE.x, S.WHITE.y), 'white point inside locus');
ok(!S.inLocus(0.70, 0.50), 'point above the locus is outside');
ok(!S.inLocus(0.45, 0.10), 'point below the purple line is outside');

// ── photon arithmetic ──
approx(S.frequency(500), 5.99584916e14, 'f(500 nm)', 1e-9);
approx(S.terahertz(500), 599.584916, 'THz(500 nm)', 1e-9);
approx(S.photonEV(500), 2.4796839686640053, 'eV(500 nm)', 1e-12);
approx(S.wavenumber(500), 20000, 'cm⁻¹(500 nm)', 1e-12);
approx(S.fromTerahertz(S.terahertz(632.8)), 632.8, 'THz round trip', 1e-12);
approx(S.fromEV(S.photonEV(632.8)), 632.8, 'eV round trip', 1e-12);
approx(S.photonJoules(1000) / S.photonEV(1000), S.QE, 'J = eV × e', 1e-15);

// ── naming ──
eq(S.band(550).name, 'Green', 'band 550');
eq(S.band(550).visible, true, 'band 550 visible');
eq(S.band(300).name, 'UV-B', 'band 300');
eq(S.band(1550).name, 'Short-wave IR', 'band 1550');
eq(S.band(300).visible, false, 'UV is not visible');
ok(S.LINES.every(l => l.nm > 0 && l.name), 'landmark lines well-formed');

// ── wavelength → color ──
eq(S.rgb(300).visible, false, '300 nm has no color');
eq(S.hex(300), '#000000', '300 nm renders black');
eq(S.rgb(550).visible, true, '550 nm is visible');
// no pure spectral color fits inside sRGB — every one of them is clipped
for (let nm = 380; nm <= 780; nm += 5) ok(S.rgb(nm).purity < 1, `purity(${nm}) < 1`);
// cyan is where sRGB is worst; the deep red end is where it saturates
ok(S.rgb(505).purity < 0.3, 'sRGB is far from pure cyan');
ok(S.rgb(600).purity > 0.8, 'sRGB is close to pure orange');
// hue stops changing past 700 nm — only brightness is left
eq(S.hex(720, { fade: false }), S.hex(780, { fade: false }), '720 and 780 are the same hue');
ok(S.fade(780) < S.fade(720), 'but 780 is dimmer');
eq(S.fade(555), 1, 'no fade in the middle of the band');
eq(S.fade(900), 0, 'no light outside the band');
// 'vivid' saturates what 'true' desaturates
ok(S.rgb(650, { mode: 'vivid', fade: false }).b < S.rgb(650, { mode: 'true', fade: false }).b, 'vivid clips the blue out of deep red');

// ── hex helpers ──
eq(S.toHex({ r: 255, g: 0, b: 86 }), '#ff0056', 'toHex');
eq(S.toHex(S.parseHex('#0af')), '#00aaff', 'parseHex shorthand');
eq(S.parseHex('nope'), null, 'parseHex rejects junk');
eq(S.parseHex('#FF0056').r, 255, 'parseHex is case-insensitive');

// ── color → wavelength ──
// Published dominant wavelengths of the sRGB primaries.
const dom = (hex) => S.dominantWavelength(S.parseHex(hex));
near(dom('#ff0000').nm, 611.4, 'sRGB red primary', 1.0);
near(dom('#00ff00').nm, 549.1, 'sRGB green primary', 1.0);
near(dom('#0000ff').nm, 464.2, 'sRGB blue primary', 1.0);
near(dom('#ffff00').nm, 570.5, 'sRGB yellow', 1.0);
near(dom('#00ffff').nm, 491.5, 'sRGB cyan', 1.0);
// Magenta is not a wavelength. That is the whole point of the page.
ok(dom('#ff00ff').purple, 'magenta is non-spectral');
eq(dom('#ff00ff').nm, null, 'magenta has no dominant wavelength');
near(dom('#ff00ff').complement, 549.1, 'magenta complement', 1.0);
ok(dom('#ff0080').purple, 'rose is non-spectral');
// Neutrals have no hue to point anywhere.
ok(dom('#808080').achromatic, 'grey is achromatic');
ok(dom('#ffffff').achromatic, 'white is achromatic');
ok(dom('#000000').achromatic, 'black is achromatic');
ok(!dom('#ff0000').achromatic, 'red is not achromatic');
// Purity: a primary is far from white, a near-neutral is not.
ok(dom('#ff0000').purity > 0.9, 'red primary is highly pure');
ok(dom('#8a8080').purity < 0.1, 'near-grey is barely pure');

// ── round trip: nm → color → nm ──
// 'true' mode preserves the dominant wavelength by construction; what is left
// is 8-bit quantisation, which bites hardest where the locus is flat.
let worst = 0, worstAt = 0;
for (let nm = 430; nm <= 660; nm += 0.5) {
  const back = S.dominantWavelength(S.rgb(nm, { fade: false, mode: 'true' }));
  ok(back.nm != null, `round trip ${nm} stays spectral`);
  const e = Math.abs(back.nm - nm);
  if (e > worst) { worst = e; worstAt = nm; }
}
ok(worst < 3, `round trip within 3 nm (worst ${worst.toFixed(2)} at ${worstAt})`);
// The ends of the band are the hard cases; they must still not go purple.
for (const nm of [380, 400, 690, 700, 780]) ok(S.dominantWavelength(S.rgb(nm, { fade: false, mode: 'true' })).nm != null, `${nm} nm is not a purple`);

if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log('✓ unit/lib/spectrum.js — all checks passed');
