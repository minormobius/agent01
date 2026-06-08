// cable/solver.js — the progressive constraint solver.
//
// A cable drawing is the answer to seven coupled questions (component → connector
// → pin set → cable → pin → connector → board). They are coupled because a choice
// at one layer constrains its neighbours: the component fixes how many signals
// must flow and how much current the heaviest one draws; that current and the two
// connectors' contact families together fix the wire gauge; the gauge feeds back
// into both pin sets and the cable construction; the board fixes the board-side
// connector. solve() walks the stack, propagating those constraints, and returns
// the resolved stack plus a wire list, BOM, and the warnings it raised on the way.
//
// Pure and deterministic: same catalog + inputs → same solution. Attaches to
// globalThis.CABLE_SOLVER so it runs in the browser and under node (see README).

(function (root) {
  "use strict";

  const WIRE_COLORS = [
    "#d11", "#111", "#27c", "#2a7", "#fb0", "#f80", "#849",
    "#0aa", "#a52", "#888", "#e3a", "#5b2", "#06f", "#c0c",
  ];

  function fmtAwg(g) { return g == null ? "—" : "AWG " + g; }

  // Pick the smallest position count in a family that houses `need` conductors.
  function fitFamily(fam, need) {
    if (!fam) return null;
    const pos = fam.positions.find((p) => p >= need);
    return pos == null ? null : { family: fam, positions: pos, spare: pos - need };
  }

  // Choose a wire gauge that BOTH contacts can crimp and that carries `amps`.
  // Contact windows are AWG-number ranges [gaugeHeavy .. gaugeFine] (heavy = lower
  // number = thicker copper). We intersect the two windows, then pick the finest
  // (highest AWG number) wire in the overlap whose ampacity still clears the
  // current with margin — minimum copper that does the job.
  function pickGauge(C, amps, contactA, contactB, override) {
    const heavy = Math.max(contactA.gaugeHeavy, contactB.gaugeHeavy); // thickest common
    const fine = Math.min(contactA.gaugeFine, contactB.gaugeFine);    // thinnest common
    const warn = [];
    if (heavy > fine) {
      warn.push(`Contact families don't overlap on gauge: ${contactA.name} crimps AWG ${contactA.gaugeHeavy}–${contactA.gaugeFine}, ${contactB.name} crimps AWG ${contactB.gaugeHeavy}–${contactB.gaugeFine}. Pick a different connector at one end.`);
      return { gauge: heavy, heavy, fine, warn, underRated: true };
    }
    const window = C.AWG_ORDER.filter((g) => g >= heavy && g <= fine); // fine→heavy
    const margin = 1.5;
    let gauge = null;
    for (const g of window) { if (C.AWG[g].amps >= amps * margin) gauge = g; }
    // window is finest→heaviest; the last match is the heaviest meeting wire, but we
    // want the FINEST meeting wire → take the first match instead.
    gauge = window.find((g) => C.AWG[g].amps >= amps * margin) ?? null;
    let underRated = false;
    if (gauge == null) {
      gauge = heavy; // heaviest available in the overlap
      underRated = C.AWG[gauge].amps < amps;
      warn.push(`No wire in the common gauge window (AWG ${heavy}–${fine}) carries ${amps} A with 1.5× margin; using the heaviest available, ${fmtAwg(heavy)} (${C.AWG[heavy].amps} A chassis). Consider a higher-current connector.`);
    }
    if (override != null) {
      if (override < heavy || override > fine) {
        warn.push(`Requested ${fmtAwg(override)} is outside the contacts' common window (AWG ${heavy}–${fine}); keeping ${fmtAwg(gauge)}.`);
      } else if (C.AWG[override].amps < amps) {
        warn.push(`Requested ${fmtAwg(override)} carries ${C.AWG[override].amps} A < the ${amps} A draw; keeping ${fmtAwg(gauge)}.`);
      } else {
        gauge = override;
      }
    }
    return { gauge, heavy, fine, warn, underRated };
  }

  function solve(C, input) {
    const warnings = [];
    const comp = C.components[input.componentId];
    if (!comp) throw new Error("unknown component: " + input.componentId);
    const lengthM = Number(input.lengthM) > 0 ? Number(input.lengthM) : 2;
    const flex = C.STRANDING[input.flex] ? input.flex : "flexible";
    const env = input.env || comp.env || "industrial";

    // ── conductors, pairs, current, shield ─────────────────────────────────────
    const lines = comp.lines;
    const conductors = lines.length;
    const maxCurrent = lines.reduce((m, l) => Math.max(m, l.current || 0), 0);
    const pairGroups = {};
    for (const l of lines) if (l.pair) (pairGroups[l.pair] ||= []).push(l.name);
    const pairs = Object.entries(pairGroups).map(([id, names]) => ({ id, names }));
    const shielded =
      comp.shield === "required" ||
      env === "outdoor" ||
      ((comp.shield === "recommended") && env !== "benign");
    const shieldKind = !shielded ? null
      : (comp.shield === "required" || env === "outdoor")
        ? "Overall braid (≥85%) + foil + drain wire"
        : "Overall foil + drain wire";

    // ── component-side connector ────────────────────────────────────────────────
    const compFamList = comp.connectors.map((id) => C.connectors[id]).filter(Boolean);
    const compFits = compFamList.map((f) => fitFamily(f, conductors)).filter(Boolean);
    if (!compFits.length) throw new Error("no component connector houses " + conductors + " conductors");
    let compPick = compFits[0];
    if (input.componentConnectorId) {
      const hit = compFits.find((f) => f.family.id === input.componentConnectorId);
      if (hit) compPick = hit; else warnings.push(`Component connector ${input.componentConnectorId} can't house ${conductors} conductors; kept ${compPick.family.name}.`);
    }
    const compConn = compPick.family;
    const compContact = C.contacts[compConn.contact];

    // ── board + board-side connector ────────────────────────────────────────────
    const board = C.boards[input.boardId] || C.boards.generic;
    let boardFamId = board.header || input.boardHeaderOverride || "kk254";
    let boardConn = C.connectors[boardFamId];
    let boardPick = fitFamily(boardConn, conductors);
    if (!boardPick) {
      // chosen board header can't house the conductor count → find a board-capable
      // family that can, and say so.
      const fallback = Object.values(C.connectors)
        .filter((f) => (f.side === "board" || f.side === "both"))
        .map((f) => fitFamily(f, conductors)).filter(Boolean)[0];
      if (!fallback) throw new Error("no board connector houses " + conductors + " conductors");
      warnings.push(`${boardConn ? boardConn.name : boardFamId} maxes out below ${conductors} conductors; using ${fallback.family.name} at the board.`);
      boardPick = fallback; boardConn = fallback.family; boardFamId = boardConn.id;
    }
    const boardContact = C.contacts[boardConn.contact];

    // ── wire gauge (couples both contacts + current) ────────────────────────────
    const g = pickGauge(C, maxCurrent, compContact, boardContact, input.gaugeOverride != null ? Number(input.gaugeOverride) : null);
    g.warn.forEach((w) => warnings.push(w));
    const gauge = g.gauge;
    if (compContact.amps < maxCurrent) warnings.push(`${compContact.name} is rated ${compContact.amps} A < the ${maxCurrent} A draw.`);
    if (boardContact.amps < maxCurrent) warnings.push(`${boardContact.name} is rated ${boardContact.amps} A < the ${maxCurrent} A draw.`);

    // ── cable construction ──────────────────────────────────────────────────────
    const strand = C.STRANDING[flex];
    const twist = pairs.length ? C.TWIST[comp.rate] || C.TWIST.low : C.TWIST.none;
    // worst-case round-trip voltage drop on the heaviest power line
    const powerLine = lines.filter((l) => l.type === "power").sort((a, b) => b.current - a.current)[0];
    let vdrop = null;
    if (powerLine && gauge != null) {
      const ohm = C.AWG[gauge].ohmPerM;
      vdrop = { line: powerLine.name, current: powerLine.current, volts: +(powerLine.current * 2 * lengthM * ohm).toFixed(3) };
      if (vdrop.volts > 1) warnings.push(`Round-trip drop on ${powerLine.name} is ≈${vdrop.volts} V over ${lengthM} m at ${fmtAwg(gauge)}; bump the gauge or shorten the run if the load is voltage-sensitive.`);
    }

    // ── wire list + pinout (per conductor, end-to-end) ──────────────────────────
    // Each signal lands on a pin at each connector. Default is sequential (signal
    // i → pin i+1), but the setup can override the function of any pin via
    // input.pinmap = { "<signal>": { comp: <pin#>, board: <pin#> } }. We clamp to
    // the connector's position count and flag double-booked pins.
    const pinmap = input.pinmap || {};
    const pinFor = (name, end, idx, max) => {
      const v = pinmap[name] && Number(pinmap[name][end]);
      return Number.isInteger(v) && v >= 1 && v <= max ? v : idx + 1;
    };
    const wireList = lines.map((l, i) => {
      const compPin = pinFor(l.name, "comp", i, compPick.positions);
      const boardPin = pinFor(l.name, "board", i, boardPick.positions);
      return {
        n: i + 1,
        signal: l.name,
        type: l.type,
        color: WIRE_COLORS[i % WIRE_COLORS.length],
        pair: l.pair || "",
        gauge: fmtAwg(gauge),
        compPin, boardPin,
        endA: `${compConn.name} pin ${compPin}`,
        endB: `${boardConn.name} pin ${boardPin}`,
      };
    });
    // double-booked-pin check at each end
    for (const [end, label, conn] of [["compPin", compConn.name, compPick], ["boardPin", boardConn.name, boardPick]]) {
      const used = {};
      wireList.forEach((w) => { (used[w[end]] ||= []).push(w.signal); });
      Object.entries(used).filter(([, sigs]) => sigs.length > 1)
        .forEach(([pin, sigs]) => warnings.push(`${label} pin ${pin} is assigned to more than one signal (${sigs.join(", ")}). Fix the pinout in the setup.`));
    }
    if (shielded) wireList.push({ n: "S", signal: "DRAIN", type: "shield", color: "#aaa", pair: "", gauge: "drain", endA: `${compConn.name} backshell / shell`, endB: "chassis / 0 V star point" });

    // ── the seven-layer stack (presented component → board) ──────────────────────
    const stack = [
      {
        n: 1, key: "component", title: "Component", name: comp.name,
        fields: [
          ["Domain", comp.domain],
          ["Signals", `${conductors} (${lines.map((l) => l.name).join(", ")})`],
          ["Pairs", pairs.length ? pairs.map((p) => `${p.id} (${p.names.join("/")})`).join(", ") : "none"],
          ["Heaviest line", powerLine ? `${powerLine.name} @ ${powerLine.current} A` : `${maxCurrent} A`],
          ["Shielding", comp.shield],
        ],
        rationale: `The component sets the whole stack: ${conductors} signal lines to carry, a worst-case ${maxCurrent} A, ${pairs.length} differential pair(s), and a ${comp.shield} shield.`,
      },
      {
        n: 2, key: "conn_comp", title: "Connector — component side", name: `${compConn.name}, ${compPick.positions}-position`,
        fields: [
          ["Family", compConn.name],
          ["Positions", `${compPick.positions} (${compPick.spare} spare)`],
          ["Sealing", compConn.ip],
          ["Locking", compConn.lock],
          ["Mates with", "the component's fixed interface"],
        ],
        rationale: `Smallest ${compConn.name} that houses ${conductors} conductors. ${compConn.ip !== "—" ? compConn.ip + " sealing suits the " + env + " environment." : "Unsealed — fine indoors; add a backshell/boot for industrial."}`,
        alts: compFits.filter((f) => f.family.id !== compConn.id).map((f) => `${f.family.name} (${f.positions}p)`),
      },
      {
        n: 3, key: "pin_comp", title: "Pin set — component side", name: `${conductors}× ${compContact.name}`,
        fields: [
          ["Contact", compContact.name],
          ["Quantity", `${conductors}${shielded ? " + drain to shell" : ""}`],
          ["Gauge window", `AWG ${compContact.gaugeHeavy}–${compContact.gaugeFine}`],
          ["Per-contact rating", `${compContact.amps} A`],
          ["Termination", compContact.term],
          ["Crimp tool", C.crimpTools[compContact.tool].name],
        ],
        rationale: `${compConn.name} takes ${compContact.name}. Crimp ${conductors} onto ${fmtAwg(gauge)} with the ${C.crimpTools[compContact.tool].name}${C.crimpTools[compContact.tool].die ? " (" + C.crimpTools[compContact.tool].die + ")" : ""}.`,
      },
      {
        n: 4, key: "cable", title: "Cable", name: `${conductors}-conductor ${fmtAwg(gauge)}${shielded ? ", shielded" : ""}${pairs.length ? `, ${pairs.length}× twisted pair` : ""}`,
        fields: [
          ["Conductors", `${conductors}${shielded ? " + drain" : ""}`],
          ["Gauge / conductor", `${fmtAwg(gauge)} (${gauge != null ? C.AWG[gauge].mm2 + " mm², " + C.AWG[gauge].amps + " A chassis" : "—"})`],
          ["Stranding", `${strand.cls} — ${strand.note}`],
          ["Twist", twist ? `${pairs.map((p) => p.id).join(", ")} as ${twist.label}` : "none (no pairs)"],
          ["Shield", shieldKind || "none"],
          ["Final length", `${lengthM} m`],
          ["Voltage drop", vdrop ? `≈${vdrop.volts} V round-trip on ${vdrop.line}` : "negligible (signal-level)"],
        ],
        rationale: `${conductors} conductors at ${fmtAwg(gauge)} — the finest wire both contact families crimp that carries ${maxCurrent} A with margin. ${strand.cls} for ${flex} routing.${pairs.length ? ` Pairs ${pairs.map((p) => p.id).join("/")} twisted ${twist.label} for the ${twist.band}.` : ""}${shielded ? ` ${shieldKind}, drain grounded at the board end only.` : ""}`,
      },
      {
        n: 5, key: "pin_board", title: "Pin — board side", name: `${conductors}× ${boardContact.name}`,
        fields: [
          ["Contact", boardContact.name],
          ["Quantity", `${conductors}${shielded ? " + drain" : ""}`],
          ["Gauge window", `AWG ${boardContact.gaugeHeavy}–${boardContact.gaugeFine}`],
          ["Per-contact rating", `${boardContact.amps} A`],
          ["Termination", boardContact.term],
          ["Crimp tool", C.crimpTools[boardContact.tool].name],
        ],
        rationale: `${boardConn.name} takes ${boardContact.name}. Same ${fmtAwg(gauge)} conductor lands here, so the gauge had to fall inside both this contact's window and the component side's.`,
      },
      {
        n: 6, key: "conn_board", title: "Connector — board side", name: `${boardConn.name}, ${boardPick.positions}-position`,
        fields: [
          ["Family", boardConn.name],
          ["Positions", `${boardPick.positions} (${boardPick.spare} spare)`],
          ["Locking", boardConn.lock],
          ["Mates with", `the ${board.name}'s header`],
        ],
        rationale: `The ${board.name} presents a ${boardConn.name} header, so the cable terminates in its mating half.`,
        alts: board.header ? [] : Object.values(C.connectors).filter((f) => (f.side === "board" || f.side === "both") && f.id !== boardConn.id && f.positions.some((p) => p >= conductors)).map((f) => f.name),
      },
      {
        n: 7, key: "board", title: "Board", name: board.name,
        fields: [
          ["Board", board.name],
          ["Domain", board.domain],
          ["Header", boardConn.name],
          ["Shield termination", shielded ? "drain to board 0 V / chassis star point" : "n/a"],
        ],
        rationale: `${board.name}${board.note ? " — " + board.note : ""}. This is the fixed end of the run; everything upstream was sized to land cleanly on its ${boardConn.name}.`,
      },
    ];

    // ── BOM ──────────────────────────────────────────────────────────────────────
    const bom = [
      { item: "Component connector", part: `${compConn.name}, ${compPick.positions}-pos`, qty: 1 },
      { item: "Component contacts", part: compContact.name, qty: conductors + (shielded ? 1 : 0) },
      { item: "Crimp tool (comp)", part: C.crimpTools[compContact.tool].name, qty: 1 },
      { item: "Cable", part: `${conductors}C ${fmtAwg(gauge)} ${strand.cls}${shielded ? " shielded" : ""}${pairs.length ? ` (${pairs.length} TP)` : ""}`, qty: `${lengthM} m` },
      { item: "Board contacts", part: boardContact.name, qty: conductors + (shielded ? 1 : 0) },
      { item: "Crimp tool (board)", part: C.crimpTools[boardContact.tool].name, qty: 1 },
      { item: "Board connector", part: `${boardConn.name}, ${boardPick.positions}-pos`, qty: 1 },
    ];

    return {
      input: { componentId: comp.id, boardId: board.id, lengthM, flex, env, gauge },
      summary: { conductors, gauge, gaugeLabel: fmtAwg(gauge), maxCurrent, pairs, shielded, shieldKind, lengthM, twist, strand, vdrop },
      stack, wireList, bom, warnings,
      ends: { comp: { conn: compConn, positions: compPick.positions, contact: compContact }, board: { conn: boardConn, positions: boardPick.positions, contact: boardContact, board } },
    };
  }

  root.CABLE_SOLVER = { solve, pickGauge, fitFamily };
})(typeof globalThis !== "undefined" ? globalThis : this);
