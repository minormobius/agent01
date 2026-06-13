# Content authoring & generation — forward plan

> Design doc, not for immediate execution. Covers (1) a real "generate more" CLI,
> (2) why reject-and-regenerate doesn't converge on orphans and the generation-side
> fix, and (3) a form-based "add net-new content" UI to replace raw-JSON authoring.

## 1. A standalone "generate more" script

**Gap today:** no CLI tops up the pool. `ingestion/pregen_pass.run_pregen` is the engine
but its `__main__` is a hardcoded demo; `seed_run --fresh` *wipes*; replenishment only
fires inside the poller per watermark.

**Proposal — `scripts/generate.py`:**
```
python -m scripts.generate --type npc --count 10 [--tier 2] [--avoid-existing] [--approve]
```
- Thin wrapper over `run_pregen(bible, override_targets={type: count})` → inserts pending
  (`approved=false`), same `auto_qa` + dedup + `insert_content_item` (so normalization
  + `requires`/dialogue repair already apply).
- `--avoid-existing` passes current pool names as the avoid-list (less duplication).
- `--tier` to bias revelation stage; `--approve` to skip the review gate for fast iteration.
- Needs llama up. Append-only — never deletes.

## 2. Orphans don't converge under regeneration — fix generation, not the symptom

Rejecting an orphan + regenerating produces *more* content that authors *more* gates on
*more* producerless flags → new orphans. And an orphaned lore fragment gated on
`flag.met_the_quiet` encodes an intended **beat**; rejecting it deletes the beat, and
regen yields different content, not the missing **producer**. Orphans are unfinished
wiring, not noise.

Root cause: each item is generated in isolation, so a gate's *consumer* and *producer*
are authored by different calls that never coordinate. Three fixes, best-first:

1. **Constrain gates to the known producer vocabulary.** Before generating, compute the
   set of facts/items/rep the pool already produces (`gate_reachability` already has the
   producer side). Feed it into the prompt: "you may only gate on these existing flags/
   items/factions, or omit the gate." Orphans become impossible by construction. Cheap,
   high-impact; pairs with the `--avoid-existing` plumbing.
2. **Generate gate+producer as a pair.** When the generator authors a gated item, it
   must also emit the producer (the NPC choice / plot_beat that `set_facts` the flag) in
   the same batch. Closes the loop for *new* narrative beats (which #1 alone can't
   introduce, since it only reuses existing flags).
3. **Post-gen reconciliation pass.** After a batch, run `analyze_pool`; for each orphan
   either auto-loosen (drop the clause) or queue a "needs producer" item for review.
   Automated whack-a-mole — the safety net under #1/#2, not a replacement.

Recommendation: **#1 now** (eliminates accidental orphans), **#2** when you want gated
beats authored deliberately, **#3** as a CI/poller guard. This is the convergence story:
generation stops *creating* gaps, and the gate validators already *detect* the rest.

## 3. Form-based authoring UI (kill raw-JSON authoring)

A "+ New" mode in the review app: type-aware structured forms, live-validated, saved as
pending via a new `POST /create`. Raw JSON stays as an "advanced" escape hatch.

**Common fields (all types):** type picker, name, description, tags, the three tiers,
and a **gate builder** for `requires`.

**Gate builder (the anti-orphan lever):** add-a-clause UI where facts / items / factions
are chosen from **dropdowns populated by the producible vocabulary** (what the pool
actually produces — same source as #2.1). Free-text is allowed but flagged "nothing
produces this yet" inline, so you can't *accidentally* author an orphan; you can only do
it on purpose.

**Type-specific:**
- **item** → `mechanics`: slot dropdown (`hand/body/head/trinket`) + numeric atk/def/hp.
- **npc** → **dialogue-tree builder** (the hard part, phase 2): a node list, each node =
  `says` + an ordered list of choice rows; each choice row = text, a `goto` dropdown of
  node ids, a gate builder, and an effect builder (`set_facts`/`adjust_standing`/
  `adjust_rep`/`set_npc_flags`/`give_items`/`end` via pickers). Reuses the existing
  read-only tree renderer for preview, plus the live FSM validator so dead-ends/broken
  gotos surface as you build. Add/remove nodes & choices.

**Live validation:** reuse `GET /validate` on the in-progress draft (or a dry-run
`POST /validate-draft`) so tree + gate issues show before save — authoring and review
converge into one surface.

**Save:** `POST /create` → `insert_content_item` (normalization already fires) as
pending. Then it's just another card in the queue.

### Phases
1. **Create endpoint + common form + gate builder + item mechanics.** Covers most types;
   immediately better than JSON. Gate dropdowns sourced from producer vocabulary.
2. **Dialogue-tree builder** for NPCs (the structured graph editor + live FSM validation).
3. **Generation-side anti-orphan (#2.1)** wired into both `scripts/generate.py` and the
   form's gate dropdowns — one shared "producible vocabulary" source.

Verification mirrors existing patterns: the create path is just `insert_content_item`, so
the playtester / validators / review UI all compose unchanged.
