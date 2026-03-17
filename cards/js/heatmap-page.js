// ── Heatmap page: 150×150 cosine similarity matrix ──────────

const CLUSTER_COLORS = {
  'NATURAL WORLD': '#2ecc71',
  'CONFLICT':      '#e74c3c',
  'COMPETITION':   '#e67e22',
  'CULTURE':       '#9b59b6',
  'NARRATIVE':     '#3498db',
  'STRUCTURE':     '#f1c40f',
  'EARTH':         '#1abc9c',
};

function simToColor(v) {
  v = Math.max(0, Math.min(1, v));
  let r, g, b;
  if (v < 0.5) {
    const t = v / 0.5;
    r = Math.round(10 + t * 245);
    g = Math.round(10 + t * 245);
    b = Math.round(80 + t * 175);
  } else {
    const t = (v - 0.5) / 0.5;
    r = 255;
    g = Math.round(255 - t * 230);
    b = Math.round(255 - t * 230);
  }
  return [r, g, b];
}

async function init() {
  const resp = await fetch('data/cosine-matrix-150.json');
  const data = await resp.json();
  const { n, articles, matrix } = data;

  document.getElementById('hm-info').textContent = `${n} × ${n} matrix`;

  // Legend gradient
  const bar = document.getElementById('hm-legend-bar');
  const stops = [];
  for (let i = 0; i <= 20; i++) {
    const v = i / 20;
    const [r, g, b] = simToColor(v);
    stops.push(`rgb(${r},${g},${b})`);
  }
  bar.style.background = `linear-gradient(to right, ${stops.join(',')})`;

  // Cluster key
  const keyEl = document.getElementById('hm-cluster-key');
  const seen = [];
  for (const a of articles) {
    if (!seen.includes(a.cluster)) seen.push(a.cluster);
  }
  for (const c of seen) {
    const count = articles.filter(a => a.cluster === c).length;
    const div = document.createElement('div');
    div.className = 'hm-cluster-row';
    div.innerHTML = `<span class="hm-swatch" style="background:${CLUSTER_COLORS[c] || '#666'}"></span>${c} (${count})`;
    keyEl.appendChild(div);
  }

  // Canvas sizing — fill available space
  const wrap = document.querySelector('.heatmap-canvas-wrap');
  const avail = Math.min(wrap.clientWidth, wrap.clientHeight) - 20;
  const px = Math.max(2, Math.floor(avail / n));
  const size = n * px;

  const canvas = document.getElementById('heatmap-canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = matrix[i][j];
      const [r, g, b] = simToColor(v);
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const off = ((i * px + dy) * size + j * px + dx) * 4;
          img.data[off] = r;
          img.data[off + 1] = g;
          img.data[off + 2] = b;
          img.data[off + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // Cluster boundary lines
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  let prevCluster = articles[0].cluster;
  for (let i = 1; i < n; i++) {
    if (articles[i].cluster !== prevCluster) {
      const pos = i * px;
      ctx.beginPath();
      ctx.moveTo(pos, 0); ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos); ctx.lineTo(size, pos);
      ctx.stroke();
      prevCluster = articles[i].cluster;
    }
  }

  // Tooltip interaction
  const tooltip = document.getElementById('hm-tooltip');
  const hoverInfo = document.getElementById('hm-hover');

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / px);
    const y = Math.floor((e.clientY - rect.top) / px);
    if (x < 0 || x >= n || y < 0 || y >= n) {
      tooltip.style.display = 'none';
      return;
    }
    const ai = articles[y];
    const aj = articles[x];
    const sim = matrix[y][x];

    tooltip.innerHTML = `
      <div class="t-title">${ai.title}</div>
      <div class="t-cluster">${ai.cluster} / ${ai.neighborhood}</div>
      <div style="margin:4px 0;color:var(--text-dim)">&times;</div>
      <div class="t-title">${aj.title}</div>
      <div class="t-cluster">${aj.cluster} / ${aj.neighborhood}</div>
      <div class="t-sim" style="margin-top:6px">cosine: ${sim.toFixed(4)}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 16) + 'px';
    tooltip.style.top = (e.clientY + 16) + 'px';

    const tr = tooltip.getBoundingClientRect();
    if (tr.right > window.innerWidth) tooltip.style.left = (e.clientX - tr.width - 8) + 'px';
    if (tr.bottom > window.innerHeight) tooltip.style.top = (e.clientY - tr.height - 8) + 'px';

    hoverInfo.textContent = `[${y},${x}] cos=${sim.toFixed(4)}`;
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    hoverInfo.textContent = 'Hover for details';
  });
}

init();
