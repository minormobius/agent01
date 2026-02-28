#!/usr/bin/env python3
"""
Export a LabGlass notebook from ATProto PDS as a publishable markdown memo.

Fetches the notebook envelope and all cell records, then flattens them into
a frontmattered markdown article ready for publish-whtwnd.py. Figure blobs
already on PDS are referenced by their getBlob URLs — no re-upload needed.

Usage:
    # Export to stdout
    python3 scripts/export-notebook.py minomobi.bsky.social 3abc123def

    # Export to file (ready for publish-whtwnd.py)
    python3 scripts/export-notebook.py minomobi.bsky.social 3abc123def \
        -o time/entries/2026-02-28-phone-toss.md

    # Then publish as a WhiteWind blog entry:
    python3 scripts/publish-whtwnd.py time/entries/2026-02-28-phone-toss.md
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

BSKY_PUBLIC_API = "https://public.api.bsky.app"
NOTEBOOK_COLLECTION = "com.minomobi.labglass.notebook"
CELL_COLLECTION = "com.minomobi.labglass.cell"


# ── ATProto resolution (same pattern as publish-whtwnd.py) ──

def resolve_handle(handle):
    url = f"{BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle={handle}"
    with urlopen(Request(url), timeout=15) as resp:
        return json.loads(resp.read())["did"]


def resolve_pds(did):
    if did.startswith("did:plc:"):
        url = f"https://plc.directory/{did}"
    elif did.startswith("did:web:"):
        host = did.split(":")[-1]
        url = f"https://{host}/.well-known/did.json"
    else:
        raise ValueError(f"Unknown DID method: {did}")
    with urlopen(Request(url), timeout=15) as resp:
        doc = json.loads(resp.read())
    for svc in doc.get("service", []):
        if svc.get("type") == "AtprotoPersonalDataServer":
            return svc["serviceEndpoint"]
    raise ValueError(f"No PDS endpoint in DID doc for {did}")


def get_record(pds, did, collection, rkey):
    params = f"repo={did}&collection={collection}&rkey={rkey}"
    # Try public API first, fall back to PDS
    for base in [BSKY_PUBLIC_API, pds]:
        try:
            url = f"{base}/xrpc/com.atproto.repo.getRecord?{params}"
            with urlopen(Request(url), timeout=15) as resp:
                return json.loads(resp.read())
        except Exception:
            continue
    raise RuntimeError(f"Could not fetch record {collection}/{rkey} from {did}")


# ── Cell conversion ──

def blob_url(pds, did, blobref):
    """Construct a getBlob URL from a BlobRef."""
    cid = blobref["ref"]["$link"]
    return f"{pds}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}"


def cell_to_markdown(cell, did, pds):
    """Convert a single cell record to markdown sections."""
    ct = cell.get("cellType", "")
    source = cell.get("source", "")
    name = cell.get("name", "")
    text_out = cell.get("textOutput", "")

    if ct == "markdown":
        return source

    if ct == "sql":
        parts = [f"```sql\n{source}\n```"]
        if text_out:
            parts.append(format_text_output(text_out))
        return "\n\n".join(parts)

    if ct == "python":
        parts = [f"```python\n{source}\n```"]
        if text_out:
            parts.append(format_text_output(text_out))
        return "\n\n".join(parts)

    if ct == "viz":
        parts = []
        if cell.get("figureBlob"):
            url = blob_url(pds, did, cell["figureBlob"])
            caption = name or "Visualization"
            parts.append(f"![{caption}]({url})")
        if text_out:
            parts.append(format_text_output(text_out))
        return "\n\n".join(parts) if parts else ""

    if ct == "config":
        try:
            config = json.loads(source)
            formatted = json.dumps(config, indent=2)
        except (json.JSONDecodeError, TypeError):
            formatted = source
        label = name or "Sensor Configuration"
        return f"**{label}**\n\n```json\n{formatted}\n```"

    # Unknown cell type — include raw source
    return f"```\n{source}\n```"


def format_text_output(text):
    """Format cell text output. Detect TSV tables vs plain text."""
    lines = text.strip().split("\n")
    if len(lines) >= 2 and "\t" in lines[0]:
        return tsv_to_table(lines)
    return f"```\n{text.strip()}\n```"


def tsv_to_table(lines):
    """Convert tab-separated output to a markdown table."""
    rows = [line.split("\t") for line in lines]
    if not rows:
        return ""
    header = rows[0]
    divider = ["-" * max(3, len(h)) for h in header]
    md_rows = [" | ".join(header), " | ".join(divider)]
    for row in rows[1:]:
        # Pad short rows
        padded = row + [""] * (len(header) - len(row))
        md_rows.append(" | ".join(padded[:len(header)]))
    return "\n".join(md_rows)


# ── Main ──

def main():
    parser = argparse.ArgumentParser(
        description="Export a LabGlass notebook from ATProto PDS as publishable markdown.",
    )
    parser.add_argument("handle", help="ATProto handle (e.g. minomobi.bsky.social)")
    parser.add_argument("rkey", help="Notebook record key (TID)")
    parser.add_argument("-o", "--output", help="Output file path (default: stdout)")
    parser.add_argument("--subtitle", help="Override subtitle/byline")
    args = parser.parse_args()

    # Resolve identity
    print(f"Resolving {args.handle}...", file=sys.stderr)
    did = resolve_handle(args.handle)
    pds = resolve_pds(did)
    print(f"PDS: {pds}", file=sys.stderr)

    # Fetch notebook envelope
    print(f"Fetching notebook {args.rkey}...", file=sys.stderr)
    nb_record = get_record(pds, did, NOTEBOOK_COLLECTION, args.rkey)
    notebook = nb_record["value"]
    title = notebook.get("title", "Untitled Experiment")
    print(f"  Title: {title}", file=sys.stderr)

    # Fetch all cells
    cell_uris = notebook.get("cells", [])
    print(f"  Fetching {len(cell_uris)} cells...", file=sys.stderr)
    cells = []
    for uri in cell_uris:
        parts = uri.split("/")
        cell_rkey = parts[-1]
        cell_did = parts[2]
        try:
            rec = get_record(pds, cell_did, CELL_COLLECTION, cell_rkey)
            cells.append(rec["value"])
        except Exception as exc:
            print(f"  WARNING: Failed to fetch cell {uri}: {exc}", file=sys.stderr)
            cells.append({
                "cellType": "markdown",
                "source": f"*Cell failed to load: {uri}*",
                "position": 999,
            })

    # Sort by position
    cells.sort(key=lambda c: c.get("position", 0))

    # Count figures
    fig_count = sum(1 for c in cells if c.get("figureBlob"))
    print(f"  {len(cells)} cells loaded, {fig_count} with figures", file=sys.stderr)

    # Build frontmatter
    created = notebook.get("createdAt", datetime.now(timezone.utc).isoformat())
    subtitle = args.subtitle or "LabGlass Experimental Memo"
    lines = [
        "---",
        f'title: "{title}"',
        f'subtitle: "{subtitle}"',
        f'createdAt: "{created}"',
        'visibility: "public"',
        "---",
        "",
    ]

    # Description as epigraph
    desc = notebook.get("description", "")
    if desc:
        lines.append(f"> {desc}")
        lines.append("")

    # Tags
    tags = notebook.get("tags", [])
    if tags:
        lines.append(f"*Tags: {', '.join(tags)}*")
        lines.append("")

    # Convert cells
    for cell in cells:
        md = cell_to_markdown(cell, did, pds)
        if md:
            lines.append(md)
            lines.append("")

    output = "\n".join(lines)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"\nExported to {args.output}", file=sys.stderr)
        print(f"  Publish with: python3 scripts/publish-whtwnd.py {args.output}", file=sys.stderr)
    else:
        print(output)

    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
