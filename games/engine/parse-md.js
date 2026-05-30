// Parses a game spec (.md) into { meta, sections }.
//
// Format:
//   ---
//   key: value          frontmatter, YAML-ish (string/number coerced)
//   ---
//   ## sectionName     each section becomes sections[name]
//   - plain item       collected into sections[name].items
//   - key: value       also added to sections[name].map[key] (coerced)

const isNumeric = (s) => /^-?\d+(\.\d+)?$/.test(s);
const coerce = (raw) => {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (isNumeric(v)) return Number(v);
  return v;
};

export function parseGameMarkdown(src) {
  const text = src.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let i = 0;
  const meta = {};

  // Frontmatter
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const line = lines[i];
      const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
      if (m) meta[m[1]] = coerce(m[2]);
      i++;
    }
    i++; // skip closing ---
  }

  // Sections
  const sections = {};
  let current = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1].trim();
      sections[current] = { items: [], map: {}, text: '' };
      continue;
    }
    if (!current) continue;
    const li = line.match(/^\s*-\s+(.+?)\s*$/);
    if (li) {
      const item = li[1];
      const kv = item.match(/^([^:]+?)\s*:\s*(.+)$/);
      if (kv) {
        sections[current].map[kv[1].trim()] = coerce(kv[2]);
        sections[current].items.push(kv[2].trim());
      } else {
        sections[current].items.push(item.trim());
      }
      continue;
    }
    if (line.trim()) {
      sections[current].text += (sections[current].text ? '\n' : '') + line;
    }
  }

  return { meta, sections };
}
