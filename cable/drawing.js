// cable/drawing.js — renders a solved cable as a blueprint-style SVG schematic.
//
// Layout, board → component, left to right:
//   [ Board ]=[board connector]====( cable bundle )====[component connector]=[ Component ]
// Each conductor is a coloured line fanning from a board pin, through the bundle
// (shield sleeve + twist hatching when present), to a component pin. Returns an
// SVG string; CABLE_DRAW.svgBlob() wraps it for download.

(function (root) {
  "use strict";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function render(sol) {
    const cond = sol.wireList.filter((w) => w.type !== "shield");
    const n = cond.length;
    const W = 960;
    const rowH = 16;
    const band = Math.max(n * rowH, 80);
    const H = band + 200;
    const midY = 110 + band / 2;

    // x landmarks
    const boardX = 40, boardW = 150;
    const bConnX = boardX + boardW, bConnW = 46;
    const cableX0 = bConnX + bConnW;
    const compW = 170, compX = W - 40 - compW;
    const cConnW = 46, cConnX = compX - cConnW;
    const cableX1 = cConnX;
    const pinR = 4;

    const top = 110;
    const pinY = (i) => top + rowH / 2 + i * rowH + (band - n * rowH) / 2;

    let s = "";
    const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">`;

    // backdrop grid (blueprint feel)
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#0d1b2a"/>`;
    s += `<g stroke="#16304a" stroke-width="1">`;
    for (let x = 0; x <= W; x += 24) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
    for (let y = 0; y <= H; y += 24) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    s += `</g>`;

    // title block
    s += `<text x="${W / 2}" y="34" fill="#cfe8ff" font-size="18" text-anchor="middle" font-weight="700">CABLE DRAWING — ${esc(sol.stack[0].name)} ↔ ${esc(sol.ends.board.board.name)}</text>`;
    s += `<text x="${W / 2}" y="56" fill="#7fb4e0" font-size="12" text-anchor="middle">${n}C · ${esc(sol.summary.gaugeLabel)} · ${esc(sol.summary.strand.cls)}${sol.summary.shielded ? " · shielded" : ""}${sol.summary.pairs.length ? " · " + sol.summary.pairs.length + "×TP" : ""} · ${sol.summary.lengthM} m</text>`;

    // board + component bodies
    function body(x, w, label, sub) {
      let g = `<rect x="${x}" y="${top - 6}" width="${w}" height="${band + 12}" rx="8" fill="#13283d" stroke="#3a6ea5" stroke-width="2"/>`;
      g += `<text x="${x + w / 2}" y="${top + band / 2}" fill="#dce9f5" font-size="13" text-anchor="middle" font-weight="700">${esc(label)}</text>`;
      g += `<text x="${x + w / 2}" y="${top + band / 2 + 18}" fill="#7fb4e0" font-size="10" text-anchor="middle">${esc(sub)}</text>`;
      return g;
    }
    s += body(boardX, boardW, sol.ends.board.board.name, "BOARD (7)");
    s += body(compX, compW, sol.stack[0].name, "COMPONENT (1)");

    // connector shells (trapezoids) + label
    function connector(x, w, dir, label, sub) {
      // dir +1 points right (board connector), -1 points left (component connector)
      const inX = x, outX = x + w;
      let g = `<polygon points="${inX},${top - 2} ${outX},${top + 8} ${outX},${top + band - 8} ${inX},${top + band + 2}" fill="#1c3a57" stroke="#5b9bd5" stroke-width="2"/>`;
      g += `<text x="${x + w / 2}" y="${top - 14}" fill="#9fd0f5" font-size="10" text-anchor="middle">${esc(label)}</text>`;
      g += `<text x="${x + w / 2}" y="${H - 150 + band}" fill="#6fa8d5" font-size="9" text-anchor="middle">${esc(sub)}</text>`;
      return g;
    }
    s += connector(bConnX, bConnW, 1, sol.ends.board.conn.name + " (6)", "");
    s += connector(cConnX, cConnW, -1, sol.ends.comp.conn.name + " (2)", "");

    // shield sleeve around the bundle
    if (sol.summary.shielded) {
      s += `<rect x="${cableX0}" y="${top + (band - n * rowH) / 2 - 8}" width="${cableX1 - cableX0}" height="${n * rowH + 16}" rx="6" fill="none" stroke="#9aa7b3" stroke-width="2" stroke-dasharray="2 3" opacity="0.8"/>`;
      s += `<text x="${(cableX0 + cableX1) / 2}" y="${top + (band - n * rowH) / 2 - 14}" fill="#aab7c3" font-size="9" text-anchor="middle">${esc(sol.summary.shieldKind)}</text>`;
    }

    // conductors: pin (board) → straight through bundle → pin (component)
    const pairColors = {};
    for (let i = 0; i < n; i++) {
      const y = pinY(i);
      const w = cond[i];
      const bx = bConnX + bConnW, cx = cConnX;
      // fan from connector inner edge to bundle
      s += `<path d="M ${bx} ${y} L ${cableX0} ${y} L ${cableX1} ${y} L ${cx} ${y}" fill="none" stroke="${w.color}" stroke-width="2.4"/>`;
      // pins (small circles) on each connector inner face
      s += `<circle cx="${bConnX + 8}" cy="${y}" r="${pinR}" fill="${w.color}" stroke="#0d1b2a"/>`;
      s += `<circle cx="${cConnX + cConnW - 8}" cy="${y}" r="${pinR}" fill="${w.color}" stroke="#0d1b2a"/>`;
      // signal label centred on the run
      s += `<text x="${(cableX0 + cableX1) / 2}" y="${y - 3}" fill="#e6eef5" font-size="9" text-anchor="middle">${esc(w.signal)}</text>`;
      if (w.pair) pairColors[w.pair] = (pairColors[w.pair] || []).concat(y);
    }

    // twist hatching over paired conductors
    if (sol.summary.twist) {
      const mid = (cableX0 + cableX1) / 2;
      Object.values(pairColors).forEach((ys) => {
        if (ys.length < 2) return;
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        for (let x = cableX0 + 14; x < cableX1 - 14; x += 18) {
          s += `<line x1="${x}" y1="${y0}" x2="${x + 9}" y2="${y1}" stroke="#9fd0f5" stroke-width="1" opacity="0.5"/>`;
          s += `<line x1="${x}" y1="${y1}" x2="${x + 9}" y2="${y0}" stroke="#9fd0f5" stroke-width="1" opacity="0.5"/>`;
        }
      });
    }

    // dimension line for length
    const dimY = top + band + 40;
    s += `<line x1="${cableX0}" y1="${dimY}" x2="${cableX1}" y2="${dimY}" stroke="#7fb4e0" stroke-width="1"/>`;
    s += `<line x1="${cableX0}" y1="${dimY - 5}" x2="${cableX0}" y2="${dimY + 5}" stroke="#7fb4e0"/>`;
    s += `<line x1="${cableX1}" y1="${dimY - 5}" x2="${cableX1}" y2="${dimY + 5}" stroke="#7fb4e0"/>`;
    s += `<text x="${(cableX0 + cableX1) / 2}" y="${dimY - 6}" fill="#9fd0f5" font-size="11" text-anchor="middle">${sol.summary.lengthM} m  ·  ${esc(sol.summary.twist ? sol.summary.twist.label : "untwisted")}</text>`;

    // pin-set callouts (3) and (5)
    s += `<text x="${bConnX - 4}" y="${dimY + 4}" fill="#8fd0a0" font-size="10" text-anchor="end">pin set board (5): ${n}× ${esc(sol.ends.board.contact.name)}</text>`;
    s += `<text x="${cConnX + cConnW + 4}" y="${dimY + 4}" fill="#8fd0a0" font-size="10" text-anchor="start">pin set comp (3): ${n}× ${esc(sol.ends.comp.contact.name)}</text>`;

    s += `</svg>`;
    return svgOpen + s;
  }

  function svgBlob(svgStr) {
    return new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  }

  root.CABLE_DRAW = { render, svgBlob };
})(typeof globalThis !== "undefined" ? globalThis : this);
