#!/usr/bin/env python3
"""
Convert Mino Times HTML articles to markdown with WhiteWind frontmatter.
One-shot migration script — not part of the ongoing pipeline.

Usage:
    python3 scripts/html-to-md.py time/articles/2026-02-19-cheyava-falls.html
    python3 scripts/html-to-md.py time/articles/*.html
"""

import html
import os
import re
import sys


def extract_meta(text):
    """Extract title, byline, date, kicker from HTML article."""
    meta = {}

    # Title from <title> tag
    m = re.search(r'<title>([^<]+?)(?:\s*[—–-]\s*The Mino Times)?</title>', text)
    if m:
        meta['title'] = html.unescape(m.group(1)).strip()

    # Kicker
    m = re.search(r'<div class="kicker">([^<]+)</div>', text)
    if m:
        meta['kicker'] = html.unescape(m.group(1)).strip()

    # Byline
    m = re.search(r'<div class="byline">([^<]+)</div>', text)
    if m:
        meta['byline'] = html.unescape(m.group(1)).strip()

    # Date from byline or masthead
    m = re.search(r'(?:February|January|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}', meta.get('byline', ''))
    if m:
        meta['date_str'] = m.group(0)

    # Derive ISO date from filename or date string
    return meta


def extract_body(text):
    """Extract the article body HTML between article-body div and bibliography/footer."""
    # Find the article body content
    m = re.search(r'<div class="article-body"[^>]*>(.*?)</div>\s*(?:<!--\s*Bibliography|<div class="bibliography|<div style="border-top)', text, re.DOTALL)
    if m:
        return m.group(1).strip()

    # Fallback: grab everything inside <article> after byline
    m = re.search(r'<div class="article-body"[^>]*>(.*?)</div>\s*</article>', text, re.DOTALL)
    if m:
        return m.group(1).strip()

    return ""


def extract_bibliography(text):
    """Extract bibliography entries as a list of (id, html_content) tuples."""
    entries = []
    for m in re.finditer(r'<li id="(fn\d+)">(.*?)</li>', text, re.DOTALL):
        entries.append((m.group(1), m.group(2).strip()))
    return entries


def html_to_markdown(h):
    """Convert article body HTML to markdown."""
    s = h

    # Remove HTML comments
    s = re.sub(r'<!--.*?-->', '', s, flags=re.DOTALL)

    # Section headers
    s = re.sub(r'<div class="section-header"[^>]*>(.*?)</div>', r'\n## \1\n', s)

    # Footnote references: <a href="#fn1" class="fn">[1]</a> → [^1]
    s = re.sub(r'<a href="#fn(\d+)" class="fn">\[\d+\]</a>', r'[^\1]', s)

    # Links: <a href="url">text</a> → [text](url)
    # Handle links that may contain nested tags
    def replace_link(m):
        url = m.group(1)
        inner = m.group(2)
        # Strip inline styles from anchor
        inner = re.sub(r'<[^>]+>', '', inner)  # Remove nested tags temporarily
        inner = inner.strip()
        if not inner or inner == url:
            return url
        return f'[{inner}]({url})'

    s = re.sub(r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', replace_link, s, flags=re.DOTALL)

    # Bold: <strong> → **
    s = re.sub(r'<strong>(.*?)</strong>', r'**\1**', s, flags=re.DOTALL)

    # Italic: <em> → *
    s = re.sub(r'<em>(.*?)</em>', r'*\1*', s, flags=re.DOTALL)

    # Paragraphs
    s = re.sub(r'<p class="article-lead">(.*?)</p>', r'\1\n', s, flags=re.DOTALL)
    s = re.sub(r'<p>(.*?)</p>', r'\1\n', s, flags=re.DOTALL)

    # Tables — convert HTML tables to markdown
    def convert_table(m):
        table_html = m.group(0)
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)
        if not rows:
            return table_html
        md_rows = []
        for i, row in enumerate(rows):
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL)
            cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            md_rows.append('| ' + ' | '.join(cells) + ' |')
            if i == 0:
                md_rows.append('| ' + ' | '.join(['---'] * len(cells)) + ' |')
        return '\n' + '\n'.join(md_rows) + '\n'

    s = re.sub(r'<table[^>]*>.*?</table>', convert_table, s, flags=re.DOTALL)

    # Lists
    s = re.sub(r'<ul>(.*?)</ul>', lambda m: m.group(1), s, flags=re.DOTALL)
    s = re.sub(r'<ol>(.*?)</ol>', lambda m: m.group(1), s, flags=re.DOTALL)
    s = re.sub(r'<li>(.*?)</li>', r'- \1', s, flags=re.DOTALL)

    # Blockquotes
    s = re.sub(r'<blockquote>(.*?)</blockquote>', lambda m: '\n'.join('> ' + line for line in m.group(1).strip().split('\n')), s, flags=re.DOTALL)

    # Strip remaining tags (except sub/sup which markdown doesn't handle)
    s = re.sub(r'<(?!sub|/sub|sup|/sup)[^>]+>', '', s)

    # HTML entities
    s = html.unescape(s)

    # Strip leading whitespace from each line (from HTML indentation)
    s = '\n'.join(line.strip() for line in s.split('\n'))

    # Clean up whitespace
    s = re.sub(r'\n{3,}', '\n\n', s)
    s = s.strip()

    return s


