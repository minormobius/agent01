#!/usr/bin/env node
/**
 * rant — composer browser test.
 *
 * The formatting buttons are the kind of thing that looks right in the markup
 * and is broken in the hand: a `click` handler steals focus from the textarea
 * before it fires, so the selection is gone by the time you try to wrap it. Only
 * a real browser catches that.
 *
 * The string maths itself is tested natively in `rant_core::edit` (including the
 * UTF-16 offset trap). This checks the wiring: does pressing the button change
 * the text the way the engine says it should, and does the preview follow.
 *
 * Usage:  npm i playwright && node compose.test.mjs [base-url]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8798';
let fails = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !extra ? '' : ` — ${extra}`}`);
  if (!cond) fails++;
};

const launch = { args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_CHROMIUM) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) launch.proxy = { server: proxy, bypass: '127.0.0.1,localhost,::1' };
const browser = await chromium.launch(launch);
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/401|cloudflareinsights|ERR_/.test(m.text())) errors.push(m.text());
});

console.log(`\ncomposer, in a browser (${BASE})`);
await page.goto(`${BASE}/compose/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!document.querySelector('.toolbar .tb'), { timeout: 5000 });

const ta = page.locator('#editor');
const val = () => ta.inputValue();
const setSel = (a, b) =>
  page.evaluate(([a, b]) => {
    const t = document.querySelector('#editor');
    t.focus();
    t.setSelectionRange(a, b);
  }, [a, b]);
// mousedown, because that is the event the buttons listen for — and using it
// here is also the assertion that the selection survives the press.
const press = async (fmt) => {
  await page.locator(`.tb[data-fmt="${fmt}"]`).dispatchEvent('mousedown');
  await page.waitForTimeout(60);
};

ok('the wasm module booted', await page.evaluate(() => !!document.querySelector('.toolbar .tb')));
ok('no page errors', errors.length === 0, errors.join(' | '));

// ── the selection survives the button press ──
await ta.fill('the cat sat');
await setSel(4, 7);
await press('bold');
ok('bold wraps the selection', (await val()) === 'the **cat** sat', await val());
ok('…and keeps it selected', await page.evaluate(() => {
  const t = document.querySelector('#editor');
  return t.value.slice(t.selectionStart, t.selectionEnd) === 'cat';
}));

await press('bold');
ok('pressing again unwraps it', (await val()) === 'the cat sat', await val());

await setSel(4, 7);
await press('link');
ok('link builds the skeleton', (await val()) === 'the [cat](url) sat', await val());
ok('…with the url placeholder selected', await page.evaluate(() => {
  const t = document.querySelector('#editor');
  return t.value.slice(t.selectionStart, t.selectionEnd) === 'url';
}));

// ── block actions span the lines the selection touches ──
await ta.fill('one\ntwo\nthree');
await setSel(1, 9);
await press('bullet');
ok('bullets cover every touched line', (await val()) === '- one\n- two\n- three', await val());
await press('number');
ok('numbering replaces bullets sensibly', (await val()).startsWith('1. - one'), await val());

await ta.fill('a\nb');
await setSel(0, 3);
await press('number');
ok('numbered list renumbers', (await val()) === '1. a\n2. b', await val());

// ── the UTF-16 trap, end to end ──
await ta.fill('🗯️ hello world');
const h = await page.evaluate(() => document.querySelector('#editor').value.indexOf('hello'));
await setSel(h, h + 5);
await press('bold');
ok('offsets survive an emoji before the cursor', (await val()) === '🗯️ **hello** world', await val());

// ── keyboard shortcuts ──
await ta.fill('shortcut');
await setSel(0, 8);
await ta.press('Control+b');
await page.waitForTimeout(60);
ok('Ctrl+B bolds', (await val()) === '**shortcut**', await val());

// ── the preview follows ──
await ta.fill('');
await ta.fill('plain words');
await setSel(0, 5);
await press('heading');
await page.waitForTimeout(120);
ok('the preview re-renders after formatting',
  (await page.locator('#preview-body').innerHTML()).includes('<h2'),
  await page.locator('#preview-body').innerHTML());

// ── starters ──
const chips = await page.locator('.starters .chip').count();
ok(`starter chips are offered (${chips})`, chips >= 5);
await ta.fill('');
page.on('dialog', (d) => d.accept());
await page.locator('.starters .chip[data-template="review"]').click();
let filled = true;
try {
  await page.waitForFunction(
    () => document.querySelector('#editor').value.includes('verdict'),
    { timeout: 5000 },
  );
} catch {
  filled = false;
}
ok('a starter fills the empty editor', filled, await val());
ok('…and the preview shows it',
  (await page.locator('#preview-body').innerHTML()).toLowerCase().includes('verdict'));

// Non-empty editor must ask before clobbering.
let asked = false;
page.removeAllListeners('dialog');
page.on('dialog', (d) => { asked = true; d.dismiss(); });
await ta.fill('something I already wrote');
await page.locator('.starters .chip[data-template="note"]').click();
await page.waitForTimeout(250);
ok('a starter asks before replacing your text', asked);
ok('…and dismissing keeps it', (await val()) === 'something I already wrote', await val());

ok('still no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(fails === 0 ? '\n✓ composer test passed' : `\n✗ ${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
