"""Export the story bible + entire content pool as a single self-contained HTML page.

Usage:
    python -m scripts.export_site                        # writes world_export.html
    python -m scripts.export_site --out path/to/out.html
    python -m scripts.export_site --bible ingestion/chapter1_bible.md
"""

import argparse
import html
import json
import re
import sys
from pathlib import Path

from ingestion.world_parser import parse
from storage.content_store import fetch

# ── helpers ───────────────────────────────────────────────────────────────────

def esc(s) -> str:
    return html.escape(str(s or ""))

def md_to_html(text: str) -> str:
    """Minimal markdown → HTML for bible body text."""
    lines = text.split("\n")
    out = []
    buf = []

    def flush_buf():
        if buf:
            p = " ".join(buf).strip()
            if p:
                out.append(f"<p>{p}</p>")
            buf.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_buf()
            continue
        # inline bold + italic
        stripped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", stripped)
        stripped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", stripped)
        buf.append(stripped)

    flush_buf()
    return "\n".join(out)


def tier_label(item: dict) -> str:
    return f"r{item['revelation_tier']} · n{item['narrative_tier']} · p{item['power_tier']}"


def status_badge(item: dict) -> str:
    if item.get("approved"):
        return '<span class="badge-approved">approved</span>'
    return '<span class="badge-pending">pending</span>'


def gateStr(requires: dict) -> str:
    r = requires or {}
    parts = []
    if r.get("min_standing") is not None:
        parts.append(f"standing≥{r['min_standing']}")
    for k, v in (r.get("npc_flags") or {}).items():
        parts.append(f"npc:{k}={v}")
    for k, v in (r.get("facts") or {}).items():
        parts.append(f"{k}={v}")
    for it in (r.get("items") or []):
        parts.append(f"item:{it}")
    for f, n in (r.get("min_rep") or {}).items():
        parts.append(f"rep:{f}≥{n}")
    return " · ".join(parts)


def effectStr(effects: dict) -> str:
    e = effects or {}
    parts = []
    for k, v in (e.get("set_facts") or {}).items():
        parts.append(f"set {k}={v}")
    adj = e.get("adjust_standing")
    if adj:
        parts.append(f"standing {'+' if adj > 0 else ''}{adj}")
    for f, n in (e.get("adjust_rep") or {}).items():
        parts.append(f"rep {f} {'+' if n > 0 else ''}{n}")
    for k, v in (e.get("set_npc_flags") or {}).items():
        parts.append(f"npc:{k}={v}")
    if e.get("give_items"):
        parts.append(f"gives {len(e['give_items'])} item(s)")
    if e.get("end"):
        parts.append("END")
    return " · ".join(parts)


def compute_produces(dialogue: dict) -> list[str]:
    """Scan all dialogue choices for effects and collect what they produce."""
    parts = []
    seen = set()
    for node in (dialogue or {}).get("nodes", {}).values():
        for ch in (node.get("choices") or []):
            e = ch.get("effects") or {}
            for k in (e.get("set_facts") or {}):
                tok = f"sets {k}"
                if tok not in seen:
                    parts.append(tok); seen.add(tok)
            for f in (e.get("adjust_rep") or {}):
                tok = f"+rep {f}"
                if tok not in seen:
                    parts.append(tok); seen.add(tok)
            for k in (e.get("set_npc_flags") or {}):
                tok = f"npc:{k}"
                if tok not in seen:
                    parts.append(tok); seen.add(tok)
            if e.get("give_items"):
                tok = "gives item"
                if tok not in seen:
                    parts.append(tok); seen.add(tok)
    return parts