def bibliography_to_markdown(entries):
    """Convert bibliography entries to markdown footnotes."""
    lines = []
    for fn_id, content in entries:
        num = fn_id.replace('fn', '')
        # Convert HTML in bibliography to markdown
        md = content
        md = re.sub(r'<a href="([^"]+)"[^>]*>(.*?)</a>', r'[\2](\1)', md)
        md = re.sub(r'<em>(.*?)</em>', r'*\1*', md)
        md = re.sub(r'<strong>(.*?)</strong>', r'**\1**', md)
        md = re.sub(r'<[^>]+>', '', md)
        md = html.unescape(md)
        lines.append(f'[^{num}]: {md.strip()}')
    return '\n\n'.join(lines)


def date_to_iso(date_str):
    """Convert 'February 19, 2026' to '2026-02-19T12:00:00.000Z'."""
    import datetime
    months = {'January': 1, 'February': 2, 'March': 3, 'April': 4,
              'May': 5, 'June': 6, 'July': 7, 'August': 8,
              'September': 9, 'October': 10, 'November': 11, 'December': 12}
    m = re.match(r'(\w+)\s+(\d+),\s+(\d{4})', date_str)
    if not m:
        return None
    month = months.get(m.group(1))
    day = int(m.group(2))
    year = int(m.group(3))
    return f"{year}-{month:02d}-{day:02d}T12:00:00.000Z"


def convert_file(html_path):
    """Convert a single HTML article to markdown."""
    with open(html_path, 'r', encoding='utf-8') as f:
        text = f.read()

    meta = extract_meta(text)
    body_html = extract_body(text)
    bib = extract_bibliography(text)

    body_md = html_to_markdown(body_html)
    bib_md = bibliography_to_markdown(bib) if bib else ""

    # Build frontmatter
    title = meta.get('title', os.path.basename(html_path))
    subtitle = meta.get('byline', '')
    iso_date = date_to_iso(meta.get('date_str', '')) if meta.get('date_str') else ''

    lines = ['---']
    lines.append(f'title: "{title}"')
    if subtitle:
        lines.append(f'subtitle: "{subtitle}"')
    if iso_date:
        lines.append(f'createdAt: "{iso_date}"')
    lines.append('visibility: "public"')
    lines.append('---')
    lines.append('')
    lines.append(body_md)

    if bib_md:
        lines.append('')
        lines.append('---')
        lines.append('')
        lines.append(bib_md)

    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: html-to-md.py <file.html> [file2.html ...]")
        sys.exit(1)

    for html_path in sys.argv[1:]:
        if not html_path.endswith('.html'):
            continue
        basename = os.path.basename(html_path).replace('.html', '.md')
        out_dir = os.path.join(os.path.dirname(os.path.dirname(html_path)), 'entries')
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, basename)

        print(f"Converting {html_path} → {out_path}")
        md = convert_file(html_path)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(md)


if __name__ == '__main__':
    main()
