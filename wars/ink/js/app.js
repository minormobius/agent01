// app.js — wire the engine to the parchment UI.
//   • one canvas (parchment + multiplied ink), one "New Blot" button
//   • expandable attribute drawer (the stripped trait vector)
//   • deterministic permalinks: /ink/?b=<seed>  (Back/Forward replays blots)
(function () {
  const RES = 600;
  const canvas = document.getElementById("blot");
  const ctx = canvas.getContext("2d");
  canvas.width = RES; canvas.height = RES;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parchment = makeParchment(RES);

  const els = {
    seed: document.getElementById("seedlabel"),
    share: document.getElementById("share"),
    newBtn: document.getElementById("newblot"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    counter: document.getElementById("counter"),
    attrs: document.getElementById("attrs"),
    handle: document.getElementById("attrsHandle"),
    body: document.getElementById("attrsBody"),
    hint: document.getElementById("attrsHint"),
  };

  // session history of seeds — the full stack, walkable with Prev/Next.
  let stack = [], pos = -1, current = null;

  // ---- procedural parchment (cached; same paper every time, calm) ----
  function makeParchment(res) {
    const c = document.createElement("canvas");
    c.width = res; c.height = res;
    const x = c.getContext("2d");
    x.fillStyle = "#e9dab2";
    x.fillRect(0, 0, res, res);
    // grain
    const img = x.getImageData(0, 0, res, res), d = img.data;
    let s = 0x9e3779b9 >>> 0;
    const rnd = () => (((s = (Math.imul(s ^ (s >>> 15), 1 | s)) >>> 0)) / 4294967296);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 22;
      const warm = (rnd() - 0.5) * 6;
      d[i] = clampB(d[i] + n + warm);
      d[i + 1] = clampB(d[i + 1] + n);
      d[i + 2] = clampB(d[i + 2] + n - warm);
    }
    x.putImageData(img, 0, 0);
    // a few faint stains / fibres
    for (let k = 0; k < 26; k++) {
      const cx = rnd() * res, cy = rnd() * res, r = 20 + rnd() * 120;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = 0.015 + rnd() * 0.03;
      g.addColorStop(0, `rgba(120,92,48,${a})`);
      g.addColorStop(1, "rgba(120,92,48,0)");
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    // vignette
    const v = x.createRadialGradient(res / 2, res * 0.42, res * 0.2, res / 2, res / 2, res * 0.72);
    v.addColorStop(0, "rgba(90,64,30,0)");
    v.addColorStop(1, "rgba(90,64,30,0.16)");
    x.fillStyle = v; x.fillRect(0, 0, res, res);
    return c;
  }
  function clampB(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // ---- draw a generated blot ----
  function paint(res) {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, RES, RES);
    ctx.drawImage(parchment, 0, 0);
    if (res.canvas) {
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(res.canvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
    if (!reduceMotion) {
      canvas.classList.add("fade");
      requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.remove("fade")));
    }
  }

  // ---- render the attribute drawer ----
  function renderTraits(res) {
    const { traits } = res;
    const m = res.meta;
    let html = "";
    for (const t of traits) {
      const pct = Math.round(t.value * 100);
      html +=
        `<div class="trait">
           <div class="row"><span class="name">${t.label}</span><span class="val">${t.display}</span></div>
           <div class="bar"><i style="width:${pct}%"></i></div>
           <div class="poles"><span>${t.low}</span><span class="axis">${t.axis}</span><span>${t.high}</span></div>
         </div>`;
    }
    // the generative DNA
    const swatch = (c) => `<span class="sw" style="background:${c}"></span>`;
    const fams = m.layers
      .map((L) => `<span class="chip">${swatch(L.color)}${L.family}</span>`)
      .join("");
    html +=
      `<div class="dna">
         <div><b>generative dna</b></div>
         <div>seed <b>${m.seed}</b> · ${m.foldMode} fold · ${m.pigmentCount ? m.pigmentCount + " pigment" + (m.pigmentCount === 1 ? "" : "s") : "monochrome"} · ${m.ms}ms</div>
         <div style="margin-top:5px">${fams}</div>
       </div>`;
    els.body.innerHTML = html;

    // collapsed hint: family + coverage
    const lead = m.layers[m.layers.length - 1];
    els.hint.textContent = `${lead.family} · ${Math.round(res.raw.coverage * 100)}%`;
  }

  // ---- render one blot (pure; no stack changes) ----
  function render(seed) {
    const res = INKENGINE.generate(seed, { RES });
    current = { seed, res };
    paint(res);
    renderTraits(res);
    els.seed.textContent = "№ " + seed;
    history.replaceState({ seed }, "", location.pathname + "?b=" + encodeURIComponent(seed));
    updateNav();
  }

  // push a brand-new blot onto the stack (truncating any forward history)
  function pushNew(seed) {
    stack = stack.slice(0, pos + 1);
    stack.push(seed);
    pos = stack.length - 1;
    render(seed);
  }

  function updateNav() {
    els.prev.disabled = pos <= 0;
    els.next.disabled = pos >= stack.length - 1;
    els.counter.textContent = stack.length > 1 ? pos + 1 + " / " + stack.length : "";
  }

  // ---- events ----
  els.newBtn.addEventListener("click", () => pushNew(INKPRNG.freshSeed()));
  els.prev.addEventListener("click", () => { if (pos > 0) render(stack[--pos]); });
  els.next.addEventListener("click", () => { if (pos < stack.length - 1) render(stack[++pos]); });

  els.handle.addEventListener("click", () => {
    const open = els.attrs.getAttribute("aria-expanded") === "true";
    els.attrs.setAttribute("aria-expanded", open ? "false" : "true");
  });

  els.share.addEventListener("click", async () => {
    const link = location.href;
    try {
      if (navigator.share) await navigator.share({ title: "an inkblot", url: link });
      else { await navigator.clipboard.writeText(link); flash(els.share, "✓"); }
    } catch (e) { /* user cancelled */ }
  });
  function flash(el, txt) {
    const old = el.textContent; el.textContent = txt;
    setTimeout(() => (el.textContent = old), 900);
  }

  // keyboard: ← / → walk the stack, space = new blot
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") els.prev.click();
    else if (e.key === "ArrowRight") els.next.click();
    else if (e.key === " ") { e.preventDefault(); els.newBtn.click(); }
  });

  // ---- boot ----
  const initSeed = new URLSearchParams(location.search).get("b") || INKPRNG.freshSeed();
  pushNew(initSeed);
})();
