"""Fast heuristic QA for generated content — no LLM call.

Replenishment items go live immediately (approved=true, needs_review=true), so the
only gate before they reach players is this cheap filter. It is intentionally loose:
trust the model mostly, catch the clear failures (empty/stub-thin items, verbatim
copies of the bible) and obvious duplicates within a batch. Deeper review is the
retroactive needs_review queue; deeper dedup is the (still-TODO) pool-wide pass.
"""

MIN_DESC_LEN = 30


def _norm(s) -> str:
    return (s or "").strip().lower()


def auto_qa(items: list[dict], bible: dict, *, seen_names: set[str] | None = None) -> list[dict]:
    """Return the subset of `items` that pass heuristic checks, deduped by name.

    seen_names — names the player has already encountered (lowercased); items
    reusing one are dropped so replenishment actually feels fresh.
    """
    bible_text = _norm(bible.get("markdown") or bible.get("raw_markdown"))
    blocked = set(seen_names or set())
    kept: list[dict] = []
    for item in items:
        name = _norm(item.get("name"))
        desc = _norm(item.get("description"))

        # Must have a real name and a non-trivial description.
        if not name or len(desc) < MIN_DESC_LEN:
            continue
        # Drop within-batch and already-seen duplicate names.
        if name in blocked:
            continue
        # Reject verbatim lifts from the bible (a copy, not a creation).
        if bible_text and desc[:50] in bible_text:
            continue

        blocked.add(name)
        kept.append(item)
    return kept
