// gel-sim.js — interactive agarose gel electrophoresis.
//
// Renders lanes of DNA bands and ANIMATES their migration as the field runs,
// driven by the engine's calibrated gel physics (Engine.gel). The user cranks
// voltage / agarose% / run-time; bands advance to the steady-state position the
// physics predicts. Topology is honored — supercoiled runs ahead of linear,
// nicked behind — so an uncut plasmid genuinely shows multiple bands.
//
//   const gel = createGel(canvas, Engine);
//   gel.setLanes([{ label:'ladder', frags:[10000,5000,...], ladder:true },
//                 { label:'sample', frags:['3000:sc','3000:nick'] }]);
//   gel.setConditions({ voltage:100, agarose:1.0, gelLen:8 });
//   gel.run(45);     // animate to the 45-minute steady state
//   gel.onState = (minutes)=>{...}  // progress callback
//
// Bands store target fractions per minute-of-run; the animation interpolates
// elapsed time so "crank the voltage" visibly speeds migration.

const LADDER_1KB = [10000, 5000, 3000, 2000, 1500, 1000, 750, 500, 250, 100];

export function createGel(canvas, Engine) {
  const g = canvas.getContext('2d');
  let lanes = [];
  let cond = { voltage: 100, agarose: 1.0, gelLen: 8 };
  let elapsed = 0;       // minutes currently shown
  let targetMin = 0;     // minutes we're animating toward
  let raf = 0;
  const api = {};

  // recompute each band's migration fraction at a given run time
  function fracAt(frags, minutes) {
    if (minutes <= 0) return frags.map(() => ({ frac: 0, ranOff: false }));
    const csv = frags.map(f => (typeof f === 'number' ? String(f) : f)).join(',');
    const r = Engine.gel(csv, cond.voltage, cond.agarose, minutes, cond.gelLen).value;
    return r.bands.map(b => ({ frac: b.frac, ranOff: b.ranOff, bp: b.bp, topo: b.topo }));
  }
  function dyeAt(minutes) {
    if (minutes <= 0) return 0;
    return Engine.gel('50', cond.voltage, cond.agarose, minutes, cond.gelLen).value.dyeFront;
  }

  api.setLanes = (l) => { lanes = l.map(x => ({ ...x, frags: x.ladder && !x.frags ? LADDER_1KB : x.frags })); draw(); };
  api.setConditions = (c) => { Object.assign(cond, c); draw(); };
  api.reset = () => { cancelAnimationFrame(raf); elapsed = 0; targetMin = 0; draw(); };

  api.run = (minutes) => {
    cancelAnimationFrame(raf);
    targetMin = minutes;
    const from = elapsed;
    const dur = 1400; // ms of animation regardless of sim minutes
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      elapsed = from + (targetMin - from) * ease;
      draw();
      if (api.onState) api.onState(elapsed);
      if (k < 1) raf = requestAnimationFrame(tick);
      else { elapsed = targetMin; draw(); if (api.onState) api.onState(elapsed); }
    };
    raf = requestAnimationFrame(tick);
  };

  // the live "running" loop — keeps advancing while the field is on
  api.power = (on, ratePerSec = 6) => {
    cancelAnimationFrame(raf);
    if (!on) return;
    let last = performance.now();
    const tick = (now) => {
      elapsed += ((now - last) / 1000) * ratePerSec;
      last = now;
      draw();
      if (api.onState) api.onState(elapsed);
      // stop if everything has run off
      const anyOn = lanes.some(L => fracAt(L.frags, elapsed).some(b => !b.ranOff));
      if (anyOn) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  api.getMinutes = () => elapsed;
  api.bandsForLane = (i) => fracAt(lanes[i].frags, elapsed);

  function draw() {
    const W = canvas.width, H = canvas.height;
    // gel slab
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1a16'); grad.addColorStop(1, '#06120e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    const top = 30, bottom = H - 18;
    const laneN = Math.max(1, lanes.length);
    const padL = 14, padR = 14;
    const laneW = (W - padL - padR) / laneN;
    const wellH = 9;

    // run-distance scale: frac 0..1 over [top+well .. bottom]
    const Y = frac => top + wellH + frac * (bottom - (top + wellH));

    // dye front line
    const dye = dyeAt(elapsed);
    if (dye > 0) {
      g.strokeStyle = 'rgba(122,162,255,.25)'; g.setLineDash([4, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, Y(Math.min(dye, 1))); g.lineTo(W - padR, Y(Math.min(dye, 1))); g.stroke();
      g.setLineDash([]);
    }

    lanes.forEach((L, i) => {
      const x0 = padL + i * laneW;
      const cx = x0 + laneW / 2;
      const bw = laneW * 0.66;
      // well
      g.fillStyle = '#04221a'; g.fillRect(cx - bw / 2, top, bw, wellH);
      g.strokeStyle = '#1b3a30'; g.strokeRect(cx - bw / 2, top, bw, wellH);
      // label
      g.fillStyle = '#9aa7b4'; g.font = '11px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText(L.label || ('lane ' + (i + 1)), cx, 18);

      const bands = fracAt(L.frags, elapsed);
      bands.forEach((b) => {
        if (b.ranOff) return;
        const y = Y(Math.min(b.frac, 1));
        // band glow (EtBr-style); brightness ~ a fake "mass" (bigger=brighter)
        const bright = Math.min(1, 0.45 + (b.bp ? Math.log10(b.bp) / 5 : 0.4));
        const isLadder = L.ladder;
        g.save();
        g.shadowColor = isLadder ? 'rgba(120,140,170,.7)' : 'rgba(120,255,190,.85)';
        g.shadowBlur = 7;
        g.fillStyle = isLadder
          ? `rgba(150,170,200,${0.55 * bright})`
          : `rgba(140,255,200,${0.85 * bright})`;
        const h = 4;
        g.fillRect(cx - bw / 2, y - h / 2, bw, h);
        g.restore();
        // ladder size labels
        if (isLadder) {
          g.fillStyle = '#5b6b7d'; g.font = '9px ui-monospace,monospace'; g.textAlign = 'right';
          g.fillText(b.bp >= 1000 ? (b.bp / 1000) + 'k' : b.bp, cx - bw / 2 - 3, y + 3);
        }
      });
    });

    // running indicator
    g.fillStyle = '#5b6b7d'; g.font = '10px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillText(`${cond.voltage} V · ${cond.agarose.toFixed(1)}% · ${elapsed.toFixed(0)} min`, padL, H - 5);
  }

  draw();
  return api;
}

export const LADDER = LADDER_1KB;
