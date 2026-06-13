"""Watch the whole world engine breathe, in one run.

Walks the entire loop end to end:
  1. player enters -> deterministic content dispatch  (HOT PATH, no LLM)
  2. long rest      -> async resolution via the poller (LLM, offline)
  3. rumors spread  -> drift clusters via pg_trgm       (no LLM)
  4. world agent    -> reviews drift, proposes a delta  (LLM)
  5. human approves -> 4-layer cascade reshapes canon
  6. player notified-> the world changed under them

Auto-detects llama: if the model is up it runs for real; if not it stubs the
LLM steps (and simulates the world agent) so the loop still completes.

Prereqs: local API on :8100. Do NOT run a separate poller — this script drives
the poller in-process so it can show you the LLM I/O.

Usage:
  .venv/bin/python -m prototype.full_demo                 # auto, quiet LLM
  .venv/bin/python -m prototype.full_demo --show-llm      # print Qwen I/O
  .venv/bin/python -m prototype.full_demo --stub          # force stub mode
"""

import argparse
import os
import random

import requests

API = "http://localhost:8100"


def banner(n, title):
    print(f"\n{'═' * 72}\n  STEP {n} — {title}\n{'═' * 72}")


def sub(msg):
    print(f"  · {msg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show-llm", action="store_true", help="print Qwen prompts/responses")
    ap.add_argument("--stub", action="store_true", help="force stub mode even if llama is up")
    args = ap.parse_args()

    # Decide mode and set env BEFORE importing the poller (it reads POLLER_STUB_LLM at import).
    from lib import llm

    h = llm.health()
    llama_up = (h["llm"] == "up") and not args.stub
    if not llama_up:
        os.environ["POLLER_STUB_LLM"] = "1"
    if args.show_llm:
        llm.VERBOSE = True

    from poller.poller import run_once
    from runtime.dispatcher import get_player_state
    from storage.content_store import fetch, fetch_one

    def drain():
        for _ in range(40):
            status, _jid = run_once()
            if status == "idle":
                return

    mode = "LIVE (llama up)" if llama_up else "STUB (llama offline)"
    print(f"\nWorld Engine — full loop demo   [mode: {mode}, embed: {h['embed']}]")
    pid = "demo_" + "".join(random.choices("abcdef0123456789", k=5))
    print(f"player: {pid}")

    # ── 1. hot path ─────────────────────────────────────────────────────────
    banner(1, "PLAYER ENTERS — deterministic dispatch (no LLM)")
    get_player_state(pid)
    for ctype in ("npc", "item", "lore_fragment"):
        items = requests.post(
            f"{API}/api/dispatch",
            json={"player_id": pid, "content_type": ctype, "context": "the med bay, just waking", "n": 2},
        ).json()
        for it in items:
            c = it["content"]
            sub(f"[{it['type']} r{it['revelation_tier']}] {c.get('name')}: {(c.get('description') or '')[:70]}")
    st = requests.get(f"{API}/api/state", params={"player_id": pid}).json()
    sub(f"tiers rev{st['revelation_tier']}/nar{st['narrative_tier']}/pow{st['power_tier']}, seen {st['seen']}")

    # ── 2. long rest ────────────────────────────────────────────────────────
    banner(2, "LONG REST — async resolution (LLM, offline path)")
    r = requests.post(
        f"{API}/api/input",
        json={"player_id": pid, "text": "I pry open the maintenance hatch and climb toward the warmth below", "context": "a too-warm corridor on level five"},
    ).json()
    sub(f"queued job {r['job_id'][:8]} — draining poller ({'real Qwen' if llama_up else 'stub'})…")
    drain()
    for n in requests.get(f"{API}/api/notifications", params={"player_id": pid}).json():
        res = (n["payload"] or {}).get("resolution", {})
        sub(f"resolved → {res.get('response', '')[:120]}")

    # ── 3. drift clustering ─────────────────────────────────────────────────
    banner(3, "COLLECTIVE DRIFT — rumors cluster by similarity (pg_trgm, no LLM)")
    belief = [
        ("nia", "The warmth in the lower corridors is something alive breathing below level seven"),
        ("omar", "Something living is breathing down past level seven and that's why the halls run warm"),
        ("priya", "The heat in the low corridors? It's a living thing below the seventh level, breathing"),
        ("quinn", "I swear the warmth comes from something alive that breathes beneath level seven"),
        ("ravi", "Sable overcharges for filtration masks near the docks"),  # distinct
    ]
    for player, text in belief:
        requests.post(f"{API}/api/rumor", json={"player_id": player, "content": text})
    sub(f"{len(belief)} rumors submitted (4 paraphrases + 1 unrelated) — draining…")
    drain()
    for row in fetch(
        "SELECT content, player_count FROM collective_drift "
        "WHERE created_at > now() - interval '1 minute' ORDER BY player_count DESC"
    ):
        sub(f"x{row['player_count']}  {row['content'][:64]}")

    # ── 4. world agent ──────────────────────────────────────────────────────
    banner(4, "WORLD AGENT — reviews drift, proposes a delta (LLM)")
    delta_id = None
    if llama_up:
        from agents.world_agent import get_world_agent

        aid = get_world_agent()
        sub(f"world agent {aid} — asking it to review and propose…")
        delta_id = _world_agent_turn(
            aid,
            "Review the collective drift with get_drift_report. If one belief strongly "
            "resonates and fits canon, score it with evaluate_rumor_resonance, then "
            "propose_bible_delta (certainty 'canonical' if you're confident) and "
            "flag_for_human_review. Be decisive.",
            show=args.show_llm,
        )
    if delta_id is None:
        # llama off, or the agent didn't reliably emit a proposal — simulate it.
        sub("[simulating the world agent's proposal]" if not llama_up else "[agent didn't propose; simulating]")
        top = fetch_one(
            "SELECT id, content FROM collective_drift ORDER BY player_count DESC, updated_at DESC LIMIT 1"
        )
        d = requests.post(
            f"{API}/api/delta",
            json={
                "summary": "Something alive breathes below level seven",
                "changes": {"description": f"Player drift converges: {top['content']}. Canonize that the undocumented level holds a living presence whose breath warms the lower corridors."},
                "invalidates_tags": [],
                "enriches_tags": ["mystery", "station"],
                "certainty": "canonical",
                "drift_id": str(top["id"]),  # link so the cascade canonizes this cluster
            },
        ).json()
        delta_id = d["id"]
        requests.post(f"{API}/api/delta/{delta_id}/flag")
    sub(f"proposed delta {delta_id} (awaiting human approval)")

    # ── 5. approve + cascade ────────────────────────────────────────────────
    banner(5, "HUMAN APPROVES — cascade ripples through 4 layers")
    bible_before = fetch_one("SELECT max(version) v FROM world_bible")["v"]
    requests.post(f"{API}/api/delta/{delta_id}/approve", params={"approved_by": "tynan"})
    sub("approved — draining the cascade job…")
    drain()
    d = fetch_one("SELECT cascade_status, certainty FROM world_deltas WHERE id=%s", (delta_id,))
    bible_after = fetch_one("SELECT max(version) v FROM world_bible")["v"]
    sub(f"cascade_status: {d['cascade_status']}")
    sub(f"bible version {bible_before} → {bible_after}   (delta certainty: {d['certainty']})")

    # ── 6. player notified ──────────────────────────────────────────────────
    banner(6, "PLAYER NOTIFIED — the world changed under them")
    notes = requests.get(f"{API}/api/notifications", params={"player_id": pid}).json()
    retcons = [n for n in notes if n["type"] == "retcon_delivered"]
    if retcons:
        for n in retcons:
            sub(f"✷ retcon → {(n['payload'] or {}).get('summary')}")
    else:
        sub("(delta was not canonical — no player retcon, which is correct)")

    print(f"\n{'═' * 72}\n  ✓ full loop complete — and the player path never touched an LLM.\n{'═' * 72}")


