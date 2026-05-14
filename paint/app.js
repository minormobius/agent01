"use strict";

// ====================================================================
// minomobi paint — pocket MS Paint
//
// Bitmap is held in an offscreen <canvas> at fixed resolution. The
// visible <canvas id="view"> is at viewport size and shows a
// scaled+translated view of the bitmap. Pixel art mode stays sharp
// because we set image smoothing off when zoomed in.
// ====================================================================

// ---- constants ----------------------------------------------------

const BITMAP_W = 1280;
const BITMAP_H = 1280;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const MAX_HISTORY = 50;

const PALETTE = [
  "#000000","#7f7f7f","#bfbfbf","#ffffff",
  "#8b0000","#ff0000","#ff7f00","#ffd400",
  "#ffff00","#00a800","#00ff00","#00ffff",
  "#0000ff","#5500aa","#aa00aa","#ff00aa",
  "#7f3f00","#c08040","#ffc0a0","#ffe6c0",
  "#80ff80","#80ffff","#c0c0ff","#ff80c0",
];

// ---- DOM refs -----------------------------------------------------

const $ = id => document.getElementById(id);
const view     = $("view");
const stage    = $("stage");
const undoBtn  = $("undo-btn");
const redoBtn  = $("redo-btn");
const zoomIn   = $("zoom-in-btn");
const zoomOut  = $("zoom-out-btn");
const fitBtn   = $("fit-btn");
const shareBtn = $("share-btn");
const menuBtn  = $("menu-btn");
const menuEl   = $("menu");
const zoomLabel= $("zoom-label");
const statusStrip = $("status-strip");
const sizeSlider  = $("size-slider");
const sizeReadout = $("size-readout");
const currentColor= $("current-color");
const customColor = $("custom-color");
const colorsEl    = $("colors");
const toolrail    = $("toolrail");
const rectVariant = $("rect-variant");
const ellipseVar  = $("ellipse-variant");
const toast       = $("toast");
const pasteFile   = $("paste-file");

const ctx = view.getContext("2d");

// ---- state --------------------------------------------------------

const bitmap     = document.createElement("canvas");
bitmap.width     = BITMAP_W;
bitmap.height    = BITMAP_H;
const bctx       = bitmap.getContext("2d");

// Preview canvas — shape rubber-banding lives here; composited over bitmap.
const preview    = document.createElement("canvas");
preview.width    = BITMAP_W;
preview.height   = BITMAP_H;
const pctx       = preview.getContext("2d");

// Initial bitmap fill: opaque white.
bctx.fillStyle = "#ffffff";
bctx.fillRect(0, 0, BITMAP_W, BITMAP_H);

const state = {
  tool:      "brush",
  color:     "#000000",
  brushSize: 4,
  rectFilled: false,
  ellipseFilled: false,
  view: { zoom: 1, panX: 0, panY: 0 },
  drawing: null,           // { tool, startBx, startBy, lastBx, lastBy, snapshot }
  pointers: new Map(),     // pointerId -> { x, y } in stage-local coords
  gesture: null,           // pinch state: { d0, mid0View, mid0Bitmap, zoom0 }
  history: [],
  historyIdx: -1,
  dprView: 1,
  W: 0, H: 0,
};

// ---- coordinate transforms ---------------------------------------

function viewToBitmap(vx, vy) {
  return {
    x: (vx - state.view.panX) / state.view.zoom,
    y: (vy - state.view.panY) / state.view.zoom,
  };
}
function bitmapToView(bx, by) {
  return {
    x: bx * state.view.zoom + state.view.panX,
    y: by * state.view.zoom + state.view.panY,
  };
}
function fitView() {
  const z = Math.min(state.W / BITMAP_W, state.H / BITMAP_H) * 0.92;
  state.view.zoom = z;
  state.view.panX = (state.W - BITMAP_W * z) / 2;
  state.view.panY = (state.H - BITMAP_H * z) / 2;
}
function clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); }

// ---- resize / DPR -------------------------------------------------

