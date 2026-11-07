(async () => {
  const got = []; const P = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (m, ...r) { if (m && (m.events || m.more)) got.push(...(m.events || m.more)); return P.call(this, m, ...r); };
  document.getElementById(window.__btn).click(); await new Promise(r => setTimeout(r, window.__wait));
  const H = await import('/jams/handed.js'); const j = JSON.parse(H.json());
  const same = j.notes.length === got.length && j.notes.every((n, i) => n.start === got[i][0] && n.length === got[i][4] && n.part === got[i][5] && Math.abs(n.hz - got[i][2]) < 1e-3 && n.kind === j.kinds[got[i][1]]);
  return { posted: got.length, exported: j.notes.length, same, link: document.getElementById('events').textContent, hidden: document.getElementById('events').hidden, api: document.getElementById('api').textContent, meta: Object.fromEntries(Object.entries(j).filter(([k]) => k !== 'notes')), first: j.notes.slice(0, 3) };
})()
