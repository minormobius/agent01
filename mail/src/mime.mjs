// mime.js — just enough MIME to read a message an agent was sent: headers, the first text/plain
// part (or text/html with the tags taken out), quoted-printable and base64 decoded, and any
// verification codes or links. No dependencies, so node can test it as-is (mime.selftest.mjs).

export function splitHead(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  const head = i < 0 ? raw : raw.slice(0, i);
  const body = i < 0 ? '' : raw.slice(i).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) { const k = m[1].toLowerCase(); headers[k] = headers[k] ? `${headers[k]}, ${m[2]}` : m[2]; }
  }
  return { headers, body };
}

const param = (h, name) => (String(h || '').match(new RegExp(`${name}="?([^";]+)"?`, 'i')) || [])[1];

export function decodeQP(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function bytesToUtf8(bin) {
  try { return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0) & 0xff)); } catch { return bin; }
}

function decodePart(body, headers) {
  const enc = String(headers['content-transfer-encoding'] || '').toLowerCase();
  let bin = body;
  if (enc === 'base64') { try { bin = atob(body.replace(/\s+/g, '')); } catch { bin = body; } }
  else if (enc === 'quoted-printable') bin = decodeQP(body);
  const cs = String(param(headers['content-type'], 'charset') || 'utf-8').toLowerCase();
  return cs === 'utf-8' || cs === 'utf8' || enc === 'base64' || enc === 'quoted-printable' ? bytesToUtf8(bin) : bin;
}

// RFC 2047 encoded words in headers (=?utf-8?B?...?= / =?utf-8?Q?...?=).
export function decodeWords(s) {
  return String(s || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, e, t) =>
    bytesToUtf8(e.toLowerCase() === 'b' ? atob(t) : decodeQP(t.replace(/_/g, ' '))));
}

export const stripHtml = (h) => String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
  .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// The readable text of a message: the first text/plain anywhere in the tree, else the first
// text/html with its tags removed.
export function textOf(raw) {
  const { headers, body } = splitHead(raw);
  let plain = null, html = null;
  const walk = (hdrs, bod, depth) => {
    if (depth > 8) return;
    const ct = String(hdrs['content-type'] || 'text/plain').toLowerCase();
    if (ct.startsWith('multipart/')) {
      const b = param(hdrs['content-type'], 'boundary');
      if (!b) return;
      for (const part of bod.split(`--${b}`).slice(1)) {
        if (part.startsWith('--')) break;
        const p = splitHead(part.replace(/^\r?\n/, ''));
        walk(p.headers, p.body, depth + 1);
      }
    } else if (ct.startsWith('text/plain') && plain == null) plain = decodePart(bod, hdrs);
    else if (ct.startsWith('text/html') && html == null) html = decodePart(bod, hdrs);
  };
  walk(headers, body, 0);
  return { headers, text: (plain ?? (html != null ? stripHtml(html) : '')).trim() };
}

// Verification codes and links: what a signup needs, and nothing else.
export function codesOf(text, subject = '') {
  const t = `${subject}\n${text}`;
  const codes = new Set();
  // A code is a short run of capitals and digits (with a digit in it), on a line that says it's a
  // code or within two lines after one. Case-sensitive on the code, so words like "code" never match.
  const lines = t.split(/\r?\n/);
  const hint = /code|token|verif|confirm|one-time|otp|\bpin\b/i;
  lines.forEach((line, i) => {
    if (!lines.slice(Math.max(0, i - 2), i + 1).some((l) => hint.test(l))) return;
    for (const m of line.matchAll(/\b([A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?)\b/g)) if (/\d/.test(m[1]) && !/^(19|20)\d\d$/.test(m[1])) codes.add(m[1]);
  });
  const links = [...new Set([...t.matchAll(/https:\/\/[^\s)"'<>]+/g)].map((m) => m[0])
    .filter((u) => /verif|confirm|activate|validate|token|code/i.test(u)))].slice(0, 5);
  return { codes: [...codes].slice(0, 5), links };
}

export function dmarcOf(headers) {
  const ar = String(headers['authentication-results'] || '');
  const m = ar.match(/dmarc=(\w+)/i);
  return m ? m[1].toLowerCase() : 'none';
}

export const addrOf = (h) => (String(h || '').match(/<([^>]+)>/) || [null, String(h || '').trim()])[1].toLowerCase();