function resize() {
  const r = stage.getBoundingClientRect();
  state.dprView = window.devicePixelRatio || 1;
  state.W = r.width;
  state.H = r.height;
  view.width  = Math.max(1, Math.floor(r.width  * state.dprView));
  view.height = Math.max(1, Math.floor(r.height * state.dprView));
  ctx.setTransform(state.dprView, 0, 0, state.dprView, 0, 0);
  render();
}

// ---- render -------------------------------------------------------

function render() {
  ctx.save();
  // Clear the visible canvas (background is the checker pattern in CSS).
  ctx.clearRect(0, 0, state.W, state.H);

  // Pixel-perfect when zoomed in.
  ctx.imageSmoothingEnabled = state.view.zoom < 1.5;

  const dw = BITMAP_W * state.view.zoom;
  const dh = BITMAP_H * state.view.zoom;
  // Bitmap.
  ctx.drawImage(bitmap, state.view.panX, state.view.panY, dw, dh);
  // Preview layer (rubber-band shapes).
  if (state.drawing && state.drawing.hasPreview) {
    ctx.drawImage(preview, state.view.panX, state.view.panY, dw, dh);
  }

  // Canvas edge frame.
  ctx.strokeStyle = getCss("--canvas-edge", "#999");
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(state.view.panX) + 0.5,
    Math.round(state.view.panY) + 0.5,
    Math.round(dw), Math.round(dh)
  );

  ctx.restore();
  refreshStatus();
}

function getCss(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function refreshStatus() {
  const z = Math.round(state.view.zoom * 100);
  zoomLabel.textContent = z + "%";
  statusStrip.textContent =
    `${BITMAP_W}×${BITMAP_H} · ${z}% · ` +
    `${state.tool}${state.tool === "rect" ? (state.rectFilled ? " (filled)" : " (outline)") :
                     state.tool === "ellipse" ? (state.ellipseFilled ? " (filled)" : " (outline)") : ""}`;
}

// ---- history (bitmap snapshots) ----------------------------------

function pushHistory() {
  // Drop forward history.
  state.history.length = state.historyIdx + 1;
  // Capture the current bitmap into a fresh canvas.
  const snap = document.createElement("canvas");
  snap.width = BITMAP_W; snap.height = BITMAP_H;
  snap.getContext("2d").drawImage(bitmap, 0, 0);
  state.history.push(snap);
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.historyIdx = state.history.length - 1;
  updateUndoRedoButtons();
}
function undo() {
  if (state.historyIdx <= 0) return;
  state.historyIdx--;
  restoreSnapshot(state.history[state.historyIdx]);
  updateUndoRedoButtons();
}
function redo() {
  if (state.historyIdx >= state.history.length - 1) return;
  state.historyIdx++;
  restoreSnapshot(state.history[state.historyIdx]);
  updateUndoRedoButtons();
}
function restoreSnapshot(snap) {
  bctx.clearRect(0, 0, BITMAP_W, BITMAP_H);
  bctx.drawImage(snap, 0, 0);
  render();
}
function updateUndoRedoButtons() {
  undoBtn.disabled = state.historyIdx <= 0;
  redoBtn.disabled = state.historyIdx >= state.history.length - 1;
}

// ---- drawing primitives ------------------------------------------

function strokeSegment(targetCtx, x0, y0, x1, y1, size, color) {
  targetCtx.strokeStyle = color;
  targetCtx.fillStyle   = color;
  targetCtx.lineWidth   = size;
  targetCtx.lineCap     = "round";
  targetCtx.lineJoin    = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(x0, y0);
  targetCtx.lineTo(x1, y1);
  targetCtx.stroke();
  // For tiny brushes a single dot avoids gaps on hover-then-move.
  if (size <= 1) {
    targetCtx.fillRect(Math.round(x1), Math.round(y1), 1, 1);
  }
}

function pencilDot(targetCtx, x, y, color) {
  targetCtx.fillStyle = color;
  targetCtx.fillRect(Math.round(x), Math.round(y), 1, 1);
}
function bresenhamLine(targetCtx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  targetCtx.fillStyle = color;
  for (;;) {
    targetCtx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function drawRectPath(targetCtx, x0, y0, x1, y1, size, color, filled) {
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (filled) {
    targetCtx.fillStyle = color;
    targetCtx.fillRect(x, y, w, h);
  } else {
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = size;
    targetCtx.lineJoin = "miter";
    targetCtx.strokeRect(x + size/2, y + size/2, Math.max(0, w - size), Math.max(0, h - size));
  }
}
function drawEllipsePath(targetCtx, x0, y0, x1, y1, size, color, filled) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  targetCtx.beginPath();
  targetCtx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  if (filled) {
    targetCtx.fillStyle = color;
    targetCtx.fill();
  } else {
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = size;
    targetCtx.stroke();
  }
}

// Flood fill on the bitmap, 4-connected, on the image data buffer.
function floodFill(x, y, hexColor) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= BITMAP_W || y >= BITMAP_H) return;
  const img = bctx.getImageData(0, 0, BITMAP_W, BITMAP_H);
  const data = img.data;
  const idx = (y * BITMAP_W + x) * 4;
  const tr = data[idx], tg = data[idx+1], tb = data[idx+2], ta = data[idx+3];
  const [nr, ng, nb] = hexToRgb(hexColor);
  if (tr === nr && tg === ng && tb === nb && ta === 255) return;
  const stack = [x, y];
  while (stack.length) {
    const py = stack.pop(), px = stack.pop();
    if (px < 0 || py < 0 || px >= BITMAP_W || py >= BITMAP_H) continue;
    const i = (py * BITMAP_W + px) * 4;
    if (data[i] !== tr || data[i+1] !== tg || data[i+2] !== tb || data[i+3] !== ta) continue;
    data[i] = nr; data[i+1] = ng; data[i+2] = nb; data[i+3] = 255;
    stack.push(px+1, py, px-1, py, px, py+1, px, py-1);
  }
  bctx.putImageData(img, 0, 0);
}