def render_dialogue(dialogue: dict) -> str:
    if not dialogue or not dialogue.get("nodes"):
        return ""
    nodes = dialogue["nodes"]
    start = dialogue.get("start") or next(iter(nodes))
    rows = []
    for nid, node in nodes.items():
        is_start = nid == start
        choices_html = ""
        for ch in (node.get("choices") or []):
            g = esc(gateStr(ch.get("requires")))
            ef = esc(effectStr(ch.get("effects")))
            gt = f'<span class="goto">→ {esc(ch.get("goto",""))}</span>' if ch.get("goto") else ""
            choices_html += (
                f'<div class="tchoice">'
                f'<span class="ctext">{esc(ch.get("text") or ch.get("id",""))}</span>'
                + (f'<span class="ggate">needs {g}</span>' if g else "")
                + (f'<span class="geffect">{ef}</span>' if ef else "")
                + gt
                + "</div>"
            )
        if not choices_html:
            choices_html = '<div class="tchoice muted">no choices</div>'
        rows.append(
            f'<div class="tnode{"  start" if is_start else ""}">'
            f'<div class="tnode-head"><span class="nid">{esc(nid)}{"  ★" if is_start else ""}</span></div>'
            f'<div class="says">"{esc(node.get("says",""))}"</div>'
            f'{choices_html}</div>'
        )
    return (
        '<details class="tree-wrap" open>'
        '<summary class="tree-summary">dialogue tree</summary>'
        '<div class="tree">' + "".join(rows) + "</div>"
        "</details>"
    )


def render_card(item: dict) -> str:
    c = item.get("content") or {}
    name = esc(c.get("name") or c.get("response") or "(unnamed)")
    desc = esc(c.get("description") or c.get("response") or "")
    tags = esc(", ".join(item.get("tags") or []) or "—")
    refs = esc(", ".join(item.get("world_refs") or []) or "—")
    gate = esc(gateStr(item.get("requires")))
    needs_review = item.get("needs_review")

    dialogue = c.get("dialogue") if item["type"] == "npc" else None
    dialogue_html = render_dialogue(dialogue)

    produces = compute_produces(dialogue) if dialogue else []
    produces_html = ""
    if produces:
        toks = "".join(f'<span class="ptok">{esc(p)}</span>' for p in produces)
        produces_html = f'<div class="produces"><span class="plabel">produces</span> {toks}</div>'

    json_html = (
        '<details class="json-wrap">'
        '<summary class="json-summary">json</summary>'
        f'<pre class="json-pre">{esc(json.dumps(c, indent=2))}</pre>'
        "</details>"
    )

    return (
        f'<div class="card" data-type="{esc(item["type"])}" '
        f'data-name="{name.lower()}" data-tags="{tags.lower()}">'
        f'<div class="card-head">'
        f'<span class="badge">{esc(item["type"])}</span>'
        f'<span class="tiers">{esc(tier_label(item))}</span>'
        f'{status_badge(item)}'
        + ('<span class="flag">needs review</span>' if needs_review else "")
        + f'</div>'
        f'<h3 class="card-name">{name}</h3>'
        f'<p class="card-desc">{desc}</p>'
        f'<div class="meta">'
        f'<div><strong>tags:</strong> {tags}</div>'
        f'<div><strong>refs:</strong> {refs}</div>'
        + (f'<div><strong>requires:</strong> <span class="gate-str">{gate}</span></div>' if gate else "")
        + f'</div>'
        + produces_html
        + dialogue_html
        + json_html
        + "</div>"
    )


# ── bible rendering ────────────────────────────────────────────────────────────

def render_bible(bible_path: str) -> str:
    bible = parse(bible_path)
    raw = Path(bible_path).read_text()

    # Split the raw markdown at each ## heading to build collapsible sections.
    # We split on any line that starts with ## (not ###).
    chunks = re.split(r"(?m)^(## .+)$", raw)
    # chunks[0] is the pre-amble (title + overview paragraph); rest alternate
    # heading / body pairs.

    sections_html = []

    # preamble (title + intro)
    preamble = chunks[0].strip()
    if preamble:
        preamble_lines = preamble.splitlines()
        title = preamble_lines[0].lstrip("# ").strip() if preamble_lines else ""
        body = "\n".join(preamble_lines[1:]).strip()
        sections_html.append(
            f'<details open class="bible-section">'
            f'<summary>{esc(title) or "Overview"}</summary>'
            f'<div class="bible-body">{md_to_html(body)}</div>'
            f"</details>"
        )

    i = 1
    while i < len(chunks) - 1:
        heading = chunks[i].lstrip("#").strip()
        body = chunks[i + 1].strip()
        sections_html.append(
            f'<details class="bible-section">'
            f'<summary>{esc(heading)}</summary>'
            f'<div class="bible-body">{md_to_html(body)}</div>'
            f"</details>"
        )
        i += 2

    return "\n".join(sections_html)


