"""Scripted playtester — a bot that *plays the game over the API* and asserts.

This is the safety net for the "doing-stuff" verbs (take / equip / unequip / talk /
choose) and the reactive gate. It drives the real FastAPI app in-process via
TestClient against the local Postgres, so it exercises the whole HTTP + runtime
stack — not just the runtime functions a unit test would call. It seeds its own
isolated world (a throwaway player + throwaway content with item mechanics and an
NPC dialogue tree whose deeper choices are gated on standing and on an item the
player carries), plays through it, asserts the world reacts correctly, then cleans
up everything it created.

No LLM: this stays on the deterministic hot path. Run it with the local DB up.

    .venv/bin/python -m scripts.playtester              # scripted scenario
    .venv/bin/python -m scripts.playtester --random     # seeded monkey run
    .venv/bin/python -m scripts.playtester --random --seed 7 --steps 200

Exit code is nonzero if any assertion fails, so it slots into CI alongside pytest.
"""

import argparse
import random
import signal
import sys

from fastapi.testclient import TestClient

from runtime.local_api import app
from storage.content_store import execute, insert_content_item

# Feature keys we bind our seeded content onto (real keys from runtime/world_map.py).
ITEM_FEATURE = "store.shelf.a"
NPC_FEATURE = "medbay.keeper"

ITEM_NAME = "Playtest Sigil-Knife"