function hexToRgb(hex) {
  const h = hex.replace("#","");
  if (h.length === 3) {
    return [
      parseInt(h[0]+h[0],16),
      parseInt(h[1]+h[1],16),
      parseInt(h[2]+h[2],16),
    ];
  }
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r, g, b) {
  return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
}

function eraserColor() { return "#ffffff"; }  // simple model: white "paper"
function clearPreview() {
  pctx.clearRect(0, 0, BITMAP_W, BITMAP_H);
}

// ---- tools --------------------------------------------------------

function startTool(tool, bx, by) {
  state.drawing = {
    tool,
    startBx: bx, startBy: by,
    lastBx:  bx, lastBy:  by,
    hasPreview: false,
  };
  switch (tool) {
    case "brush":
    case "eraser":
      strokeSegment(bctx, bx, by, bx, by, state.brushSize,
        tool === "eraser" ? eraserColor() : state.color);
      break;
    case "pencil":
      pencilDot(bctx, bx, by, state.color);
      break;
    case "fill":
      floodFill(bx, by, state.color);
      break;
    case "eyedropper":
      pickColorAt(bx, by);
      state.drawing = null;
      return;
    case "line":
    case "rect":
    case "ellipse":
      state.drawing.hasPreview = true;
      drawShapePreview(bx, by, bx, by);
      break;
  }
  render();
}

function moveTool(bx, by) {
  if (!state.drawing) return;
  const d = state.drawing;
  switch (d.tool) {
    case "brush":
    case "eraser":
      strokeSegment(bctx, d.lastBx, d.lastBy, bx, by, state.brushSize,
        d.tool === "eraser" ? eraserColor() : state.color);
      break;
    case "pencil":
      bresenhamLine(bctx, d.lastBx, d.lastBy, bx, by, state.color);
      break;
    case "line":
    case "rect":
    case "ellipse":
      drawShapePreview(d.startBx, d.startBy, bx, by);
      break;
    case "eyedropper":
      pickColorAt(bx, by);
      break;
  }
  d.lastBx = bx; d.lastBy = by;
  render();
}