# ── main ──────────────────────────────────────────────────────────────────────

CSS = """
:root {
  --bg: #14161a;
  --panel: #1d2128;
  --ink: #e6e9ef;
  --muted: #8b94a3;
  --accent: #6ee7b7;
  --line: #2b313b;
  --warn: #fbbf24;
  --info: #7dd3fc;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 15px/1.6 ui-monospace, "SF Mono", Menlo, monospace;
  background: var(--bg);
  color: var(--ink);
}
a { color: var(--accent); }

/* header */
header {
  padding: 1.25rem 2rem;
  border-bottom: 1px solid var(--line);
  display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 1rem;
}
header h1 { margin: 0; font-size: 1.15rem; }
.stats { color: var(--muted); font-size: 0.82rem; }
.stats span { margin-left: 0.75rem; }

/* layout */
main { max-width: 1200px; margin: 0 auto; padding: 2rem; display: grid; gap: 2.5rem; }

/* bible */
.section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin: 0 0 0.75rem; }
.bible-sections { display: grid; gap: 0.5rem; }
.bible-section {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.bible-section > summary {
  padding: 0.7rem 1rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  list-style: none;
  display: flex; align-items: center; gap: 0.5rem;
  user-select: none;
}
.bible-section > summary::before { content: "▶"; font-size: 0.65rem; color: var(--muted); transition: transform 0.15s; }
.bible-section[open] > summary::before { transform: rotate(90deg); }
.bible-section > summary::-webkit-details-marker { display: none; }
.bible-body { padding: 0.25rem 1rem 1rem; border-top: 1px solid var(--line); }
.bible-body p { margin: 0.6rem 0; color: var(--ink); line-height: 1.65; }
.bible-body strong { color: var(--accent); }

/* pool controls */
.pool-controls {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;
}
.pool-controls h2 { margin: 0; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.filter {
  border: 1px solid var(--line); border-radius: 999px;
  background: transparent; color: var(--muted);
  padding: 0.2rem 0.75rem; font: inherit; font-size: 0.78rem;
  cursor: pointer; transition: all 0.1s;
}
.filter:hover { border-color: var(--accent); color: var(--ink); }
.filter.active { background: var(--accent); border-color: var(--accent); color: #06281d; font-weight: 700; }
.search-box {
  margin-left: auto;
  background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-radius: 6px;
  padding: 0.3rem 0.75rem; font: inherit; font-size: 0.82rem;
  width: 220px;
}
.search-box:focus { outline: none; border-color: var(--accent); }
.pool-count { color: var(--muted); font-size: 0.8rem; }

/* cards grid */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 1.1rem 1.2rem;
}
.card.hidden { display: none; }
.card-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
.badge {
  background: #283042; color: var(--accent);
  padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.75rem;
}
.tiers { color: var(--muted); font-size: 0.78rem; }
.badge-approved { background: #1a2f22; color: var(--accent); padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.72rem; }
.badge-pending  { background: #3a2a12; color: var(--warn);  padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.72rem; }
.card-name { margin: 0 0 0.4rem; font-size: 1.05rem; }
.card-desc { color: var(--ink); margin: 0 0 0.75rem; font-size: 0.88rem; line-height: 1.55; }
.meta { font-size: 0.8rem; color: var(--muted); display: grid; gap: 0.25rem; }
.meta strong { color: var(--ink); }

/* produces */
.produces { margin: 0.6rem 0; font-size: 0.82rem; }
.produces .plabel { color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.72rem; margin-right: 0.3rem; }
.produces .ptok { color: var(--info); border: 1px solid #1d3038; border-radius: 999px; padding: 0.05rem 0.5rem; margin-right: 0.25rem; }

.gate-str { color: var(--warn); }

/* dialogue tree */
.tree-wrap { margin-top: 0.75rem; }
.tree-summary { cursor: pointer; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
.tree { margin-top: 0.5rem; }
.tnode { border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
.tnode.start { border-left-color: var(--accent); }
.tnode-head .nid { color: var(--accent); font-weight: 600; font-size: 0.85rem; }
.tnode .says { color: var(--ink); font-style: italic; margin: 0.3rem 0 0.4rem; font-size: 0.85rem; }
.tchoice { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; padding: 0.25rem 0; border-top: 1px dashed var(--line); font-size: 0.8rem; }
.tchoice.muted { color: var(--muted); font-style: italic; }
.tchoice .ctext { color: var(--ink); }
.tchoice .ggate { color: var(--warn); }
.tchoice .geffect { color: var(--info); }
.tchoice .goto { color: var(--muted); }

/* json block */
.json-wrap { margin-top: 0.75rem; }
.json-summary { cursor: pointer; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
.json-pre {
  margin: 0.4rem 0 0;
  padding: 0.75rem;
  background: #0f1115;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: 12px/1.5 ui-monospace, Menlo, monospace;
  color: var(--muted);
  overflow-x: auto;
  white-space: pre;
}
"""

