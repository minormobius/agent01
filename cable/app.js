// cable/app.js — wires the controls to the solver and paints the result.
// Pure client side: edit a control → re-solve → re-render the stack, drawing,
// wire list, BOM and warnings. No build step, no network.

(function () {
  "use strict";
  const C = globalThis.CABLE_CATALOG;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ── populate the controls from the catalog ───────────────────────────────────
  function opt(sel, value, label) { const o = document.createElement("option"); o.value = value; o.textContent = label; sel.appendChild(o); }

  function fillControls() {
    const comp = $("f-component");
    Object.values(C.components).forEach((c) => opt(comp, c.id, `${c.name} — ${c.domain}`));
    const board = $("f-board");
    Object.values(C.boards).forEach((b) => opt(board, b.id, b.name));
    const gauge = $("f-gauge");
    opt(gauge, "", "auto (solver picks)");
    C.AWG_ORDER.forEach((g) => opt(gauge, g, `AWG ${g} — ${C.AWG[g].amps} A`));
    refreshComponentConnectors();
    refreshBoardHeader();
  }

  // component-connector choices depend on the chosen component
  function refreshComponentConnectors() {
    const sel = $("f-conn"); sel.innerHTML = "";
    opt(sel, "", "auto (best fit)");
    const comp = C.components[$("f-component").value];
    if (comp) comp.connectors.forEach((id) => { const f = C.connectors[id]; if (f) opt(sel, id, `${f.name} (${f.ip})`); });
  }

  // board-header picker only matters for the generic board
  function refreshBoardHeader() {
    const wrap = $("row-header"), sel = $("f-header");
    const generic = $("f-board").value === "generic";
    wrap.style.display = generic ? "" : "none";
    if (generic && !sel.options.length) {
      opt(sel, "kk254", "—");
      sel.innerHTML = "";
      Object.values(C.connectors).filter((f) => f.side === "board" || f.side === "both")
        .forEach((f) => opt(sel, f.id, f.name));
    }
  }

  function readInput() {
    return {
      componentId: $("f-component").value,
      boardId: $("f-board").value,
      boardHeaderOverride: $("f-header").value || undefined,
      componentConnectorId: $("f-conn").value || undefined,
      lengthM: $("f-length").value,
      flex: $("f-flex").value,
      env: $("f-env").value,
      gaugeOverride: $("f-gauge").value || undefined,
    };
  }

  let lastSolution = null;

  function render() {
    const input = readInput();
    let sol;
    try { sol = globalThis.CABLE_SOLVER.solve(C, input); }
    catch (e) { $("stack").innerHTML = `<div class="warn">${e.message}</div>`; return; }
    lastSolution = sol;

    // 7-layer stack
    const st = $("stack"); st.innerHTML = "";
    sol.stack.forEach((layer) => {
      const card = el("div", "layer");
      card.appendChild(el("div", "layer-n", String(layer.n)));
      const bodyc = el("div", "layer-body");
      bodyc.appendChild(el("div", "layer-title", `${layer.title}`));
      bodyc.appendChild(el("div", "layer-name", layer.name));
      const tbl = el("table", "kv");
      layer.fields.forEach(([k, v]) => {
        const tr = el("tr");
        tr.appendChild(el("th", null, k));
        tr.appendChild(el("td", null, v));
        tbl.appendChild(tr);
      });
      bodyc.appendChild(tbl);
      bodyc.appendChild(el("div", "rationale", layer.rationale));
      if (layer.alts && layer.alts.length) bodyc.appendChild(el("div", "alts", "Also fits: " + layer.alts.join(" · ")));
      card.appendChild(bodyc);
      st.appendChild(card);
    });

    // drawing
    $("drawing").innerHTML = globalThis.CABLE_DRAW.render(sol);

    // summary chips
    const sum = $("summary"); sum.innerHTML = "";
    const chips = [
      `${sol.summary.conductors} conductors`,
      sol.summary.gaugeLabel,
      sol.summary.strand.cls,
      sol.summary.shielded ? "shielded" : "unshielded",
      sol.summary.pairs.length ? `${sol.summary.pairs.length}× twisted pair` : "no pairs",
      `${sol.summary.lengthM} m`,
      `${sol.summary.maxCurrent} A max`,
    ];
    chips.forEach((c) => sum.appendChild(el("span", "chip", c)));

    // wire list
    const wl = $("wirelist"); wl.innerHTML = "";
    const whead = el("tr", null, "<th>#</th><th>Signal</th><th>Type</th><th>Pair</th><th>Gauge</th><th>End A (component)</th><th>End B (board)</th>");
    wl.appendChild(whead);
    sol.wireList.forEach((w) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, `<span class="dot" style="background:${w.color}"></span>${w.n}`));
      tr.appendChild(el("td", null, w.signal));
      tr.appendChild(el("td", null, w.type));
      tr.appendChild(el("td", null, w.pair || "—"));
      tr.appendChild(el("td", null, w.gauge));
      tr.appendChild(el("td", null, w.endA));
      tr.appendChild(el("td", null, w.endB));
      wl.appendChild(tr);
    });

    // BOM
    const bom = $("bom"); bom.innerHTML = "";
    bom.appendChild(el("tr", null, "<th>Item</th><th>Part / spec</th><th>Qty</th>"));
    sol.bom.forEach((b) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, b.item));
      tr.appendChild(el("td", null, b.part));
      tr.appendChild(el("td", null, String(b.qty)));
      bom.appendChild(tr);
    });

    // warnings
    const warn = $("warnings");
    if (sol.warnings.length) {
      warn.innerHTML = "";
      sol.warnings.forEach((w) => warn.appendChild(el("div", "warn", "⚠ " + w)));
      warn.style.display = "";
    } else {
      warn.innerHTML = `<div class="ok">✓ No constraint conflicts — the stack resolves cleanly.</div>`;
      warn.style.display = "";
    }
  }

  // ── tabs ──────────────────────────────────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $(t.dataset.panel).classList.add("active");
    }));
  }

  // ── exports ─────────────────────────────────────────────────────────────────
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function initExports() {
    $("dl-json").addEventListener("click", () => {
      if (!lastSolution) return;
      download(`cable-${lastSolution.input.componentId}-${lastSolution.input.boardId}.json`,
        new Blob([JSON.stringify(lastSolution, null, 2)], { type: "application/json" }));
    });
    $("dl-svg").addEventListener("click", () => {
      if (!lastSolution) return;
      download(`cable-${lastSolution.input.componentId}-${lastSolution.input.boardId}.svg`,
        globalThis.CABLE_DRAW.svgBlob(globalThis.CABLE_DRAW.render(lastSolution)));
    });
    $("dl-print").addEventListener("click", () => window.print());
  }

  function init() {
    fillControls();
    ["f-component", "f-board", "f-conn", "f-header", "f-length", "f-flex", "f-env", "f-gauge"]
      .forEach((id) => $(id).addEventListener("change", () => {
        if (id === "f-component") refreshComponentConnectors();
        if (id === "f-board") refreshBoardHeader();
        render();
      }));
    $("f-length").addEventListener("input", render);
    initTabs(); initExports(); render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