function endTool(bx, by) {
  if (!state.drawing) return;
  const d = state.drawing;
  switch (d.tool) {
    case "line":
      bresenhamThickLine(bctx, d.startBx, d.startBy, bx, by, state.brushSize, state.color);
      break;
    case "rect":
      drawRectPath(bctx, d.startBx, d.startBy, bx, by, state.brushSize, state.color, state.rectFilled);
      break;
    case "ellipse":
      drawEllipsePath(bctx, d.startBx, d.startBy, bx, by, state.brushSize, state.color, state.ellipseFilled);
      break;
  }
  state.drawing = null;
  clearPreview();
  pushHistory();
  render();
}

function cancelTool() {
  // Two-finger pinch starts: revert any in-progress drawing.
  if (!state.drawing) return;
  const d = state.drawing;
  if (["brush","pencil","eraser","fill"].includes(d.tool)) {
    // These already committed pixels; restore from last history entry.
    if (state.historyIdx >= 0) {
      restoreSnapshot(state.history[state.historyIdx]);
    }
  }
  state.drawing = null;
  clearPreview();
  render();
}

function drawShapePreview(x0, y0, x1, y1) {
  clearPreview();
  pctx.save();
  if (state.drawing.tool === "line") {
    // Use a 1px outline preview for clarity; final commit uses thick line.
    pctx.strokeStyle = state.color;
    pctx.lineWidth = Math.max(1, state.brushSize);
    pctx.lineCap = "round";
    pctx.beginPath();
    pctx.moveTo(x0, y0);
    pctx.lineTo(x1, y1);
    pctx.stroke();
  } else if (state.drawing.tool === "rect") {
    drawRectPath(pctx, x0, y0, x1, y1, state.brushSize, state.color, state.rectFilled);
  } else if (state.drawing.tool === "ellipse") {
    drawEllipsePath(pctx, x0, y0, x1, y1, state.brushSize, state.color, state.ellipseFilled);
  }
  pctx.restore();
  state.drawing.hasPreview = true;
}

function bresenhamThickLine(targetCtx, x0, y0, x1, y1, size, color) {
  // Use the canvas stroke for thickness > 1 (smoother), pencil-line for 1.
  if (size <= 1) {
    bresenhamLine(targetCtx, x0, y0, x1, y1, color);
    return;
  }
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = size;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(x0, y0);
  targetCtx.lineTo(x1, y1);
  targetCtx.stroke();
}

function pickColorAt(bx, by) {
  const x = Math.floor(bx), y = Math.floor(by);
  if (x < 0 || y < 0 || x >= BITMAP_W || y >= BITMAP_H) return;
  const d = bctx.getImageData(x, y, 1, 1).data;
  setColor(rgbToHex(d[0], d[1], d[2]));
}

// ---- color + tool selection --------------------------------------

function setColor(hex) {
  state.color = hex.toLowerCase();
  customColor.value = hex;
  currentColor.style.background = hex;
  // Update active swatch outline.
  colorsEl.querySelectorAll(".swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.color === state.color);
  });
}
function setTool(t) {
  state.tool = t;
  toolrail.querySelectorAll(".tool").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === t);
  });
  refreshStatus();
}
function setSize(n) {
  state.brushSize = Math.max(1, Math.min(64, Math.floor(n)));
  sizeSlider.value = state.brushSize;
  sizeReadout.textContent = state.brushSize;
}

function showToast(msg, ms) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), ms || 1800);
}

// ---- expose to second script chunk -------------------------------

window._paint = {
  state, bitmap, bctx, preview, pctx, view, ctx, stage,
  BITMAP_W, BITMAP_H,
  render, resize, fitView, clampZoom,
  viewToBitmap, bitmapToView,
  startTool, moveTool, endTool, cancelTool,
  pushHistory, undo, redo,
  setColor, setTool, setSize,
  showToast, getCss,
  hexToRgb, rgbToHex,
  PALETTE,
};

