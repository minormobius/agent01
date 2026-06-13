"""Markdown world bible -> structured dict + section index.

Walks the heading hierarchy (#, ##, ###) and emits one section per heading with
a dotted `section_path` (e.g. "factions.the-quiet"). Tags are inferred cheaply:
slugged words from the heading plus capitalized proper nouns found in the body.
Good enough for the `&&` tag-overlap operator used downstream.
"""

import re
import sys

# Words that get capitalized at sentence start but aren't proper nouns.
_STOPWORDS = {
    "the", "they", "a", "an", "and", "but", "or", "nobody", "everyone", "things",
    "some", "no", "there", "what", "you", "your", "their", "this", "that", "it",
    "level", "levels", "current", "keeper", "wayfarer",
}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _keywords(text: str, limit: int = 5) -> list[str]:
    """Salient lowercase content words (length >= 5, not stopwords), by frequency."""
    counts: dict[str, int] = {}
    for w in re.findall(r"[a-z]{5,}", text.lower()):
        if w in _STOPWORDS:
            continue
        counts[w] = counts.get(w, 0) + 1
    ranked = sorted(counts, key=lambda w: (-counts[w], w))
    return ranked[:limit]


def _proper_nouns(text: str) -> list[str]:
    """Capitalized words not at sentence start — a loose proper-noun heuristic."""
    nouns = set()
    # Reset 'sentence start' after . ! ? or newline.
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        words = sentence.split()
        for i, w in enumerate(words):
            bare = re.sub(r"[^A-Za-z]", "", w)
            if i == 0 or not bare or not bare[0].isupper():
                continue
            if bare.lower() in _STOPWORDS:
                continue
            nouns.add(bare.lower())
    return sorted(nouns)


def parse(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return parse_markdown(f.read())


def parse_markdown(raw: str) -> dict:
    title = None
    sections: dict[str, dict] = {}
    # Stack of (level, slug) tracking the current heading ancestry.
    stack: list[tuple[int, str]] = []
    cur_path: str | None = None
    buf: list[str] = []

    def flush():
        if cur_path is not None:
            sections[cur_path]["text"] = "\n".join(buf).strip()

    for line in raw.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not m:
            buf.append(line)
            continue

        flush()
        level = len(m.group(1))
        heading = m.group(2).strip()

        if level == 1 and title is None:
            title = heading
            # The H1 body becomes the "overview" section.
            stack = []
            cur_path = "overview"
            sections[cur_path] = {"text": "", "tags": ["overview"], "parent": None}
            buf = []
            continue

        # Pop deeper-or-equal headings off the stack.
        while stack and stack[-1][0] >= level:
            stack.pop()
        slug = _slug(heading)
        parent = stack[-1][1] if stack else None
        path_key = f"{parent}.{slug}" if parent else slug
        stack.append((level, path_key))

        heading_tags = [t for t in heading.lower().split() if t not in _STOPWORDS and len(t) > 2]
        sections[path_key] = {
            "text": "",
            "tags": heading_tags,
            "parent": parent,
        }
        cur_path = path_key
        buf = []

    flush()

    # Enrich tags with proper nouns + salient keywords from each section body.
    for sec in sections.values():
        extra = set(_proper_nouns(sec["text"])) | set(_keywords(sec["text"]))
        sec["tags"] = sorted(set(sec["tags"]) | extra)

    # Roll child tags up into container sections (e.g. "factions" inherits from
    # its faction subsections) so headers with empty bodies still carry signal.
    for path_key, sec in sections.items():
        child_tags: set[str] = set()
        for other in sections.values():
            if other["parent"] == path_key:
                child_tags.update(other["tags"])
        sec["tags"] = sorted(set(sec["tags"]) | child_tags)

    return {"title": title, "sections": sections, "raw_markdown": raw}


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "prototype/tiny_world.md"
    bible = parse(path)
    print(f"title: {bible['title']}")
    print(f"sections: {len(bible['sections'])}")
    for p, s in bible["sections"].items():
        print(f"  {p:30s} tags={s['tags']}")
