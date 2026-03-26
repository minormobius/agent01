/**
 * Lightweight markdown → HTML renderer.
 * Supports: headings, bold, italic, strikethrough, code blocks, inline code,
 * links, images, lists (ordered + unordered), blockquotes, horizontal rules, tables.
 *
 * No dependencies. Returns sanitized HTML (no raw script injection).
 */

/** Escape HTML entities to prevent XSS */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Process inline markdown: bold, italic, code, links, images, strikethrough */
function inline(text: string): string {
  let s = esc(text);

  // Inline code (must be first to protect content inside backticks)
  s = s.replace(/`([^`]+?)`/g, '<code class="md-inline-code">$1</code>');

  // Images: ![alt](url)
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="md-img" />',
  );

  // Links: [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>',
  );

  // Bold + italic: ***text*** or ___text___
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");

  // Bold: **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");

  return s;
}

export function renderMarkdown(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang ... ```
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` data-lang="${esc(lang)}"` : "";
      out.push(
        `<pre class="md-code-block"${langAttr}><code>${esc(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      out.push('<hr class="md-hr" />');
      i++;
      continue;
    }

    // Heading: # ... ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level} class="md-h${level}">${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote: > ...
    if (line.trimStart().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("> ")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="md-blockquote">${quoteLines.map(inline).join("<br/>")}</blockquote>`,
      );
      continue;
    }

    // Table: | ... | ... |
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?\s*$/.test(lines[i + 1])) {
      const headerCells = line.split("|").map((c) => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length === 0) break;
        rows.push(cells);
        i++;
      }
      let table = '<table class="md-table"><thead><tr>';
      for (const h of headerCells) table += `<th>${inline(h)}</th>`;
      table += "</tr></thead><tbody>";
      for (const row of rows) {
        table += "<tr>";
        for (let c = 0; c < headerCells.length; c++) {
          table += `<td>${inline(row[c] ?? "")}</td>`;
        }
        table += "</tr>";
      }
      table += "</tbody></table>";
      out.push(table);
      continue;
    }

    // Unordered list: - or * or +
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(
        `<ul class="md-ul">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    // Ordered list: 1. 2. etc.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol class="md-ol">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === "") {
      out.push("");
      i++;
      continue;
    }

    // Paragraph: collect contiguous non-empty lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].trimStart().startsWith("> ") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p class="md-p">${paraLines.map(inline).join("<br/>")}</p>`);
    }
  }

  return out.join("\n");
}