// ====================================================================
// Part 2: input handlers, pinch zoom, share, paste, boot.
// ====================================================================

(function() {
  const P = window._paint;
  const {
    state, bitmap, bctx, view, stage,
    BITMAP_W, BITMAP_H,
    render, resize, fitView, clampZoom,
    viewToBitmap, bitmapToView,
    startTool, moveTool, endTool, cancelTool,
    pushHistory, undo, redo,
    setColor, setTool, setSize,
    showToast,
    PALETTE,
  } = P;

  // ---- Pointer / multi-touch ----

  function localPoint(e) {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function ptDist(a, b)   { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onPointerDown(e) {
    if (e.target !== view) return;
    e.preventDefault();
    view.setPointerCapture(e.pointerId);
    const pt = localPoint(e);
    state.pointers.set(e.pointerId, pt);

    if (state.pointers.size === 1) {
      // Single pointer → start drawing with current tool.
      const b = viewToBitmap(pt.x, pt.y);
      startTool(state.tool, b.x, b.y);
    } else if (state.pointers.size === 2) {
      // Second pointer → cancel any in-progress drawing, start pinch.
      cancelTool();
      const pts = [...state.pointers.values()];
      const mid0View = midpoint(pts[0], pts[1]);
      state.gesture = {
        d0: Math.max(1, ptDist(pts[0], pts[1])),
        mid0View,
        mid0Bitmap: viewToBitmap(mid0View.x, mid0View.y),
        zoom0: state.view.zoom,
      };
    }
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const pt = localPoint(e);
    state.pointers.set(e.pointerId, pt);

    if (state.pointers.size === 1 && state.drawing) {
      const b = viewToBitmap(pt.x, pt.y);
      moveTool(b.x, b.y);
    } else if (state.pointers.size === 2 && state.gesture) {
      const pts = [...state.pointers.values()];
      const d1 = Math.max(1, ptDist(pts[0], pts[1]));
      const mid1View = midpoint(pts[0], pts[1]);
      const newZoom = clampZoom(state.gesture.zoom0 * (d1 / state.gesture.d0));
      // Pan so the bitmap point that was under the initial midpoint stays
      // under the new midpoint.
      state.view.zoom = newZoom;
      state.view.panX = mid1View.x - state.gesture.mid0Bitmap.x * newZoom;
      state.view.panY = mid1View.y - state.gesture.mid0Bitmap.y * newZoom;
      render();
    }
  }

  function onPointerUp(e) {
    if (!state.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const wasDrawing = state.drawing;
    const wasPinching = state.gesture;
    state.pointers.delete(e.pointerId);

    if (state.pointers.size === 0) {
      if (wasDrawing) {
        // Commit drawing using the last known point.
        const pt = localPoint(e);
        const b = viewToBitmap(pt.x, pt.y);
        endTool(b.x, b.y);
      }
      state.gesture = null;
    } else if (state.pointers.size === 1 && wasPinching) {
      // One finger lifted from a pinch — keep view, just exit pinch mode.
      // Don't start a new stroke from the remaining finger; require a fresh
      // pointerdown so we don't draw scribbles after a zoom.
      state.gesture = null;
      try { view.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  }

  view.addEventListener("pointerdown",   onPointerDown);
  view.addEventListener("pointermove",   onPointerMove);
  view.addEventListener("pointerup",     onPointerUp);
  view.addEventListener("pointercancel", onPointerUp);
  view.addEventListener("pointerleave",  e => { if (state.pointers.has(e.pointerId)) onPointerUp(e); });
  view.addEventListener("contextmenu",   e => e.preventDefault());

  // ---- Wheel zoom (desktop) ----

  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pt = localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = clampZoom(state.view.zoom * factor);
    const b = viewToBitmap(pt.x, pt.y);
    state.view.zoom = newZoom;
    state.view.panX = pt.x - b.x * newZoom;
    state.view.panY = pt.y - b.y * newZoom;
    render();
  }, { passive: false });

  // ---- Top-bar / menu controls ----

  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("redo-btn").addEventListener("click", redo);

  function zoomAroundCenter(factor) {
    const cx = state.W / 2, cy = state.H / 2;
    const newZoom = clampZoom(state.view.zoom * factor);
    const b = viewToBitmap(cx, cy);
    state.view.zoom = newZoom;
    state.view.panX = cx - b.x * newZoom;
    state.view.panY = cy - b.y * newZoom;
    render();
  }
  document.getElementById("zoom-in-btn").addEventListener("click",  () => zoomAroundCenter(1.25));
  document.getElementById("zoom-out-btn").addEventListener("click", () => zoomAroundCenter(0.8));
  document.getElementById("fit-btn").addEventListener("click",      () => { fitView(); render(); });

  // ---- Menu ----

  const menuEl  = document.getElementById("menu");
  const menuBtn = document.getElementById("menu-btn");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuEl.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!menuEl.contains(e.target) && e.target !== menuBtn) menuEl.classList.remove("open");
  });
  document.getElementById("menu-save").addEventListener("click", () => { menuEl.classList.remove("open"); savePNG(); });
  document.getElementById("menu-paste").addEventListener("click", () => { menuEl.classList.remove("open"); document.getElementById("paste-file").click(); });
  document.getElementById("menu-new").addEventListener("click", () => {
    menuEl.classList.remove("open");
    if (!confirm("Clear the canvas?")) return;
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, BITMAP_W, BITMAP_H);
    pushHistory();
    render();
  });
  document.getElementById("menu-bg").addEventListener("click", () => {
    menuEl.classList.remove("open");
    bctx.fillStyle = state.color;
    bctx.fillRect(0, 0, BITMAP_W, BITMAP_H);
    pushHistory();
    render();
  });
  document.getElementById("menu-help").addEventListener("click", () => {
    menuEl.classList.remove("open");
    alert(
      "Shortcuts:\n" +
      "  B  Brush      P  Pencil     E  Eraser\n" +
      "  G  Fill       L  Line\n" +
      "  R  Rectangle  O  Ellipse    I  Eyedropper\n" +
      "  [ / ]  decrease / increase size\n" +
      "  +  / -   zoom in / out      0  fit to screen\n" +
      "  Cmd/Ctrl+Z  Undo            Cmd/Ctrl+Shift+Z  Redo\n" +
      "  Cmd/Ctrl+V  Paste image\n" +
      "  S  Save PNG\n" +
      "\nTouch: pinch to zoom, two-finger pan."
    );
  });

  // ---- Tool rail ----

  document.getElementById("toolrail").addEventListener("click", (e) => {
    const btn = e.target.closest(".tool");
    if (!btn) return;
    const t = btn.dataset.tool;
    if (state.tool === t && (t === "rect" || t === "ellipse")) {
      // Re-clicking rect / ellipse toggles filled/outline.
      if (t === "rect") {
        state.rectFilled = !state.rectFilled;
        document.getElementById("rect-variant").textContent = state.rectFilled ? "F" : "O";
      } else {
        state.ellipseFilled = !state.ellipseFilled;
        document.getElementById("ellipse-variant").textContent = state.ellipseFilled ? "F" : "O";
      }
      P.render();
      return;
    }
    setTool(t);
  });

  // ---- Colors palette ----

  const colorsEl = document.getElementById("colors");
  // Insert swatches before the color-picker-wrap (which is already in DOM).
  const picker = colorsEl.querySelector(".color-picker-wrap");
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.color = c.toLowerCase();
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => setColor(c));
    colorsEl.insertBefore(b, picker);
  }
  document.getElementById("custom-color").addEventListener("input", (e) => setColor(e.target.value));

  // ---- Size slider ----

  const sizeSlider = document.getElementById("size-slider");
  sizeSlider.addEventListener("input", () => setSize(parseInt(sizeSlider.value, 10) || 1));

  // ---- Keyboard ----

  window.addEventListener("keydown", (e) => {
    // Don't capture when typing in an input.
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (cmd && (e.key === "s" || e.key === "S")) { e.preventDefault(); savePNG(); return; }
    if (cmd) return;  // let Cmd+V fall through to native paste event
    switch (e.key) {
      case "b": case "B": setTool("brush"); break;
      case "p": case "P": setTool("pencil"); break;
      case "e": case "E": setTool("eraser"); break;
      case "g": case "G": setTool("fill"); break;
      case "l": case "L": setTool("line"); break;
      case "r": case "R": setTool("rect"); break;
      case "o": case "O": setTool("ellipse"); break;
      case "i": case "I": setTool("eyedropper"); break;
      case "[": setSize(state.brushSize - 1); break;
      case "]": setSize(state.brushSize + 1); break;
      case "+": case "=": zoomAroundCenter(1.25); break;
      case "-": case "_": zoomAroundCenter(0.8); break;
      case "0": fitView(); render(); break;
      case "s": case "S": if (!cmd) savePNG(); break;
    }
  });

  // ---- Paste image ----

  async function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      showToast("Paste not supported here — use the menu");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        for (const type of it.types) {
          if (type.startsWith("image/")) {
            const blob = await it.getType(type);
            await stampBlobOnBitmap(blob);
            return;
          }
        }
      }
      showToast("No image in clipboard");
    } catch (e) {
      showToast("Clipboard read denied");
    }
  }
  async function stampBlobOnBitmap(blob) {
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) { showToast("Could not decode image"); return; }
    // Fit into bitmap with some padding.
    const maxW = BITMAP_W * 0.9;
    const maxH = BITMAP_H * 0.9;
    const sc   = Math.min(1, Math.min(maxW / bmp.width, maxH / bmp.height));
    const w = bmp.width * sc, h = bmp.height * sc;
    const x = (BITMAP_W - w) / 2;
    const y = (BITMAP_H - h) / 2;
    bctx.drawImage(bmp, x, y, w, h);
    pushHistory();
    render();
    showToast(`pasted ${Math.round(w)}×${Math.round(h)}`);
  }

  document.getElementById("paste-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) stampBlobOnBitmap(f);
    e.target.value = "";  // allow re-picking same file
  });
  window.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        const blob = it.getAsFile();
        if (blob) stampBlobOnBitmap(blob);
        return;
      }
    }
  });
  window.addEventListener("dragover", e => { e.preventDefault(); });
  window.addEventListener("drop", e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) stampBlobOnBitmap(f);
  });

  // ---- Save + Share ----

  function bitmapBlob() {
    return new Promise(resolve => bitmap.toBlob(resolve, "image/png"));
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  async function savePNG() {
    const blob = await bitmapBlob();
    if (!blob) { showToast("Save failed"); return; }
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadBlob(blob, `mino-paint-${ts}.png`);
    showToast("saved");
  }

  document.getElementById("share-btn").addEventListener("click", async () => {
    const orig = document.getElementById("share-btn").textContent;
    try {
      const blob = await bitmapBlob();
      if (!blob) throw new Error("encode failed");
      const filename = `mino-paint-${Date.now()}.png`;
      const text = "Made on mino.mobi/paint";
      const url  = "https://mino.mobi/paint";
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
      // Desktop fallback: open Bluesky compose intent + save the PNG.
      downloadBlob(blob, filename);
      const intent = `https://bsky.app/intent/compose?text=${encodeURIComponent(text + " " + url)}`;
      window.open(intent, "_blank", "noopener");
      showToast("opened Bluesky · attach the saved PNG");
    } catch (e) {
      console.error(e);
      showToast("share failed");
    }
  });

  // ---- Resize observer ----

  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(stage);
  window.addEventListener("resize", () => resize());
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  // ---- Boot ----

  function boot() {
    resize();
    fitView();
    setTool("brush");
    setColor("#000000");
    setSize(4);
    pushHistory();   // baseline (blank white) so undo can return to it
    render();
  }
  boot();
})();