def _world_agent_turn(agent_id, text, show=False):
    """Send a turn to the world agent, print its reasoning/tool trace, and return
    the id of any delta it proposed (else None)."""
    from agents.letta_client import LETTA_URL
    from letta_client import Letta

    client = Letta(base_url=LETTA_URL, timeout=600)
    resp = client.agents.messages.create(agent_id=agent_id, input="/no_think\n" + text, streaming=False)
    for m in resp.messages:
        t = type(m).__name__
        if t == "ReasoningMessage" and show:
            print(f"    [reasoning] {str(getattr(m, 'reasoning', '') or '')[:160]}")
        elif t == "ToolCallMessage":
            tc = getattr(m, "tool_call", None)
            print(f"    [tool call] {getattr(tc, 'name', '?')} {str(getattr(tc, 'arguments', ''))[:120]}")
        elif t == "ToolReturnMessage" and show:
            print(f"    [tool ret ] {str(getattr(m, 'tool_return', ''))[:120]}")
        elif t == "AssistantMessage" and getattr(m, "content", None):
            print(f"    [says] {m.content[:200]}")
    # Did it propose a delta?
    from storage.content_store import fetch_one

    row = fetch_one(
        "SELECT id FROM world_deltas WHERE approved_at IS NULL AND created_at > now() - interval '2 minutes' "
        "ORDER BY created_at DESC LIMIT 1"
    )
    return str(row["id"]) if row else None


if __name__ == "__main__":
    main()
