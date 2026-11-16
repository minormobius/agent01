/* R1's ropes: what is drawn, where each is cut, and how a drawn panel becomes a live window. Data only, so the
   figure script, the paper's build and the tests can all read it. */
/* each rope: where the two cross-sections are cut, and what the reader should see in them */
export const ROPES = [
  ["hoop", 0, 0.5, "Seven rods in a sphere-hoop", "Cut through the hoop, the rods sit inside a sphere. Cut past it, they are seven balls: a fibre's cross-section is a ball, and six fit round one in a plane, twelve in space."],
  ["ringed", 0, 0.5, "Seven rods in a ring", "A ring goes round the bundle in one plane only. The rods leave through the direction the ring does not cover."],
  ["hoserope", 0, 0.9, "Filaments in a hose", "Cut through the hose: a closed sphere, the filaments hidden inside. Cut past its end: thirteen filaments, one and the twelve round it. From the side, the hose is a sleeve."],
  ["rope", 0, 0.4, "Filaments in a woven sheath", "The sheath is hoops (spheres across the rope) woven with bands that run along it. Through a hoop, and between two.", 1.8],
  ["wound", 0, 0.7, "Wound sheath", "Three ribbons wound in three planes: three bands on the cross-section's sphere, here just wide enough to close it (narrower, they leave eight holes at the corners). Past the bands, the one rod that stands in for the bundle."],
  ["ribbonyarn", 0, 0.4, "Yarn on a ribbon", "The ribbon is a strip across the cross-section; each fibre is a ball beside it, and the balls have turned between one cut and the next. From the side it is a fibre twisted round a thread: the ribbon edge-on.", 2.6],
  ["cable", 0.6, 1.1, "Cable of thirteen ropes", "Cut where the ropes' hoses are: thirteen spheres. Cut past them: 169 filaments in thirteen bundles. From the side: jacket, hoses, filaments, each cut shorter than the last.", 1.8],
  ["hosebraid", 0, 0.5, "Plait of three hoses", "A hose's cross-section is a ring. Three rings, one inside or beside the next, and they have changed places between the two cuts: one ring has passed through another. From the side, each hose is cut twice and the two halves are ordinary plaits.", 1.2],
  ["ribbonbraid", 0, 0.5, "A plait of three ribbons", "A ribbon's cross-section is a strip with two ends. One strip slides along its length past the others' ends and is free."],
  ["maypole", 0, 0.5, "Six hoses braided on a hose core (maypole)", "The pole is a ring; six thinner rings sit round its wire, three going one way and three the other. Between the cuts they have moved round the pole's wire and through each other.", 1.2],
  ["ribbonpole", 0, 0.5, "Ribbons on a hose", "The pole is still a whole ring. The six that wrap it are arcs: each is hooked round the pole's wire and cannot leave it, but one arc can slide round past the ends of the others. From the side, the far cut of the pole is bare: the ribbons are on the near side only.", 1.2],
  ["tubeyarn", 0, 0.75, "Yarn of tubes", "Seven rings: one, and six round its wire. Between the cuts the six have turned about the one. This is our twisted yarn with every fibre a tube, and the twist cannot come out.", 1.2],
];
/* where the second side view is cut: a different z, to show what the first one cannot */
export const ZS = { hoop: 0.3, ringed: 0.3, hoserope: 0.35, rope: 0.35, wound: 0.3, ribbonyarn: 0.225, cable: 0.4, hosebraid: 0.7, ribbonbraid: 0.3, maypole: 0.75, ribbonpole: 0.75, tubeyarn: 0.75 };
const X = [1, 0, 0, 0], Y = [0, 1, 0, 0], Z = [0, 0, 1, 0], W = [0, 0, 0, 1];
/* the four panels of a rope: two cross-sections (x, y, z at two places along w) and two side views (x, y, w at two z) */
export const poses = (name) => { const [, wa, wb, , , zx = 2.3] = ROPES.find((r) => r[0] === name); return {
  a: { E: [X, Y, Z, W], off: wa, yaw: -0.6, pitch: 0.5, zoom: zx, tint: 0 }, b: { E: [X, Y, Z, W], off: wb, yaw: -0.6, pitch: 0.5, zoom: zx, tint: 0 },
  c: { E: [X, W, Y, Z], off: 0, yaw: -0.5, pitch: 0.25, zoom: 1.15, tint: 0 }, d: { E: [X, W, Y, Z], off: ZS[name], yaw: -0.5, pitch: 0.25, zoom: 1.15, tint: 0 } }; };
export const LABEL = (name) => { const [, wa, wb] = ROPES.find((r) => r[0] === name); return { a: `cross-section at w = ${wa}`, b: `cross-section at w = ${wb}`, c: "side view at z = 0 (w up)", d: `side view at z = ${ZS[name]}` }; };
/* a panel that can be woken: the picture, and the address of the same view in CAD⁴'s embed mode */
export const live = (name, tag, cad = "../../cad4/") => `${cad}?embed&pose=${encodeURIComponent(JSON.stringify(poses(name)[tag]))}#${name}`;
export const panel = (name, tag, alt, label) => `<div class="pan"><img src="fig/${name}-${tag}.webp" alt="${alt}" loading="lazy" width="930" height="930" data-live="${live(name, tag).replace(/&/g, "&amp;")}"><span>${label}</span></div>`;
/* click a picture and it becomes the live part: one at a time (a browser allows only a few 3D windows at once) */
export const LIVE_CSS = ".pan{position:relative}.pan img[data-live]{cursor:pointer}.pan iframe{position:absolute;left:0;top:0;width:100%;aspect-ratio:1;border:0;border-radius:6px;background:#3d4250}.pan button{position:absolute;right:6px;top:6px;z-index:2;font:12px system-ui,sans-serif;padding:2px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.45);color:#fff;cursor:pointer}@media print{.pan iframe,.pan button{display:none!important}}";
export const LIVE_JS = `(()=>{let on=null;const off=()=>{if(on){on.f.remove();on.b.remove();on=null}};document.addEventListener("click",e=>{const i=e.target.closest("img[data-live]");if(!i)return;off();const f=document.createElement("iframe"),b=document.createElement("button");f.src=i.dataset.live;f.title=i.alt+" (live: drag to turn, slide to move the cut)";f.loading="eager";b.type="button";b.textContent="picture";b.addEventListener("click",ev=>{ev.stopPropagation();off()});i.parentNode.append(f,b);on={f,b}})})();`;
