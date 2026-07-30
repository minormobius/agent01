// sprites.js — the canvas draw code for fixtures + material carriers (browser only; data is fixtures.js).
// Vector mini-machines, deliberately schematic — enough that a foundry, a loom and a shredder read apart at
// a glance. Each core is one distinctive landmark; non-core steps get a small equipment box. Carriers are
// tiny shapes that animate along the activity graph so the topology MOVES (the verb that kills the soup).

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

// a soft radial glow (the engine's ambient light) centred on a facility core.
export function ambientGlow(ctx, x, y, r, light) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(light, 0.4)); g.addColorStop(0.5, rgba(light, 0.12)); g.addColorStop(1, rgba(light, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}

// non-core equipment: a small machine box with a panel light + the step glyph.
export function drawMachine(ctx, glyph, x, y, r, light) {
  const s = Math.max(4, r * 0.62);
  ctx.fillStyle = 'rgba(20,24,32,.92)'; ctx.strokeStyle = rgba(light, 0.55); ctx.lineWidth = 1;
  roundRect(ctx, x - s, y - s * 0.7, s * 2, s * 1.4, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(light, 0.85); ctx.fillRect(x - s * 0.7, y - s * 0.5, s * 1.4, s * 0.22);   // panel light strip
  if (glyph) { ctx.fillStyle = 'rgba(230,235,242,.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(7, s * 0.9)}px ui-monospace,monospace`; ctx.fillText(glyph, x, y + s * 0.22); }
}

// the CORE landmark machine — one schematic per engine. `t` (0..1, optional) animates live parts.
export function drawCore(ctx, shape, x, y, r, light, t = 0) {
  ctx.save(); ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.lineJoin = 'round';
  const body = 'rgba(16,20,28,.95)', edge = rgba(light, 0.9);
  switch (shape) {
    case 'crucible': {   // foundry — a crucible with a flame + a tap spout
      ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.5); ctx.lineTo(x + r * 0.7, y - r * 0.5); ctx.lineTo(x + r * 0.45, y + r * 0.6); ctx.lineTo(x - r * 0.45, y + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      const f = 0.6 + 0.4 * Math.sin(t * 6.28 * 2);   // flicker
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6); g.addColorStop(0, rgba(light, 0.95 * f)); g.addColorStop(1, rgba(light, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - r * 0.05, r * 0.55, 0, 7); ctx.fill();
      ctx.strokeStyle = edge; ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.3); ctx.lineTo(x + r * 0.95, y - r * 0.05); ctx.stroke();   // spout
      break; }
    case 'retort': {   // chemworks — a round-bottom flask + a column + pipe loop
      ctx.fillStyle = body; ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.arc(x - r * 0.2, y + r * 0.2, r * 0.45, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.25); ctx.lineTo(x - r * 0.2, y - r * 0.7); ctx.stroke();
      ctx.strokeRect(x + r * 0.25, y - r * 0.7, r * 0.35, r * 1.1);   // column
      ctx.beginPath(); ctx.arc(x - r * 0.2, y + r * 0.2, r * 0.2 + r * 0.12 * Math.sin(t * 6.28), 0, 7); ctx.strokeStyle = rgba(light, 0.7); ctx.stroke();   // bubbling
      break; }
    case 'rollers': {   // mill — stacked roller pairs the billet passes through
      ctx.strokeStyle = edge; ctx.fillStyle = body;
      for (let i = -1; i <= 1; i++) { const px = x + i * r * 0.5; ctx.beginPath(); ctx.arc(px, y - r * 0.3, r * 0.18, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(px, y + r * 0.3, r * 0.18, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.strokeStyle = rgba(light, 0.8); ctx.beginPath(); ctx.moveTo(x - r * 0.85, y); ctx.lineTo(x + r * 0.85, y); ctx.stroke();   // the line
      break; }
    case 'litho': {   // fab — a grid wafer under a stepper
      ctx.fillStyle = body; ctx.strokeStyle = edge; roundRect(ctx, x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(light, 0.55); ctx.lineWidth = Math.max(0.6, r * 0.04);
      for (let i = 1; i < 4; i++) { const o = -r * 0.6 + (r * 1.2 * i) / 4; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + o); ctx.lineTo(x + r * 0.6, y + o); ctx.moveTo(x + o, y - r * 0.6); ctx.lineTo(x + o, y + r * 0.6); ctx.stroke(); }
      ctx.fillStyle = rgba(light, 0.6 + 0.4 * Math.abs(Math.sin(t * 6.28))); ctx.fillRect(x - r * 0.5 + (r * Math.sin(t * 6.28) * 0.4), y - r * 0.75, r * 0.18, r * 0.18);   // stepper head
      break; }
    case 'loom': {   // weave — a frame with warp threads + a moving shuttle
      ctx.strokeStyle = edge; ctx.fillStyle = body; ctx.strokeRect(x - r * 0.7, y - r * 0.6, r * 1.4, r * 1.2);
      ctx.strokeStyle = rgba(light, 0.5); ctx.lineWidth = Math.max(0.5, r * 0.04);
      for (let i = 0; i < 6; i++) { const px = x - r * 0.6 + (r * 1.2 * i) / 5; ctx.beginPath(); ctx.moveTo(px, y - r * 0.6); ctx.lineTo(px, y + r * 0.6); ctx.stroke(); }
      ctx.fillStyle = rgba(light, 0.95); const sh = x - r * 0.6 + r * 1.2 * (t % 1); ctx.fillRect(sh - r * 0.06, y - r * 0.05, r * 0.12, r * 0.1);   // shuttle
      break; }
    case 'conveyor': {   // assembly — a belt with a robot arm over it
      ctx.strokeStyle = edge; ctx.fillStyle = body; roundRect(ctx, x - r * 0.8, y + r * 0.1, r * 1.6, r * 0.4, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(light, 0.6); for (let i = 0; i < 5; i++) { const px = x - r * 0.7 + ((r * 1.4 * ((i / 5 + t * 0.5) % 1))); ctx.beginPath(); ctx.moveTo(px, y + r * 0.15); ctx.lineTo(px, y + r * 0.45); ctx.stroke(); }   // belt slats
      ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, r * 0.08); const a = -0.6 + 0.4 * Math.sin(t * 6.28); ctx.beginPath(); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x + r * 0.3 * Math.cos(a), y - r * 0.6 + r * 0.5 * Math.sin(a + 1.2)); ctx.lineTo(x + r * 0.2, y + r * 0.05); ctx.stroke();   // arm
      break; }
    case 'pump': {   // fluid — a pump impeller in a casing + flanges
      ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(light, 0.85); ctx.save(); ctx.translate(x, y); ctx.rotate(t * 6.28 * 1.5);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.45, 0); ctx.stroke(); } ctx.restore();
      ctx.strokeStyle = edge; ctx.strokeRect(x - r * 0.75, y - r * 0.12, r * 0.2, r * 0.24); ctx.strokeRect(x + r * 0.55, y - r * 0.12, r * 0.2, r * 0.24);   // flanges
      break; }
    case 'shredder': {   // reclaim — a hopper over interlocking teeth
      ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(x + r * 0.7, y - r * 0.6); ctx.lineTo(x + r * 0.3, y); ctx.lineTo(x - r * 0.3, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(light, 0.9); const off = (t % 1) * r * 0.2;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.12, y); ctx.lineTo(x + i * r * 0.12 + r * 0.06, y + r * 0.3 + (i % 2 ? off : -off)); ctx.stroke(); }   // teeth
      break; }
    case 'lift': {   // fulfillment — a vertical shaft with rising/falling cars (the nave conduit)
      ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.strokeRect(x - r * 0.35, y - r * 0.8, r * 0.7, r * 1.6);
      for (let i = 0; i < 3; i++) { const yy = y + r * 0.8 - ((r * 1.6 * ((i / 3 + t) % 1))); ctx.fillStyle = rgba(light, 0.9); ctx.fillRect(x - r * 0.22, yy - r * 0.12, r * 0.44, r * 0.24); }   // cars going up
      ctx.strokeStyle = rgba(light, 0.8); ctx.beginPath(); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x - r * 0.12, y - r * 0.95); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x + r * 0.12, y - r * 0.95); ctx.stroke();   // up arrow
      break; }
    default: drawMachine(ctx, '', x, y, r, light);
  }
  ctx.restore();
}

// a material carrier (the stuff moving along the activity graph).
export function drawCarrier(ctx, shape, x, y, r, color, hot) {
  ctx.save();
  if (hot) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, rgba(color, 0.6)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill(); }
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(8,10,14,.5)'; ctx.lineWidth = 0.5;
  switch (shape) {
    case 'droplet': ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); break;
    case 'bubble': ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.5; ctx.fill(); break;
    case 'bar': ctx.fillRect(x - r * 1.4, y - r * 0.5, r * 2.8, r); break;
    case 'chip': ctx.fillRect(x - r, y - r, r * 2, r * 2); break;
    case 'shuttle': ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.6, 0, 0, 7); ctx.fill(); break;
    case 'part': ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); ctx.fill(); break;
    case 'drop': ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, 7); ctx.fill(); break;
    case 'junk': ctx.fillRect(x - r, y - r, r * 1.3, r * 1.3); ctx.fillRect(x + r * 0.1, y, r * 0.9, r * 0.9); break;
    case 'crate': ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = 'rgba(8,10,14,.6)'; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }
