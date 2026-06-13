"""Model-based / stateful property test of the player verbs (Hypothesis).

Where the playtester's monkey fires random actions and checks a couple of invariants,
this keeps a full *reference model* of player state beside the real system: every
generated action (take / equip / unequip / talk+choose) is applied to both the model
and the live API, and we assert they agree. Hypothesis explores long action sequences
and SHRINKS any failure to a minimal reproducer (the QuickCheck/PropEr lineage). This
is the model-based half of the testing story; the dialogue/gate validators are the
model-checking half.

Shared content (two equippable items in different slots + an NPC whose tree gates a
choice on standing and another on a held item) is seeded once and cleaned at exit; each
example runs as a fresh throwaway player and tears itself down. Stubbed LLM, no llama.
"""

import atexit
import uuid

from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, precondition, rule

from fastapi.testclient import TestClient

from runtime.equipment import BASE_ATK, BASE_DEF, BASE_HP
from runtime.local_api import app
from storage.content_store import execute, insert_content_item

KNIFE = "Stateful Sigil-Knife"
VEST = "Stateful Plated Vest"
KNIFE_MECH = {"slot": "hand", "stats": {"atk": 3, "def": 1}}
VEST_MECH = {"slot": "body", "stats": {"hp": 5, "def": 2}}
ITEM_FEATURES = {"store.shelf.a": KNIFE, "store.shelf.b": VEST}
NPC_FEATURE = "medbay.keeper"

# The NPC tree, known to the model so it can predict visible choices exactly.
TREE = {
    "start": "greet",
    "nodes": {
        "greet": {"says": "Well?", "choices": [
            {"id": "warm", "text": "A quiet word.",
             "effects": {"adjust_standing": 1, "set_facts": {"flag.warmed": True}}, "goto": "greet"},
            {"id": "trust", "text": "[Trusted]", "requires": {"min_standing": 1},
             "effects": {"adjust_standing": 1}, "goto": "secret"},
            {"id": "show", "text": "[Knife]", "requires": {"items": [KNIFE.lower()]},
             "effects": {"set_facts": {"flag.shown": True}}, "goto": "greet"},
        ]},
        "secret": {"says": "Below seven, something breathes.", "choices": [
            {"id": "bye", "text": "Leave.", "effects": {"end": True}, "goto": "greet"}]},
    },
}

_SEED: dict = {}


def _ensure_seed() -> dict:
    if _SEED:
        return _SEED
    knife = insert_content_item({"type": "item", "content": {
        "name": KNIFE, "description": "x" * 30, "mechanics": KNIFE_MECH}, "approved": True})
    vest = insert_content_item({"type": "item", "content": {
        "name": VEST, "description": "x" * 30, "mechanics": VEST_MECH}, "approved": True})
    npc = insert_content_item({"type": "npc", "content": {
        "name": "Stateful Keeper", "description": "x" * 30, "dialogue": TREE}, "approved": True})
    _SEED.update(knife=knife, vest=vest, npc=npc, by_feature={
        "store.shelf.a": knife, "store.shelf.b": vest})
    atexit.register(_cleanup_seed)
    return _SEED


def _cleanup_seed() -> None:
    for cid in (_SEED.get("knife"), _SEED.get("vest"), _SEED.get("npc")):
        if not cid:
            continue
        execute("DELETE FROM player_placements WHERE content_item_id = %s", (cid,))
        execute("DELETE FROM player_inventory WHERE content_item_id = %s", (cid,))
        execute("DELETE FROM player_npc_state WHERE npc_content_id = %s", (cid,))
        execute("DELETE FROM content_items WHERE id = %s", (cid,))


