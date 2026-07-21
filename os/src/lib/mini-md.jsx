// Tiny, safe markdown renderer for chat bubbles — emits React elements only
// (no innerHTML, so model output can't inject markup). Covers what models
// actually emit: fenced code, inline code, bold/italic, headers, lists,
// links, paragraphs. Anything else renders as text.

import React from 'react';

const CODE_BG = { background: '#0d0d0d', border: '1px solid #262626', borderRadius: 6 };

function renderInline(text, keyBase) {
  // Tokenize: `code`, **bold**, *italic*, [text](url)
  const out = [];
  let rest = text;
  let k = 0;
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/;
  while (rest) {
    const m = rest.match(re);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyBase}-${k++}`;
    if (tok.startsWith('`')) {
      out.push(<code key={key} style={{ ...CODE_BG, padding: '1px 5px', fontSize: '0.92em' }}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('**')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      const url = m[5];
      out.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#61afef' }}>{label}</a>);
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function renderMarkdown(src, keyPrefix = 'md') {
  const nodes = [];
  let k = 0;
  // Split out fenced code blocks first.
  const parts = String(src ?? '').split(/(```[\s\S]*?(?:```|$))/);
  for (const part of parts) {
    if (!part) continue;
    const key = () => `${keyPrefix}-${k++}`;
    if (part.startsWith('```')) {
      const body = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      nodes.push(
        <pre key={key()} style={{ ...CODE_BG, padding: '8px 10px', overflowX: 'auto', fontSize: '0.9em', margin: '6px 0', whiteSpace: 'pre' }}>
          {body}
        </pre>
      );
      continue;
    }
    // Line-based blocks within a text segment.
    const lines = part.split('\n');
    let para = [];
    const flush = () => {
      if (!para.length) return;
      nodes.push(<div key={key()} style={{ margin: '4px 0' }}>{renderInline(para.join('\n'), key())}</div>);
      para = [];
    };
    for (const line of lines) {
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (h) {
        flush();
        nodes.push(
          <div key={key()} style={{ fontWeight: 700, fontSize: h[1].length <= 2 ? '1.05em' : '1em', margin: '8px 0 3px', color: '#dcdcdc' }}>
            {renderInline(h[2], key())}
          </div>
        );
      } else if (li) {
        flush();
        nodes.push(
          <div key={key()} style={{ display: 'flex', gap: 7, margin: '2px 0 2px 6px' }}>
            <span style={{ color: '#666' }}>•</span>
            <span>{renderInline(li[1], key())}</span>
          </div>
        );
      } else if (line.trim() === '') {
        flush();
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return nodes;
}
