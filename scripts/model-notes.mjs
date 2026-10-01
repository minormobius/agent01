#!/usr/bin/env node
// model-notes.mjs — ask a model for notes on some of this repo's files, and keep the answer.
//
//   node scripts/model-notes.mjs docs/reviews/requests/<name>.json            # call the model
//   node scripts/model-notes.mjs docs/reviews/requests/<name>.json --dry-run  # print the bundle, no call
//
// A request names the provider, the model, the files and the question:
//   { "label": "pitch", "provider": "deepseek", "model": "deepseek-flash",
//     "thinking": true, "files": ["del/pitch/index.html", "docs/HARNESS.md"], "ask": "…" }
//
// The answer lands at docs/reviews/<date>-<label>-<model>.md with the request, the usage the
// provider reported, and the files' commit, so a note can always be traced to what was read.
// The workflow (.github/workflows/model-notes.yml) runs it where the provider key lives.
//
// Only files in this PUBLIC repo can be sent, and the script refuses anything under a path that
// may hold private material (the homunculus log, inbox transcripts).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = {
  // OpenAI-compatible chat completions. Thinking is a request field on DeepSeek's API.
  deepseek: { url: 'https://api.deepseek.com/chat/completions', keyEnv: 'DEEPSEEK_API_KEY' },
};
const REFUSE = [/^packages\/homunculus\/log\//, /^homunculus\/inbox\//, /(^|\/)\.env/];

// ---- HTML → readable text, diagrams included ----------------------------------------------
// A diagram becomes its accessible claim plus every label drawn in it, in document order, so a
// text-only reader sees what the figure says and what it names.
export function htmlToText(html) {
  const decode = (s) => s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&mdash;/g, '—');
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, (h) => (h.match(/<title>[\s\S]*?<\/title>/i) || [''])[0]);
  s = s.replace(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi, (_, attrs, body) => {
    const label = (attrs.match(/aria-label="([^"]*)"/) || [])[1] || '';
    const texts = [...body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
      .map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);
    return `\n[DIAGRAM: ${decode(label)}]\n[labels drawn: ${texts.join(' | ')}]\n`;
  });
  s = s
    .replace(/<(h[1-6])\b[^>]*>/gi, (m, h) => `\n\n${'#'.repeat(Number(h[1]))} `)
    .replace(/<\/(h[1-6]|p|li|tr|figcaption|blockquote|pre|section|header|footer|dt|dd|article)>/gi, '\n')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<t[dh]\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  return decode(s).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function bundle(files) {
  return files.map((f) => {
    if (REFUSE.some((r) => r.test(f))) throw new Error(`refusing to send ${f}: that path may hold private material`);
    const raw = readFileSync(join(ROOT, f), 'utf8');
    const body = f.endsWith('.html') ? htmlToText(raw) : raw;
    return `===== FILE: ${f} =====\n${body}\n`;
  }).join('\n');
}

async function main() {
  const [reqPath, ...flags] = process.argv.slice(2);
  if (!reqPath) { console.error('usage: model-notes.mjs <request.json> [--dry-run]'); process.exit(1); }
  const req = JSON.parse(readFileSync(join(ROOT, reqPath), 'utf8'));
  const prov = PROVIDERS[req.provider];
  if (!prov) throw new Error(`unknown provider ${req.provider}`);
  const material = bundle(req.files);
  const system = req.system || 'You are an experienced, candid reviewer. You read closely and you say what you actually think.';
  const user = `${req.ask}\n\nThe material follows. Diagrams are given as their stated claim plus the labels drawn in them.\n\n${material}`;
  if (flags.includes('--dry-run')) {
    console.log(`${user.length} chars, ~${Math.round(user.length / 4)} tokens\n`);
    console.log(user.slice(0, 4000));
    return;
  }
  const key = process.env[prov.keyEnv];
  if (!key) throw new Error(`${prov.keyEnv} is not set`);

  const body = {
    model: req.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: req.max_tokens || 32768,
    stream: false,
  };
  if (req.thinking) body.thinking = { type: 'enabled' };
  if (req.reasoning_effort) body.reasoning_effort = req.reasoning_effort;

  const t0 = Date.now();
  const r = await fetch(prov.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${req.provider} answered ${r.status}: ${text.slice(0, 500)}`);
  const j = JSON.parse(text);
  const msg = j.choices?.[0]?.message || {};
  const notes = String(msg.content || '').trim();
  if (!notes) throw new Error(`empty answer (finish_reason ${j.choices?.[0]?.finish_reason}); raise max_tokens?`);

  const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  const date = new Date().toISOString().slice(0, 10);
  const out = join(ROOT, 'docs', 'reviews', `${date}-${req.label}-${req.model}.md`);
  mkdirSync(dirname(out), { recursive: true });
  const u = j.usage || {};
  writeFileSync(out, [
    `# Notes from \`${j.model || req.model}\` on ${req.label}`,
    '',
    `Asked ${date} at commit \`${commit}\` via \`${basename(reqPath)}\`. Thinking: ${req.thinking ? 'on' : 'off'}${req.reasoning_effort ? ` (${req.reasoning_effort})` : ''}. ` +
      `Tokens: ${u.prompt_tokens ?? '?'} in, ${u.completion_tokens ?? '?'} out` +
      `${u.completion_tokens_details?.reasoning_tokens ? ` (${u.completion_tokens_details.reasoning_tokens} reasoning)` : ''}. ` +
      `Finish: ${j.choices?.[0]?.finish_reason}. ${Math.round((Date.now() - t0) / 1000)}s.`,
    '',
    `Files read: ${req.files.map((f) => `\`${f}\``).join(', ')}.`,
    '',
    '> These are a model\'s notes, kept verbatim. They are input to weigh, not decisions.',
    '',
    '## The question',
    '',
    req.ask.split('\n').map((l) => `> ${l}`).join('\n'),
    '',
    '## The notes',
    '',
    notes,
    '',
  ].join('\n'));
  console.log(`wrote ${out.slice(ROOT.length + 1)} (${notes.length} chars)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`model-notes: ${e.message}`); process.exit(1); });
}