class PlayerMachine(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.seed = _ensure_seed()
        self.c = TestClient(app)
        self.pid = f"hyp_{uuid.uuid4().hex[:10]}"
        self.c.get("/api/state", params={"player_id": self.pid})  # create row
        # crystallize the bindings directly so features resolve to KNOWN content
        for fk, cid in self.seed["by_feature"].items():
            execute("INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id) "
                    "VALUES (%s, %s, 'item', %s) ON CONFLICT DO NOTHING", (self.pid, fk, cid))
        execute("INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id) "
                "VALUES (%s, %s, 'npc', %s) ON CONFLICT DO NOTHING", (self.pid, NPC_FEATURE, self.seed["npc"]))
        # ── reference model ──
        self.taken: set[str] = set()                 # feature keys taken
        self.inv: dict[str, dict] = {}               # inventory_id -> {slot, stats, tokens}
        self.equipped: dict[str, str] = {}           # slot -> inventory_id
        self.tokens: set[str] = set()                # item tokens carried
        self.standing = 0
        self.node = "greet"

    # ── verbs ─────────────────────────────────────────────────────────────────
    @rule(feature=st.sampled_from(list(ITEM_FEATURES)))
    def take(self, feature):
        r = self.c.post(f"/api/item/{feature}/take", json={"player_id": self.pid}).json()
        if feature in self.taken:
            assert r["status"] == "already_taken"
            return
        assert r["status"] == "taken", r
        self.taken.add(feature)
        mech = KNIFE_MECH if ITEM_FEATURES[feature] == KNIFE else VEST_MECH
        self.inv[r["inventory_id"]] = {"slot": mech["slot"], "stats": mech["stats"]}
        self.tokens.add(ITEM_FEATURES[feature].lower())

    @precondition(lambda self: any(i not in self.equipped.values() for i in self.inv))
    @rule(data=st.data())
    def equip(self, data):
        candidates = [iid for iid in self.inv if iid not in self.equipped.values()]
        iid = data.draw(st.sampled_from(candidates))
        r = self.c.post("/api/equip", json={"player_id": self.pid, "inventory_id": iid}).json()
        assert r.get("ok"), r
        self.equipped[self.inv[iid]["slot"]] = iid

    @precondition(lambda self: bool(self.equipped))
    @rule(data=st.data())
    def unequip(self, data):
        slot = data.draw(st.sampled_from(list(self.equipped)))
        self.c.post("/api/unequip", json={"player_id": self.pid, "slot": slot})
        del self.equipped[slot]

    @rule()
    def talk_and_choose(self):
        t = self.c.get(f"/api/npc/{self.seed['npc']}/talk", params={"player_id": self.pid}).json()
        # the model predicts exactly which choices should be visible right now
        assert {c["id"] for c in t["choices"]} == self._visible(), (t, self.node, self.standing)
        if not t["choices"]:
            return
        cid = sorted(c["id"] for c in t["choices"])[0]   # deterministic pick
        self.c.post(f"/api/npc/{self.seed['npc']}/choose",
                    json={"player_id": self.pid, "choice_id": cid})
        self._apply_choice(cid)

    # ── model helpers ───────────────────────────────────────────────────────────
    def _visible(self) -> set[str]:
        node = TREE["nodes"][self.node]
        out = set()
        for c in node["choices"]:
            req = c.get("requires") or {}
            if req.get("min_standing") is not None and self.standing < req["min_standing"]:
                continue
            if any(tok.lower() not in self.tokens for tok in (req.get("items") or [])):
                continue
            out.add(c["id"])
        return out

    def _apply_choice(self, cid: str):
        choice = next(c for c in TREE["nodes"][self.node]["choices"] if c["id"] == cid)
        eff = choice.get("effects") or {}
        self.standing += eff.get("adjust_standing", 0)
        self.node = "greet" if eff.get("end") else (choice.get("goto") or self.node)

    # ── invariants ────────────────────────────────────────────────────────────
    @invariant()
    def stats_match_equipped(self):
        inv = self.c.get("/api/inventory", params={"player_id": self.pid}).json()
        power = self.c.get("/api/state", params={"player_id": self.pid}).json()["power_tier"]
        exp_hp = BASE_HP + 5 * (power - 1)
        exp_atk = BASE_ATK + (power - 1)
        exp_def = BASE_DEF
        for iid in self.equipped.values():
            s = self.inv[iid]["stats"]
            exp_hp += s.get("hp", 0); exp_atk += s.get("atk", 0); exp_def += s.get("def", 0)
        assert inv["stats"]["atk"] == exp_atk and inv["stats"]["def"] == exp_def
        assert inv["stats"]["hp_max"] == exp_hp

    @invariant()
    def equipped_items_exist(self):
        inv = self.c.get("/api/inventory", params={"player_id": self.pid}).json()
        ids = {i["id"] for i in inv["items"]}
        for iid in self.equipped.values():
            assert iid in ids, f"equipped {iid} missing from inventory"

    def teardown(self):
        execute("DELETE FROM player_equipment WHERE player_id = %s", (self.pid,))
        for tbl in ("player_placements", "player_inventory", "player_npc_state",
                    "player_facts", "telemetry", "player_state"):
            col = "id" if tbl == "player_state" else "player_id"
            execute(f"DELETE FROM {tbl} WHERE {col} = %s", (self.pid,))


PlayerMachine.TestCase.settings = settings(max_examples=25, stateful_step_count=20, deadline=None)
TestPlayerStateMachine = PlayerMachine.TestCase
