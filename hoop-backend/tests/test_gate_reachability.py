"""Pool-wide gate reachability: closure fixpoint + orphan/gated diagnosis (pure core)."""

from runtime.gate_reachability import Producer, analyze, compute_closure

CODES = lambda iss: {i.code for i in iss}  # noqa: E731


def test_unproduced_fact_is_an_orphan_error():
    iss = analyze(producers=[], consumers=[("lore X", {"facts": {"flag.opened_hatch": True}})])
    assert any(i.code == "orphan_fact" and "opened_hatch" in i.message for i in iss)


def test_satisfiable_gate_is_clean():
    prods = [Producer(label="dlg sets it", facts=(("flag.met", True),))]
    iss = analyze(prods, [("lore", {"facts": {"flag.met": True}})])
    assert iss == []


def test_closure_chains_producers():
    # take an item -> unlocks a dialogue that sets a fact -> a lore gate on that fact opens.
    prods = [
        Producer(label="take seal", items=("seal",)),
        Producer(label="npc gate", requires={"items": ["seal"]}, facts=(("flag.shown", True),)),
    ]
    cl = compute_closure(prods)
    assert "seal" in cl.items and ("flag.shown", True) in cl.facts
    assert analyze(prods, [("lore", {"facts": {"flag.shown": True}})]) == []


def test_producer_behind_a_dead_gate_yields_gated_warning():
    # 'flag.deep' is produced, but only by a choice gated on a fact nothing sets.
    prods = [Producer(label="dead branch", requires={"facts": {"flag.never": True}},
                      facts=(("flag.deep", True),))]
    iss = analyze(prods, [("lore", {"facts": {"flag.deep": True}})])
    assert CODES(iss) == {"gated_fact"}   # exists in universe, not in closure


def test_orphan_item_and_rep():
    iss = analyze([], [
        ("npc choice", {"items": ["ghost-key"]}),
        ("merchant", {"min_rep": {"smugglers": 3}}),
    ])
    assert CODES(iss) == {"orphan_item", "orphan_rep"}


def test_min_rep_magnitude_is_relaxed():
    # any positive producer of the faction satisfies any min_rep threshold.
    prods = [Producer(label="favor", reps=("keepers",))]
    assert analyze(prods, [("gate", {"min_rep": {"keepers": 99}})]) == []


def test_min_rep_zero_is_not_an_orphan():
    # rep starts at 0, so min_rep:0 is satisfied by default — no producer required.
    assert analyze([], [("warden", {"min_rep": {"keepers": 0}})]) == []
    # but a positive threshold with no producer is still an orphan.
    assert {i.code for i in analyze([], [("x", {"min_rep": {"keepers": 1}})])} == {"orphan_rep"}


def test_fact_value_mismatch_is_gated_not_orphan():
    # the key IS produced, just never to the value the gate wants.
    prods = [Producer(label="sets false", facts=(("flag.x", False),))]
    iss = analyze(prods, [("gate", {"facts": {"flag.x": True}})])
    assert CODES(iss) == {"gated_fact"}


def test_item_tag_token_satisfies_gate():
    # gates match items by name OR tag (lowercased), like inventory_tokens.
    prods = [Producer(label="keycard item", items=("blue keycard", "keycard"))]
    assert analyze(prods, [("door", {"items": ["keycard"]})]) == []
