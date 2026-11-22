// node proofs/riemann/learn/browser.selftest.mjs
//
// Enforces the machine-checked laws in LAWS.md on every slide of the deck,
// in a real browser at phone size:
//   2  every slide has a "do"
//   3  every chart has a cursor: pointer at several places gives a tooltip,
//      different places give different points, the keyboard steps it, and a
//      keystroke on a focused chart does not turn the page
//   4  the theme toggle changes the background and a chart's strokes
//   6  the sheet's peek height is at most 46% of the screen
//   11 no horizontal scroll at 390 px
//   13 no console errors, in either theme
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');              // serve proofs/riemann/
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
  console.log('skip: playwright not installed'); process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const t0 = Date.now();

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/learn/#1`);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForSelector('.sheet h2');
  const n = await page.evaluate(() => document.querySelectorAll('#bars i').length);
  ok(n >= 10, `deck has slides (${n})`);

  for (let i = 1; i <= n; i++) {
    await page.goto(`http://localhost:${port}/learn/#${i}`);
    await page.waitForTimeout(i === 5 ? 900 : 300);
    const title = await page.textContent('.sheet h2');
    const tag = `slide ${i} (${title})`;
    ok(await page.$('.sheet .do'), `${tag}: has a "do" (law 2)`);
    const peek = await page.evaluate(() => document.getElementById('sheet').getBoundingClientRect().height / document.getElementById('device').getBoundingClientRect().height);
    ok(peek <= 0.465, `${tag}: sheet peek ${(peek * 100).toFixed(0)}% ≤ 46% (law 6)`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal scroll (law 11)`);

    // law 13: every slider, swept end to end, draws finite numbers (slide 12 drew NaN above β ≈ 0.868)
    const nanBefore = errors.length;
    await page.evaluate(async () => {
      for (const el of document.querySelectorAll('#stage input[type=range]')) {
        const lo = +el.min, hi = +el.max, v0 = el.value;
        for (let u = 0; u <= 1.0001; u += 0.1) { el.value = lo + (hi - lo) * u; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 5)); }
        el.value = v0; el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(50);
    const bad = await page.evaluate(() => [...document.querySelectorAll('#stage svg [d], #stage svg [x], #stage svg [cx]')].filter((n) => /NaN/.test((n.getAttribute('d') || '') + (n.getAttribute('x') || '') + (n.getAttribute('cx') || ''))).length);
    ok(errors.length === nanBefore && bad === 0, `${tag}: every slider swept end to end draws finite numbers (${errors.length - nanBefore} errors, ${bad} NaN nodes) (law 13)`);

    // law 3: every chart in the widget area
    const charts = await page.$$('.w .plot svg:not([style*="pointer-events:none"]), .w .plot canvas');
    for (const [k, ch] of charts.entries()) {
      const box = await ch.boundingBox();
      if (!box || box.width < 50 || box.height < 50) { ok(false, `${tag}: chart ${k} is too small to use`); continue; }
      const tipText = () => page.evaluate(() => [...document.querySelectorAll('.w g.cur text')].map((t) => t.textContent).join(' | '));
      const seen = new Set();
      // a diagonal sweep, so x-, y- and xy-snapping charts all see different points
      for (const [fx, fy] of [[0.2, 0.85], [0.45, 0.6], [0.7, 0.35], [0.9, 0.12]]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(30);
        const t = await tipText();
        ok(t.length > 0, `${tag}: chart ${k} shows a tooltip at ${fx} (law 3)`);
        seen.add(t);
      }
      ok(seen.size >= 3, `${tag}: chart ${k} cursor reaches different points (${seen.size} distinct of 4) (law 3)`);
      // keyboard: focus, step, and the page must not turn
      const hash = await page.evaluate(() => location.hash);
      await ch.focus();
      await page.keyboard.press('Home'); await page.waitForTimeout(20);
      const first = await tipText();
      ok(first.length > 0, `${tag}: chart ${k} Home key shows the first point (law 3)`);
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(30);
      const after = await tipText();
      ok(after.length > 0 && after !== first, `${tag}: chart ${k} steps by keyboard (law 3)`);
      ok((await page.evaluate(() => location.hash)) === hash, `${tag}: arrow keys on a focused chart do not turn the page (law 5)`);
      // law 5: dragging across the chart (labels included) selects no text
      await page.evaluate(() => getSelection().removeAllRanges());
      await page.mouse.move(box.x + 3, box.y + box.height - 6);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
      await page.mouse.move(box.x + box.width - 3, box.y + 4, { steps: 6 });
      await page.mouse.up();
      const sel = await page.evaluate(() => getSelection().toString());
      ok(sel === '', `${tag}: chart ${k} drag selects no text (got "${sel.slice(0, 30)}") (law 5)`);
      await page.mouse.move(2, 2);
    }
    // ... while the notes stay selectable
    if (i === 1 || i === n) {
      await page.evaluate(() => getSelection().removeAllRanges());
      await page.click('.sheet .cap', { clickCount: 3 });
      const sel = await page.evaluate(() => getSelection().toString());
      ok(sel.length > 10, `${tag}: caption text can still be selected (law 5)`);
      await page.evaluate(() => getSelection().removeAllRanges());
    }
    if (i === 1) ok(charts.length > 0, 'slide 1 has a chart (the test is looking in the right place)');
  }

  // autopilot (law 16): every line's target exists on its slide
  for (let i = 1; i <= n; i++) {
    await page.goto(`http://localhost:${port}/learn/#${i}`); await page.waitForTimeout(i === 5 ? 700 : 150);
    const missing = await page.evaluate(async (i) => {
      const { LECTURE } = await import('./lecture.js');
      const st = document.getElementById('stage'), bad = [];
      for (const l of LECTURE[i - 1] || []) {
        if (l.drive && !document.getElementById(l.drive[0])) bad.push('drive ' + l.drive[0]);
        if (l.click && !st.querySelector(l.click)) bad.push('click ' + l.click);
        if (l.hover && !st.querySelector('.w .plot svg, .w .plot canvas')) bad.push('hover: no chart');
      }
      return bad;
    }, i);
    ok(missing.length === 0, `slide ${i}: autopilot targets exist (${missing.join(', ')}) (law 16)`);
  }
  // autopilot runs: voice renders, subtitle shows, the slider moves, no task is credited, a real touch pauses
  // a fresh deck: earlier checks ticked tasks for real, and a same-document hash change keeps the page's
  // in-memory progress, so clear storage only after navigating, then reload
  await page.goto(`http://localhost:${port}/learn/#1`); await page.waitForTimeout(100);
  await page.evaluate(() => { localStorage.removeItem('riemann-learn-v1'); });
  await page.reload(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !JSON.parse(localStorage.getItem('riemann-learn-v1') || '{}').done?.[0]), 'the autopilot check starts from a fresh deck');
  await page.click('#lectureBtn');
  await page.waitForFunction(() => document.getElementById('sub').classList.contains('on'), null, { timeout: 5000 }).catch(() => {});
  ok((await page.textContent('#subText')) === "Let's start by counting primes.", 'autopilot shows the first line as a subtitle (law 16)');
  ok((await page.textContent('#lectureBtn')).includes('pause'), 'the lecture button becomes pause (law 16)');
  const rendered = await page.evaluate(async () => {
    const { speak } = await import('./vendor/chipvoice/chipvoice.js'); const { LEXICON, DUR } = await import('./narration.js');
    const r = speak("Let's start by counting primes.", LEXICON, { rate: 16000 }); return { secs: r.audio.length / 16000, dur: DUR[0][0], peak: Math.max(...r.audio.map(Math.abs)) };
  });
  ok(Math.abs(rendered.secs - rendered.dur) < 0.05 && rendered.peak > 0.05, `the voice renders the line in the browser (${rendered.secs.toFixed(2)} s vs ${rendered.dur} s, peak ${rendered.peak.toFixed(2)}) (law 16)`);
  const seen = new Set();
  for (let t = 0; t < 26; t++) { seen.add(+(await page.inputValue('#kx'))); await page.waitForTimeout(100); }
  ok(seen.size >= 5 && Math.min(...seen) < 50, `autopilot sweeps the slider (${seen.size} values, from ${Math.min(...seen)} to ${Math.max(...seen)}) (law 16)`);
  const doneNow = await page.evaluate(() => localStorage.getItem('riemann-learn-v1'));
  ok(!JSON.parse(doneNow || '{}').done?.[0], `autopilot does not tick the task (law 16): ${doneNow}`);
  const box1 = await (await page.$('.w .plot svg')).boundingBox();
  await page.mouse.click(box1.x + box1.width * 0.3, box1.y + box1.height * 0.5);
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => window.__autopilot.paused === true), 'a real touch on the widget pauses the lecture (law 16)');
  ok((await page.textContent('#lectureBtn')).includes('resume'), 'the button offers resume (law 16)');
  await page.click('#apStop'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => !window.__autopilot.on && !document.getElementById('sub').classList.contains('on')), 'stop ends the lecture and hides the subtitle (law 16)');

  // the chatbot (law 15), with /api/ask mocked: no model is called from a test
  let sent = null;
  await page.route('**/api/ask', async (route) => {
    sent = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: {"provider":"gemini","model":"gemini-flash-latest","label":"Gemini Flash (Google)"}\n\ndata: {"response":"Z is real because θ cancels the phase; "}\n\ndata: {"response":"see slide 8. Zeros below 1000: "}\n\ndata: {"response":649}\n\ndata: {"response":0}\n\ndata: [DONE]\n\n' });
  });
  await page.goto(`http://localhost:${port}/learn/#8`); await page.waitForTimeout(300);
  await page.click('#askBtn'); await page.waitForTimeout(100);
  ok(await page.isVisible('#chat'), 'ask opens the chat panel (law 15)');
  ok((await page.textContent('#chatSlide')) === '8', 'chat knows the slide (law 15)');
  await page.fill('#q', 'Why is Z real?');
  await page.keyboard.press('ArrowRight');
  ok((await page.evaluate(() => location.hash)) === '#8', 'arrow keys while typing do not turn the page (law 15)');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.msg.assistant')?.textContent.includes('see slide 8'), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(100);
  const answer = await page.textContent('.msg.assistant').catch(() => '');
  ok(((await page.textContent('.msg.assistant .meta')) || '').includes('Gemini Flash (Google)'), 'each answer names the model that wrote it (law 15)');
  // tokens should arrive as strings (the worker normalises them), but a stray numeric 0 must not vanish
  ok(answer.includes('Zeros below 1000: 6490'), `numeric tokens are kept, 0 included (law 15): …${answer.slice(-30)}`);
  ok(answer.includes('θ cancels the phase') && answer.includes('see slide 8'), 'streamed answer renders (law 15)');
  ok(sent && sent.deck === 'riemann' && sent.slide === 8 && sent.q === 'Why is Z real?' && !('context' in sent), 'request carries deck, slide and question, and no context (law 15)');
  ok(await page.$('.msg.assistant a[href="#8"]'), '"slide 8" in an answer links to the slide (law 15)');
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.click('.msg.assistant', { clickCount: 3 });
  ok((await page.evaluate(() => getSelection().toString())).length > 10, 'answers can be selected and copied (law 15)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  ok(!(await page.isVisible('#chat')), 'Esc closes the chat (law 15)');
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', (route) => route.fulfill({ status: 429, headers: { 'content-type': 'application/json' }, body: '{"error":"Too many questions in a minute. Try again shortly."}' }));
  await page.click('#askBtn'); await page.fill('#q', 'again'); await page.click('#send');
  await page.waitForTimeout(300);
  ok((await page.textContent('.msg.err').catch(() => '')).includes('Too many questions'), 'a refused question shows the reason (law 15)');
  // that 429 was ours: drop the browser's log line for it, and only it
  for (let k = errors.length - 1; k >= 0; k--) if (/status of 429/.test(errors[k])) errors.splice(k, 1);
  await page.unroute('**/api/ask');
  await page.click('#chatClose');
  await page.evaluate(() => { try { localStorage.removeItem('riemann-learn-chat-v1'); } catch {} });

  // law 4: theme toggle, on a chart slide
  await page.goto(`http://localhost:${port}/learn/#8`); await page.waitForTimeout(300);
  const look = () => page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    theme: document.documentElement.dataset.theme || 'auto',
    stroke: [...document.querySelectorAll('.w svg path')].map((p) => p.getAttribute('stroke')).filter(Boolean).join(','),
  }));
  const states = [];
  for (let k = 0; k < 3; k++) { states.push(await look()); await page.click('#theme'); await page.waitForTimeout(250); }
  const light = states.find((s) => s.theme === 'light'), dark = states.find((s) => s.theme === 'dark');
  ok(light && dark, `toggle cycles through light and dark (${states.map((s) => s.theme).join(' → ')}) (law 4)`);
  if (light && dark) {
    ok(light.bg !== dark.bg, `background changes with the theme (${light.bg} vs ${dark.bg}) (law 4)`);
    ok(light.stroke !== dark.stroke, 'chart strokes redraw from the theme tokens (law 4)');
  }
  // remembered across a reload
  await page.click('#theme'); await page.waitForTimeout(100);
  const chosen = await page.evaluate(() => document.documentElement.dataset.theme || 'auto');
  await page.reload(); await page.waitForTimeout(300);
  ok((await page.evaluate(() => document.documentElement.dataset.theme || 'auto')) === chosen, 'theme choice survives a reload (law 4)');

  // law 13, in dark: walk every slide again
  await page.evaluate(() => { localStorage.setItem('proofs-theme', 'dark'); });
  for (let i = 1; i <= n; i++) { await page.goto(`http://localhost:${port}/learn/#${i}`); await page.waitForTimeout(i === 5 ? 700 : 120); }
  ok(errors.length === 0, `no console errors in either theme (law 13): ${errors.slice(0, 3).join(' / ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