JS = """
const cards = Array.from(document.querySelectorAll('.card'));
const countEl = document.getElementById('pool-count');
let activeType = '', searchVal = '';

function filterCards() {
  let shown = 0;
  for (const c of cards) {
    const typeMatch = !activeType || c.dataset.type === activeType;
    const q = searchVal.toLowerCase();
    const textMatch = !q ||
      c.dataset.name.includes(q) ||
      c.dataset.tags.includes(q) ||
      c.dataset.type.includes(q);
    const vis = typeMatch && textMatch;
    c.classList.toggle('hidden', !vis);
    if (vis) shown++;
  }
  countEl.textContent = shown + ' item' + (shown !== 1 ? 's' : '');
}

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;
    filterCards();
  });
});

document.getElementById('search').addEventListener('input', e => {
  searchVal = e.target.value.trim();
  filterCards();
});
"""


def build_html(bible_path: str, items: list[dict]) -> str:
    bible_html = render_bible(bible_path)
    cards_html = "\n".join(render_card(it) for it in items)

    types = sorted({it["type"] for it in items})
    type_buttons = '<button class="filter active" data-type="">all</button>' + "".join(
        f'<button class="filter" data-type="{esc(t)}">{esc(t)}</button>' for t in types
    )

    approved = sum(1 for it in items if it.get("approved"))
    pending = len(items) - approved
    stats = (
        f"<span>{len(items)} items</span>"
        f"<span>{approved} approved</span>"
        f"<span>{pending} pending</span>"
    )

    # read title from bible file first line
    first_line = Path(bible_path).read_text().splitlines()[0].lstrip("# ").strip()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(first_line)}</title>
  <style>{CSS}</style>
</head>
<body>
<header>
  <h1>{esc(first_line)}</h1>
  <div class="stats">{stats}</div>
</header>
<main>
  <section>
    <p class="section-title">Story Bible</p>
    <div class="bible-sections">
{bible_html}
    </div>
  </section>

  <section>
    <div class="pool-controls">
      <h2>Content Pool</h2>
      <div class="filters">{type_buttons}</div>
      <input class="search-box" id="search" placeholder="search name / type / tags…" spellcheck="false">
      <span class="pool-count" id="pool-count">{len(items)} items</span>
    </div>
    <div class="grid">
{cards_html}
    </div>
  </section>
</main>
<script>{JS}</script>
</body>
</html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bible", default="ingestion/chapter1_bible.md", help="world bible markdown path")
    ap.add_argument("--out", default="export/world_export.html", help="output HTML file path")
    args = ap.parse_args()

    print(f"reading bible from {args.bible}…")
    items = fetch(
        """
        SELECT id, type, content, tags, world_refs, requires,
               revelation_tier, narrative_tier, power_tier,
               needs_review, approved, created_at
        FROM content_items
        WHERE status = 'active'
        ORDER BY type, revelation_tier, narrative_tier
        """
    )
    print(f"loaded {len(items)} content items")

    html_out = build_html(args.bible, items)
    Path(args.out).write_text(html_out, encoding="utf-8")
    size_kb = Path(args.out).stat().st_size // 1024
    print(f"wrote {args.out} ({size_kb} KB)")


if __name__ == "__main__":
    main()
