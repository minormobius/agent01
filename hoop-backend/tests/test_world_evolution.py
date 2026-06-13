"""World evolution: in-place entity edits, holder notifications, fuzzy lookup, dedupe."""

import uuid

from storage.content_store import execute, fetch_one
from runtime.local_api import EvolveBody, api_entities, api_entity_evolve


def _tok() -> str:
    return uuid.uuid4().hex[:8]


# ── evolve_entity (in place, needs_review, notifies holders) ──────────────────

def test_enrich_appends_in_place_and_notifies_holder(new_player, make_content, place):
    cid = make_content(type="npc", name="Enrichy", description="Base description, long enough.")
    pid = new_player()
    place(pid, "medbay.keeper", cid, "npc")

    res = api_entity_evolve(cid, EvolveBody(change_kind="enrich", summary="rumor proved true", new_text="A NEW REVELATION."))
    assert res["ok"] and res["change_kind"] == "enrich" and res["notified"] == 1

    item = fetch_one("SELECT content, needs_review, status FROM content_items WHERE id = %s", (cid,))
    assert "A NEW REVELATION." in item["content"]["description"]
    assert item["content"]["description"].startswith("Base description")  # appended, not replaced
    assert item["needs_review"] is True and item["status"] == "active"  # same id, still live

    note = fetch_one(
        "SELECT type, payload FROM notifications WHERE player_id = %s ORDER BY created_at DESC LIMIT 1", (pid,)
    )
    assert note["type"] == "entity_changed"
    assert note["payload"]["added"] == "A NEW REVELATION."
    assert note["payload"]["entity"] == "Enrichy"


def test_regen_replaces_description(make_content):
    cid = make_content(type="npc", name="Regeny", description="The old self.")
    api_entity_evolve(cid, EvolveBody(change_kind="regen", summary="reborn", new_text="An entirely new self."))
    desc = fetch_one("SELECT content FROM content_items WHERE id = %s", (cid,))["content"]["description"]
    assert desc == "An entirely new self."


def test_retire_sets_status(make_content):
    cid = make_content(type="npc", name="Retiry")
    api_entity_evolve(cid, EvolveBody(change_kind="retire", summary="gone"))
    assert fetch_one("SELECT status FROM content_items WHERE id = %s", (cid,))["status"] == "retired"


def test_evolve_canonizes_source_drift(make_content):
    cid = make_content(type="npc", name="Driftly")
    drift = fetch_one(
        "INSERT INTO collective_drift (type, content, player_count) VALUES ('rumor', %s, 2) RETURNING id",
        (f"a belief about Driftly {_tok()}",),
    )
    api_entity_evolve(cid, EvolveBody(change_kind="enrich", summary="s", new_text="x.", drift_id=str(drift["id"])))
    assert fetch_one("SELECT status FROM collective_drift WHERE id = %s", (drift["id"],))["status"] == "canonized"
    execute("DELETE FROM collective_drift WHERE id = %s", (drift["id"],))


def test_bad_change_kind_is_rejected(make_content):
    cid = make_content(type="npc")
    assert "error" in api_entity_evolve(cid, EvolveBody(change_kind="explode", summary="s"))


def test_non_holders_not_notified(new_player, make_content, place):
    cid = make_content(type="npc", name="Sharedy")
    holder, bystander = new_player(), new_player()
    place(holder, "medbay.keeper", cid, "npc")
    res = api_entity_evolve(cid, EvolveBody(change_kind="enrich", summary="s", new_text="y."))
    assert res["notified"] == 1
    assert fetch_one("SELECT count(*) n FROM notifications WHERE player_id = %s", (bystander,))["n"] == 0


# ── fuzzy lookup (the duplicate-prevention fix) ───────────────────────────────

def test_fuzzy_lookup_matches_across_apostrophe_variant(make_content):
    tok = _tok()
    curly = f"Zybq{chr(0x2019)}s Relic {tok}"     # curly apostrophe ’
    make_content(type="item", name=curly)
    hits = api_entities(q=f"Zybq's Relic {tok}")    # straight apostrophe '
    names = {h["name"] for h in hits}
    assert curly in names
    top = hits[0]
    assert top["name"] == curly and top["sim"] >= 0.5


# ── dedupe ────────────────────────────────────────────────────────────────────

def test_dedupe_merges_normalized_names_and_repoints(new_player, make_content, place):
    from scripts.dedupe_pool import _norm, apply_plan, find_groups

    tok = _tok()
    keep = make_content(type="item", name=f"Wodget {tok}")     # created first -> survivor
    dup = make_content(type="item", name=f"wodget  {tok}!!")   # normalizes the same
    pid = new_player()
    place(pid, "store.shelf.a", dup, "item")                   # placement on the dup

    key = ("item", _norm(f"Wodget {tok}"))
    groups = find_groups()
    assert key in groups and len(groups[key]) == 2

    plan = [(groups[key][0]["id"], [r["id"] for r in groups[key][1:]])]
    repointed, retired = apply_plan(plan)
    assert repointed == 1 and retired == 1

    bound = fetch_one(
        "SELECT content_item_id FROM player_placements WHERE player_id = %s AND feature_key = 'store.shelf.a'", (pid,)
    )
    assert str(bound["content_item_id"]) == keep                # repointed to survivor
    assert fetch_one("SELECT status FROM content_items WHERE id = %s", (dup,))["status"] == "retired"
