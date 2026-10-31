/* Samhain hub — the analysis section. Reads each tale's night.js
   (window.<TALE>.night) and draws the six instruments side by side. No data lives here: add a
   tale by giving it a night.js and adding it to TALES. */
(function () {
  "use strict";
  const TALES = [
    { key: "NERA", slug: "nera", short: "Nera" },
    { key: "THIDRANDI", slug: "thidrandi", short: "Þiðrandi" },
    { key: "MUIRCHERTACH", slug: "muirchertach", short: "Muirchertach" },
    { key: "REGAMNA", slug: "regamna", short: "Regamna" },
    { key: "SERGLIGE", slug: "serglige", short: "Serglige" },
    { key: "THOMAS", slug: "thomas", short: "Thomas" },
  ].filter((t) => window[t.key] && window[t.key].night).map((t) => Object.assign(t, { N: window[t.key].night }));

  // Validated (dataviz validator, dark surface, --pairs all): fatal / lost / stopped. Safe is neutral ink.
  const OUT = {
    fatal:   { color: "#d9533b", glyph: "✕", label: "fatal" },
    lost:    { color: "#8a72d8", glyph: "∞", label: "lost to the otherworld" },
    stopped: { color: "#1fa08a", glyph: "⊘", label: "stopped / undone" },
    safe:    { color: "#858091", glyph: "·", label: "nothing comes of it" },
  };
  const RINGS = ["hearth", "inside", "door", "field", "far"];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const svg = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a || {}) n.setAttribute(k, a[k]); return n; };

  /* ---------- 1 · the threshold map ---------- */
  function track(c) {
    const W = 250, H = 26, pad = 14, step = (W - pad * 2) / 4, x = (r) => pad + r * step, y = 13;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "trk", "aria-hidden": "true" });
    s.appendChild(svg("line", { x1: x(0), y1: y, x2: x(4), y2: y, class: "trk-base" }));
    for (let r = 0; r < 5; r++) s.appendChild(svg("circle", { cx: x(r), cy: y, r: r === 2 ? 4 : 2.5, class: r === 2 ? "trk-door" : "trk-tick" }));
    const col = OUT[c.outcome].color;
    if (c.from === c.to) {
      s.appendChild(svg("circle", { cx: x(c.from), cy: y, r: 6, fill: col, stroke: "var(--bg)", "stroke-width": 2 }));
    } else {
      const x1 = x(c.from), x2 = x(c.to), dir = Math.sign(x2 - x1);
      s.appendChild(svg("line", { x1, y1: y, x2: x2 - dir * 6, y2: y, stroke: col, "stroke-width": 3, "stroke-linecap": "round" }));
      // deferred: safe tonight, fatal later — a hollow arrowhead in the fatal colour
      if (c.deferred) s.appendChild(svg("path", { d: `M ${x2} ${y} L ${x2 - dir * 9} ${y - 6} L ${x2 - dir * 9} ${y + 6} Z`, fill: "var(--bg)", stroke: OUT.fatal.color, "stroke-width": 2, "stroke-linejoin": "round" }));
      else s.appendChild(svg("path", { d: `M ${x2} ${y} L ${x2 - dir * 9} ${y - 6} L ${x2 - dir * 9} ${y + 6} Z`, fill: col }));
      if (c.back) s.appendChild(svg("path", { d: `M ${x2 - dir * 2} ${y + 8} Q ${(x1 + x2) / 2} ${y + 14} ${x1} ${y + 8}`, fill: "none", stroke: col, "stroke-width": 1.5, "stroke-dasharray": "3 3" }));
    }
    return s;
  }
  function direction(c) { return c.from === c.to ? "stays" : c.to > c.from ? "outward" : "inward"; }

  function renderThreshold() {
    const host = $("an-threshold"); if (!host) return;
    const leg = $("an-threshold-legend");
    leg.innerHTML = Object.keys(OUT).map((k) => `<span class="li"><span class="sw" style="background:${OUT[k].color}"></span>${OUT[k].glyph} ${OUT[k].label}</span>`).join("") +
      `<span class="li"><span class="sw-hollow"></span><span style="color:${OUT.fatal.color}">⌛</span> safe tonight, fatal later</span>` +
      `<span class="li"><span class="sw-dash"></span>there and back</span>`;
    host.innerHTML = "";
    TALES.forEach((t) => {
      const col = document.createElement("div"); col.className = "lane";
      col.innerHTML = `<div class="lane-head"><a href="/${t.slug}/">${esc(t.N.title)}</a><span>${t.N.festival ? esc(t.N.festival.name) : "no festival — " + esc(t.N.night || "night")}</span></div>` +
        `<div class="lane-axis">${RINGS.map((r, i) => `<span title="${esc(t.N.places[i])}">${r}</span>`).join("")}</div>`;
      t.N.crossings.forEach((c) => {
        const row = document.createElement("div"); row.className = "xrow o-" + c.outcome;
        row.title = `${c.who} — ${c.label}\n${t.N.places[c.from]} → ${t.N.places[c.to]} · ${OUT[c.outcome].label}${c.deferred ? " tonight; fatal later" : ""} · movement ${c.passage}`;
        row.appendChild(track(c));
        const txt = document.createElement("div"); txt.className = "xtxt";
        txt.innerHTML = `<b>${esc(c.who)}</b> <span class="xg" style="color:${OUT[c.outcome].color}">${OUT[c.outcome].glyph}</span>${c.deferred ? `<span class="xg" style="color:${OUT.fatal.color}" title="safe tonight, fatal later">⌛</span>` : ""} ${esc(c.label)}`;
        row.appendChild(txt); col.appendChild(row);
      });
      host.appendChild(col);
    });

    // computed summary: which way do the fatal crossings go?
    const rows = TALES.map((t) => {
      const f = t.N.crossings.filter((c) => c.outcome === "fatal");
      const out = f.filter((c) => direction(c) === "outward").length, inn = f.filter((c) => direction(c) === "inward").length;
      const lost = t.N.crossings.filter((c) => c.outcome === "lost").length;
      const later = t.N.crossings.filter((c) => c.deferred).length;
      const door = t.N.crossings.filter((c) => Math.min(c.from, c.to) <= 2 && Math.max(c.from, c.to) >= 2 && c.from !== c.to).length;
      return `<tr><th>${esc(t.short)}</th><td>${t.N.crossings.length}</td><td>${door}</td><td>${out}</td><td>${inn}</td><td>${later}</td><td>${lost}</td></tr>`;
    }).join("");
    $("an-threshold-table").innerHTML = `<table><thead><tr><th></th><th>crossings</th><th>through the door</th><th>fatal, going out</th><th>fatal, coming in</th><th>fatal later ⌛</th><th>lost for good</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------- 2 · the rules ---------- */
  function renderRules() {
    const host = $("an-rules"); if (!host) return;
    const body = TALES.map((t) => t.N.rules.map((r, i) => `<tr>${i === 0 ? `<th rowspan="${t.N.rules.length}">${esc(t.short)}</th>` : ""}<td>${esc(r.rule)}</td><td><span class="giver g-${r.giver.replace(/\s/g, "")}">${esc(r.giver)}</span></td><td>${esc(r.kind)}</td><td>${esc(r.brokenBy)}${r.why ? `<div class="why">${esc(r.why)}</div>` : ""}</td><td>${esc(r.cost)}</td></tr>`).join("")).join("");
    host.innerHTML = `<table><thead><tr><th></th><th>The rule</th><th>Given by</th><th>Governs</th><th>Broken by — why</th><th>Cost</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  /* ---------- 3 · dread devices ---------- */
  const DEVICES = [
    ["count", "Counting", "a number reached before the uncanny breaks through"],
    ["withhold", "Withholding", "what is not shown, said, or turned towards"],
    ["silence", "Silence", "a flat telling, or someone falling quiet"],
    ["foreknow", "Foreknowledge", "the end is told, and comes anyway"],
    ["surprise", "Surprise", "the impossible, unremarked"],
    ["explain", "The reasonable explanation", "the victim's own sensible account"],
    ["repeat", "Repetition", "it happens again, and again"],
    ["invert", "Inversion", "summer in winter, the weather as a name, an impossible body"],
    ["vanish", "Vanishing", "it is gone the moment it is reached for"],
  ];
  function renderDread() {
    const host = $("an-dread"); if (!host) return;
    const head = `<thead><tr><th>Device</th>${TALES.map((t) => `<th>${esc(t.short)}</th>`).join("")}<th>shared by</th></tr></thead>`;
    const body = DEVICES.map(([k, name, gloss]) => {
      let n = 0;
      const cells = TALES.map((t) => {
        const hits = t.N.dread.filter((d) => d.device === k);
        if (hits.length) n++;
        return `<td>${hits.map((h) => `<div class="dq"><span class="dot"></span>${esc(h.text)}</div>`).join("") || `<span class="none">—</span>`}</td>`;
      }).join("");
      return `<tr><th>${esc(name)}<div class="why">${esc(gloss)}</div></th>${cells}<td class="n">${n} of ${TALES.length}</td></tr>`;
    }).join("");
    host.innerHTML = `<table class="dread">${head}<tbody>${body}</tbody></table>`;
  }

  /* ---------- 4 · two readings ---------- */
  function renderReadings() {
    const host = $("an-readings"); if (!host) return;
    const body = TALES.map((t) => t.N.readings.map((r, i) => `<tr>${i === 0 ? `<th rowspan="${t.N.readings.length}">${esc(t.short)}</th>` : ""}<td>${esc(r.what)}</td><td>${esc(r.older)}</td><td>${esc(r.newer)}</td></tr>`).join("")).join("");
    host.innerHTML = `<table><thead><tr><th></th><th>What</th><th>The older reading the story carries</th><th>The reading laid over it</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  /* ---------- 6 · names ---------- */
  const KINDS = {
    withheld: "never named", weather: "named as weather", mockery: "named in mockery", false: "a false name",
    forbidden: "a name that must not be spoken", late: "named only at the end", decoy: "a name that misleads",
    given: "named freely, with a father",
  };
  function renderNames() {
    const host = $("an-names"); if (!host) return;
    const kinds = Object.keys(KINDS);
    const head = `<thead><tr><th>How the otherworld is named</th>${TALES.map((t) => `<th>${esc(t.short)}</th>`).join("")}</tr></thead>`;
    const body = kinds.map((k) => {
      const cells = TALES.map((t) => {
        const hits = (t.N.names || []).filter((n) => n.kind === k);
        return `<td>${hits.map((h) => `<div class="dq"><span class="dot"></span><span><b>${esc(h.who)}</b>${h.name && h.name !== "—" && h.name !== "(any of them)" ? `: <i>${esc(h.name)}</i>` : ""} — ${esc(h.gloss)}</span></div>`).join("") || `<span class="none">—</span>`}</td>`;
      }).join("");
      return `<tr><th>${esc(KINDS[k])}</th>${cells}</tr>`;
    }).join("");
    host.innerHTML = `<table class="dread">${head}<tbody>${body}</tbody></table>`;
  }

  /* ---------- 5 · truth claims ---------- */
  function renderTruth() {
    const host = $("an-truth"); if (!host) return;
    host.innerHTML = TALES.map((t) => `<div class="tcard"><div class="tmode">${esc(t.N.truth.mode)}</div><h4>${esc(t.N.title)}</h4><p><b>Vouched for by:</b> ${esc(t.N.truth.vouch)}</p><p class="small">${esc(t.N.truth.note)}</p></div>`).join("");
  }

  renderThreshold(); renderRules(); renderDread(); renderReadings(); renderTruth(); renderNames();
})();