class Playtest:
    """Owns a TestClient, a throwaway player, seeded content, and the assert tally."""

    def __init__(self, verbose: bool = True):
        self.c = TestClient(app)
        self.verbose = verbose
        self.player = f"pt_player_{random.randint(0, 1 << 30):x}"
        self.content_ids: list[str] = []
        self.npc_id: str | None = None
        self.passed = 0
        self.failed = 0
        self._cleaned = False

    # ── assertion helpers ────────────────────────────────────────────────────
    def check(self, ok: bool, label: str, detail: str = "") -> bool:
        mark = "PASS" if ok else "FAIL"
        if ok:
            self.passed += 1
        else:
            self.failed += 1
        if self.verbose or not ok:
            line = f"  [{mark}] {label}"
            if detail and (not ok or self.verbose):
                line += f"  ({detail})"
            print(line)
        return ok

    # ── world setup / teardown ───────────────────────────────────────────────
    def seed(self) -> None:
        """Create the throwaway player + content and crystallize bindings directly."""
        # ensure the player row exists
        self.c.get("/api/state", params={"player_id": self.player})

        # an equippable item with mechanics (hand slot, +3 atk)
        item_id = insert_content_item({
            "type": "item",
            "content": {
                "name": ITEM_NAME,
                "description": "A test blade, sufficiently described to pass QA.",
                "mechanics": {"slot": "hand", "stats": {"atk": 3, "def": 1}},
            },
            "tags": ["playtest", "relic"],
            "approved": True,
        })
        self.content_ids.append(item_id)

        # an NPC whose tree gates a deeper line on standing, and another on the item
        npc_id = insert_content_item({
            "type": "npc",
            "content": {
                "name": "The Playtest Keeper",
                "description": "A figure in grey, watching the seam in the world.",
                "dialogue": {
                    "start": "greet",
                    "nodes": {
                        "greet": {
                            "says": "You again. The grey suits us both, I think.",
                            "choices": [
                                {"id": "warm", "text": "Offer a quiet word.",
                                 "effects": {"adjust_standing": 1,
                                             "set_facts": {"flag.met_keeper": True}},
                                 "goto": "greet"},
                                {"id": "trust", "text": "Ask what they truly guard.",
                                 "requires": {"min_standing": 1},
                                 "effects": {"adjust_standing": 1}, "goto": "secret"},
                                {"id": "show", "text": "Show them the relic you carry.",
                                 "requires": {"items": [ITEM_NAME]},
                                 "effects": {"set_facts": {"flag.showed_relic": True}},
                                 "goto": "greet"},
                            ],
                        },
                        "secret": {
                            "says": "Then listen: the Quiet was never empty.",
                            "choices": [{"id": "bye", "text": "Leave.",
                                         "effects": {"end": True}, "goto": "greet"}],
                        },
                    },
                },
            },
            "tags": ["playtest", "keeper"],
            "approved": True,
        })
        self.content_ids.append(npc_id)
        self.npc_id = npc_id

        # crystallize the bindings onto map features for THIS player
        execute(
            "INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (player_id, feature_key) DO UPDATE "
            "SET content_item_id = EXCLUDED.content_item_id",
            (self.player, ITEM_FEATURE, "item", item_id),
        )
        execute(
            "INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (player_id, feature_key) DO UPDATE "
            "SET content_item_id = EXCLUDED.content_item_id",
            (self.player, NPC_FEATURE, "npc", npc_id),
        )

    def cleanup(self) -> None:
        """Delete everything this run created. Idempotent — safe to call from a
        signal handler AND the finally block without double-removing anything."""
        if self._cleaned:
            return
        self._cleaned = True
        execute("DELETE FROM player_equipment WHERE player_id = %s", (self.player,))
        for tbl in ("player_placements", "telemetry", "notifications", "player_inputs",
                    "pool_depth", "player_facts", "player_inventory", "player_npc_state"):
            execute(f"DELETE FROM {tbl} WHERE player_id = %s", (self.player,))
        execute("DELETE FROM player_state WHERE id = %s", (self.player,))
        for cid in self.content_ids:
            execute("DELETE FROM player_placements WHERE content_item_id = %s", (cid,))
            execute("DELETE FROM player_inventory WHERE content_item_id = %s", (cid,))
            execute("DELETE FROM player_npc_state WHERE npc_content_id = %s", (cid,))
            execute("DELETE FROM content_items WHERE id = %s", (cid,))

    # ── thin API verbs (player_id baked in) ──────────────────────────────────
    def _q(self):
        return {"player_id": self.player}

    def inventory(self):
        return self.c.get("/api/inventory", params=self._q()).json()

    def take(self, feature_key):
        return self.c.post(f"/api/item/{feature_key}/take", json=self._q()).json()

    def equip(self, inventory_id):
        return self.c.post("/api/equip", json={**self._q(), "inventory_id": inventory_id}).json()

    def unequip(self, slot):
        return self.c.post("/api/unequip", json={**self._q(), "slot": slot}).json()

    def talk(self, npc_id):
        return self.c.get(f"/api/npc/{npc_id}/talk", params=self._q()).json()

    def choose(self, npc_id, choice_id):
        return self.c.post(f"/api/npc/{npc_id}/choose",
                           json={**self._q(), "choice_id": choice_id}).json()

    def facts(self):
        return self.c.get("/api/facts", params=self._q()).json()

    # ── the scripted scenario ────────────────────────────────────────────────
    def run_scenario(self) -> None:
        print(f"\n▶ scripted scenario (player={self.player})")

        # 1. take the item off the shelf
        r = self.take(ITEM_FEATURE)
        self.check(r.get("status") == "taken", "take item from shelf", str(r))
        inv_id = r.get("inventory_id")
        # taking again should be idempotent
        self.check(self.take(ITEM_FEATURE).get("status") == "already_taken",
                   "second take is rejected")

        # 2. inventory holds it; stats are at baseline (atk 2 at power_tier 1)
        inv = self.inventory()
        names = [i["name"] for i in inv["items"]]
        self.check(ITEM_NAME in names, "item appears in inventory", str(names))
        base_atk = inv["stats"]["atk"]
        self.check(base_atk == 2, "baseline atk == 2", f"got {base_atk}")

        # 3. equip it → atk rises by the item's +3
        e = self.equip(inv_id)
        self.check(e.get("ok") and e.get("slot") == "hand", "equip into hand slot", str(e))
        after = self.inventory()["stats"]["atk"]
        self.check(after == base_atk + 3, "equipped atk == baseline+3", f"got {after}")

        # 4. talk: only the ungated 'warm' choice is visible at standing 0
        t = self.talk(self.npc_id)
        ids = {c["id"] for c in t["choices"]}
        self.check(ids == {"warm", "show"}, "gated 'trust' hidden at standing 0; 'show' open (item held)",
                   str(sorted(ids)))

        # 5. choose 'warm' → standing+1, flag set
        self.choose(self.npc_id, "warm")
        self.check(self.facts().get("flag.met_keeper") is True, "choice set flag.met_keeper")
        t = self.talk(self.npc_id)
        self.check(t["standing"] == 1, "standing rose to 1", str(t.get("standing")))

        # 6. now the standing-gated 'trust' choice has unlocked — the world reacts
        ids = {c["id"] for c in t["choices"]}
        self.check("trust" in ids, "standing-gated 'trust' now visible", str(sorted(ids)))

        # 7. take 'trust' → advances to the secret node
        r = self.choose(self.npc_id, "trust")
        self.check("Quiet was never empty" in r.get("says", ""), "reached gated 'secret' node", r.get("says", ""))

        # 8. unequip → atk falls back to baseline (regression on the stat math)
        self.unequip("hand")
        self.check(self.inventory()["stats"]["atk"] == base_atk, "unequip restores baseline atk")

    # ── seeded random / monkey mode ──────────────────────────────────────────
    def run_random(self, seed: int, steps: int) -> None:
        rng = random.Random(seed)
        print(f"\n▶ random monkey run (player={self.player}, seed={seed}, steps={steps})")
        errors = 0
        for _ in range(steps):
            inv = self.inventory()
            held = [i for i in inv["items"]]
            equipped = inv["equipment"]
            actions = ["take", "talk", "facts"]
            if held:
                actions += ["equip", "equip"]
            if equipped:
                actions.append("unequip")
            act = rng.choice(actions)
            try:
                if act == "take":
                    self.take(ITEM_FEATURE)
                elif act == "equip":
                    self.equip(rng.choice(held)["id"])
                elif act == "unequip":
                    self.unequip(rng.choice(list(equipped)))
                elif act == "talk":
                    t = self.talk(self.npc_id)
                    if t.get("choices"):
                        self.choose(self.npc_id, rng.choice(t["choices"])["id"])
                elif act == "facts":
                    self.facts()
            except Exception as exc:  # noqa: BLE001 — the whole point is to catch breakage
                errors += 1
                print(f"  [FAIL] action {act!r} raised: {exc}")
            # invariant: anything equipped must still be in inventory
            inv2 = self.inventory()
            inv_ids = {i["id"] for i in inv2["items"]}
            dangling = [s for s, v in inv2["equipment"].items() if v["inventory_id"] not in inv_ids]
            if dangling:
                errors += 1
                print(f"  [FAIL] equipment references missing inventory: {dangling}")
        self.check(errors == 0, f"{steps} random actions left no errors/invariant breaks",
                   f"{errors} problem(s)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Scripted playtester for the gameplay verbs.")
    ap.add_argument("--random", action="store_true", help="run the seeded monkey instead of the scripted scenario")
    ap.add_argument("--seed", type=int, default=1, help="RNG seed for --random (deterministic)")
    ap.add_argument("--steps", type=int, default=100, help="number of random actions for --random")
    ap.add_argument("-q", "--quiet", action="store_true", help="only print failures + summary")
    args = ap.parse_args()

    pt = Playtest(verbose=not args.quiet)

    # Never leave dirty state: trap SIGINT/SIGTERM and scrub before exiting. (The
    # finally below covers normal exit + exceptions; the trap covers kill signals
    # that the finally would never see. cleanup() is idempotent, so overlap is fine.)
    def _on_signal(signum, _frame):
        print(f"\n⚠ caught {signal.Signals(signum).name} — cleaning up before exit")
        pt.cleanup()
        sys.exit(130)

    for _sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(_sig, _on_signal)

    try:
        pt.seed()
        if args.random:
            pt.run_random(args.seed, args.steps)
        else:
            pt.run_scenario()
    finally:
        pt.cleanup()

    print(f"\n{pt.passed} passed, {pt.failed} failed")
    return 1 if pt.failed else 0


if __name__ == "__main__":
    sys.exit(main())
