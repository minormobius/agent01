// quiz.js — the projection interaction.
//
// Under the blot, two 2-D pads (four perceptual axes). The player places a dot
// on each pad to say what the blot FEELS like — they think they're describing
// the ink. The four axes secretly map to the archetypes (judge.js):
//   Cool–Warm → temperament   Atom–Mesh → bond
//   In–Out    → scope         Up/Down   → gravity
// When both dots land we reveal the blot's measured position and the four
// signed deltas (player − ink): their projection, in the open.
(function (g) {
  // pad x/y axes. y is drawn with `hi` at the TOP. word = how a positive delta
  // (player placed past the ink toward `hi`) reads in the summary.
  const PADS = [
    {
      x: { key: "temperament", lo: "Cool", hi: "Warm", hiWord: "warmer", loWord: "cooler" },
      y: { key: "bond", lo: "Atom", hi: "Mesh", hiWord: "more connected", loWord: "more solitary" },
    },
    {
      x: { key: "scope", lo: "In", hi: "Out", hiWord: "more expansive", loWord: "more focused" },
      y: { key: "gravity", lo: "Down", hi: "Up", hiWord: "lighter", loWord: "more grounded" },
    },
  ];

  function mount(host, opts) {
    opts = opts || {};
    host.innerHTML =
      `<div class="qprompt">Where does it sit? Tap each square.</div><div class="pads"></div>` +
      `<div class="verdict" hidden></div>`;
    const padsWrap = host.querySelector(".pads");
    const verdict = host.querySelector(".verdict");
    const padEls = [];

    PADS.forEach((cfg) => {
      const pad = document.createElement("div");
      pad.className = "pad";
      pad.innerHTML =
        `<span class="lbl top">${cfg.y.hi}</span><span class="lbl bot">${cfg.y.lo}</span>` +
        `<span class="lbl lft">${cfg.x.lo}</span><span class="lbl rgt">${cfg.x.hi}</span>` +
        `<span class="ch"></span><span class="cv"></span>` +
        `<span class="dot truth" hidden></span><span class="dot you" hidden></span>`;
      padsWrap.appendChild(pad);
      padEls.push(pad);
    });

    let measured = null, placed = [null, null], revealed = false;

    function setBlot(scores) {
      measured = scores; placed = [null, null]; revealed = false;
      verdict.hidden = true; verdict.innerHTML = "";
      padEls.forEach((p) => {
        p.classList.remove("done");
        p.querySelector(".you").hidden = true;
        p.querySelector(".truth").hidden = true;
      });
    }

    padEls.forEach((pad, i) => {
      const place = (ev) => {
        if (revealed || !measured) return;
        const r = pad.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        const y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
        placed[i] = { x, y };
        const you = pad.querySelector(".you");
        you.hidden = false; you.style.left = x * 100 + "%"; you.style.top = y * 100 + "%";
        if (placed[0] && placed[1]) reveal();
      };
      pad.addEventListener("pointerdown", (e) => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (_) {} place(e); });
      pad.addEventListener("pointermove", (e) => { if (e.buttons) place(e); });
    });

    function reveal() {
      revealed = true;
      const deltas = [];
      PADS.forEach((cfg, i) => {
        const p = placed[i];
        const userX = p.x, userY = 1 - p.y;            // archetype orientation (hi at top)
        const mx = measured[cfg.x.key], my = measured[cfg.y.key];
        const t = padEls[i].querySelector(".truth");
        t.hidden = false; t.style.left = mx * 100 + "%"; t.style.top = (1 - my) * 100 + "%";
        padEls[i].classList.add("done");
        deltas.push(mkDelta(cfg.x, userX, mx));
        deltas.push(mkDelta(cfg.y, userY, my));
      });
      const portrait = g.INKJUDGE.portrait(measured);
      verdict.innerHTML =
        `<div class="vlegend"><span class="dot you mini"></span> you &nbsp; <span class="dot truth mini"></span> the ink</div>` +
        `<div class="vtitle">It reads as <b>${portrait.title}</b></div>` +
        `<div class="vblurb">${portrait.blurb}</div>` +
        `<div class="deltas">${deltas.map(rowHTML).join("")}</div>` +
        `<div class="vsum">${summary(deltas)}</div>`;
      verdict.hidden = false;
      if (opts.onReveal) opts.onReveal(portrait, deltas);
    }

    function mkDelta(ax, you, ink) {
      const d = you - ink;
      return { ax, you, ink, d, word: d >= 0 ? ax.hiWord : ax.loWord };
    }
    function rowHTML(r) {
      const d = r.d;
      return (
        `<div class="drow">` +
        `<span class="dax">${r.ax.lo}<i>–</i>${r.ax.hi}</span>` +
        `<span class="dmini"><b class="ink" style="left:${r.ink * 100}%"></b><b class="you" style="left:${r.you * 100}%"></b></span>` +
        `<span class="dval ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : ""}${d.toFixed(2)}</span>` +
        `</div>`
      );
    }
    function summary(deltas) {
      const big = deltas.filter((r) => Math.abs(r.d) > 0.12).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      if (!big.length) return "You read it almost exactly as it is — uncanny.";
      const words = big.slice(0, 2).map((r) => r.word);
      return "You read it " + words.join(" and ") + " than it is.";
    }

    return { setBlot };
  }

  g.INKQUIZ = { mount, PADS };
})(typeof globalThis !== "undefined" ? globalThis : this);
