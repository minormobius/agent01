"""Exhaustive dialogue-tree validator: defect detection + false-positive guards."""

from runtime.dialogue_validate import errors, validate_tree, warnings

CODES = lambda issues: {i.code for i in issues}  # noqa: E731


def _tree(nodes, start="g"):
    return {"start": start, "nodes": nodes}


def test_valid_tree_is_clean():
    tree = _tree({
        "g": {"says": "hi", "choices": [
            {"id": "a", "text": "warm", "effects": {"adjust_standing": 1}, "goto": "g"},
            {"id": "b", "text": "deep", "requires": {"min_standing": 1}, "goto": "deep"}]},
        "deep": {"says": "secret", "choices": [
            {"id": "z", "text": "bye", "effects": {"end": True}, "goto": "g"}]},
    })
    assert validate_tree(tree) == []


def test_empty_tree_errors():
    assert CODES(validate_tree(None)) == {"empty"}
    assert CODES(validate_tree({"start": "g", "nodes": {}})) == {"empty"}


def test_missing_start_errors():
    tree = _tree({"g": {"says": "x", "choices": []}}, start="nope")
    assert CODES(validate_tree(tree)) == {"missing_start"}


def test_missing_goto_is_an_error():
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "a", "text": "go", "goto": "ghost"}]}})
    iss = validate_tree(tree)
    assert any(i.code == "missing_goto" and i.choice == "a" for i in errors(iss))


def test_duplicate_choice_id_is_an_error():
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "a", "text": "one", "goto": "g"},
        {"id": "a", "text": "two", "goto": "g"}]}})
    assert "duplicate_choice_id" in CODES(errors(tree := validate_tree(tree)))


def test_unreachable_node_is_warned():
    tree = _tree({
        "g": {"says": "x", "choices": [{"id": "a", "text": "loop", "goto": "g"}]},
        "orphan": {"says": "nobody comes here", "choices": [
            {"id": "z", "text": "bye", "effects": {"end": True}}]},
    })
    iss = validate_tree(tree)
    assert any(i.code == "unreachable_node" and i.node == "orphan" for i in warnings(iss))


def test_choice_gate_that_never_opens_is_warned():
    # standing can never exceed 0 here, so the min_standing:3 choice is dead.
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "a", "text": "stay", "goto": "g"},
        {"id": "locked", "text": "needs trust", "requires": {"min_standing": 3}, "goto": "g"}]}})
    iss = validate_tree(tree)
    assert any(i.code == "unreachable_choice" and i.choice == "locked" for i in warnings(iss))


def test_reachable_standing_gate_is_not_flagged():
    # standing CAN reach 2 (two +1 choices), so the gated choice is fine.
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "a", "text": "warm", "effects": {"adjust_standing": 1}, "goto": "g"},
        {"id": "deep", "text": "trust", "requires": {"min_standing": 2}, "effects": {"end": True}}]}})
    assert "unreachable_choice" not in CODES(validate_tree(tree))


def test_npc_flag_gate_reachable_after_set_is_not_flagged():
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "ask", "text": "ask", "effects": {"set_npc_flags": {"asked": True}}, "goto": "g"},
        {"id": "follow", "text": "[recalled]", "requires": {"npc_flags": {"asked": True}},
         "effects": {"end": True}}]}})
    assert "unreachable_choice" not in CODES(validate_tree(tree))


def test_external_gates_are_not_treated_as_unreachable():
    # items/facts/min_rep are the player's external state — a valid gate, not a defect.
    tree = _tree({"g": {"says": "x", "choices": [
        {"id": "show", "text": "present seal", "requires": {"items": ["seal"]}, "goto": "g"},
        {"id": "rep", "text": "[keepers]", "requires": {"min_rep": {"keepers": 2}}, "goto": "g"}]}})
    assert validate_tree(tree) == []


def test_choiceless_node_is_a_stuck_warning():
    tree = _tree({
        "g": {"says": "x", "choices": [{"id": "a", "text": "go", "goto": "void"}]},
        "void": {"says": "nothing to say", "choices": []},
    })
    iss = validate_tree(tree)
    assert any(i.code == "stuck_node" and i.node == "void" for i in warnings(iss))
