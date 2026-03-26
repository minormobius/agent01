#!/usr/bin/env python3
"""
Anchor cosine analysis for the ternary scoring system.

Embeds all 120 anchor texts via Cloudflare Workers AI (bge-base-en-v1.5),
then computes pairwise cosine similarity within and between all 6 poles.

Outputs:
  1. 6x6 pole-level mean cosine matrix (pole centroids vs each other)
  2. Within-pole mean/min/max cosine (internal coherence)
  3. Cross-pole matrix of mean pairwise cosines (all 20x20 between each pair)
  4. A JSON artifact suitable for the ternary docs tab

Requires:
  CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars,
  or pass --local to use sentence-transformers locally.
"""

import argparse
import json
import sys
import os
import math
import itertools

# ── Anchor texts ──────────────────────────────────────────────

POLES = {
    "flesh_high": [
        "Physical attraction, beauty, desire, sensual experience, bodies, lust",
        "Music, drugs, food, physical sensation, pleasure, the body alive",
        "Romance, passion, seduction, aesthetic rapture, visceral delight",
        "The smell of rain on hot concrete, the taste of copper, skin on skin",
        "Dancing until your legs give out, sweat and bass and the crowd pressing in",
        "That first bite of perfect ramen, the broth so rich it makes you close your eyes",
        "Watching someone move through a room and forgetting what you were saying",
        "The ache in your muscles after climbing, the good kind of tired",
        "Silk against bare shoulders, cold water on a sunburn, hands in wet clay",
        "The rush when the plane drops, your stomach lifts, you remember you're an animal",
        "Sun on your face after a long winter, warmth dissolving into bone",
        "The way a great wine opens on the palate, tannins and earth and time",
        "Bodies in motion, athletes at full extension, the beauty of the physical limit",
        "Your heart pounding before a kiss, the electricity of almost touching",
        "A hot bath after a freezing day, the slow surrender of tension",
        "The crack of a perfect shot, the ball finding the pocket, the geometry of the body",
        "Waking up tangled in someone, the smell of their hair, the weight of their arm",
        "Standing at the edge of a cliff and feeling the wind try to take you",
        "The texture of old leather, worn smooth by hands, warm to the touch",
        "Biting into a peach in August, juice running down your chin, summer in a fruit",
    ],
    "flesh_low": [
        "Abstract reasoning, pure logic, disembodied thought, cerebral analysis",
        "Formal systems, mathematical proof, theoretical frameworks without sensation",
        "Detached observation, clinical neutrality, no feeling, no body",
        "The third axiom of set theory implies the following cardinality constraint",
        "Evaluating the logical consistency of the argument independent of its rhetorical force",
        "A purely theoretical treatment of equilibrium states in closed systems",
        "The proof proceeds by induction on the structure of well-formed formulae",
        "Dispassionate analysis of variance decomposition across treatment groups",
        "Consider the abstract case where all empirical content has been removed",
        "A taxonomy of categories without reference to any particular instance",
        "The formal specification is verified against the model without runtime observation",
        "Reviewing the metadata schema for internal consistency and normalization",
        "An enumeration of edge cases in the type system, devoid of practical context",
        "The committee reviewed the policy framework with no reference to individual experience",
        "Parsing the regulatory language for logical entailment, not intent or feeling",
        "A cost-benefit matrix reduced to expected utility across scenarios",
        "The algorithm converges regardless of initial conditions or observer state",
        "Evaluating epistemic warrant for the claim without regard to its emotional weight",
        "The ontology maps relations between concepts, not between people",
        "An abstract syntax tree has no color, no sound, no temperature",
    ],
    "knowledge_high": [
        "Research, data analysis, scientific discovery, deep investigation",
        "Books, poetry, literary arts, intellectual curiosity, understanding systems",
        "Technical expertise, teaching, sharing knowledge, citing sources and evidence",
        "The phase III trial enrolled 2,340 patients across 48 sites with a primary endpoint of progression-free survival",
        "According to the 2024 OECD dataset, labor productivity growth diverged sharply after 2019",
        "The original Sanskrit text uses a compound that literally translates as world-grief",
        "Here's a thread on how mRNA cap structures affect translation efficiency, with citations",
        "I spent six months reading every FDA warning letter from 2022, here's what I found",
        "The mechanism involves competitive inhibition at the allosteric binding site",
        "Let me walk you through the proof -- the key insight is the contrapositive of Lemma 3",
        "This paper replicates the original finding but with a much larger effect size (d = 0.81)",
        "The etymology traces through Old French back to a Latin legal term for property transfer",
        "New preprint shows CRISPR base editing at 94% efficiency in primary human T cells",
        "The bridge uses a catenary arch, not a parabola -- here's why the distinction matters",
        "Cross-referencing the patent filings with the clinical registry reveals a six-month gap",
        "A close reading of the Federalist Papers reveals Hamilton's position shifted between No. 70 and No. 78",
        "The absorption spectrum peaks at 420nm, which explains the violet fluorescence under UV",
        "Comparing three translations of the Iliad, each makes radically different choices about register",
        "The dataset contains 1.2 million labeled examples -- I'll explain the annotation protocol",
        "Reconstructing the phylogeny from molecular clock data gives a divergence date of 12 MYA",
    ],
    "knowledge_low": [
        "Gut feeling, vibes, no sources, pure emotional reaction, unexamined opinion",
        "Shitposting, memes, content-free jokes, zero information density",
        "Small talk, idle chatter, saying nothing with many words",
        "lmaooo this is so real",
        "idk man it just feels off to me",
        "no thoughts head empty just vibes",
        "this tbh",
        "haha wait what",
        "ugh mondays am I right",
        "literally me",
        "ok but like, same",
        "big if true",
        "mood",
        "I can't even",
        "it's giving what it needs to give",
        "just here for the ratio",
        "not me reading this at 3am",
        "anyway stream latest pop album",
        "the vibes are immaculate today",
        "sksksks and I oop",
    ],
    "argument_high": [
        "Heated debate, strong disagreement, calling out bad takes, fighting online",
        "Political argument, ideological confrontation, taking sides publicly",
        "Critique, rebuttal, polemic, challenging ideas, dunking on opponents",
        "This take is flatly wrong and I can show exactly where the reasoning fails",
        "You cannot claim to support X and then vote for Y -- that is incoherent",
        "The entire premise of this article is built on a stat that was debunked in 2021",
        "I will die on this hill: the current policy is actively making things worse",
        "Everyone sharing this thread should know the author has a massive conflict of interest",
        "Imagine thinking deregulation solves this when we have fifty years of evidence it doesn't",
        "The counterargument writes itself -- you just have to read past the headline",
        "No, this is not both sides. One side has data and the other has vibes",
        "I'm going to push back hard here because this framing does real damage",
        "This is the kind of motivated reasoning that sounds smart but collapses under scrutiny",
        "Thread: why the just asking questions defense is intellectually dishonest",
        "If your position requires ignoring three meta-analyses, maybe update your position",
        "The fact that this obvious grift keeps getting amplified is a systemic failure",
        "Respectfully, this is cope. Here's what the numbers actually show",
        "I've been arguing this for years and I'm tired of being proven right",
        "They're manufacturing consensus and the fact that no one pushes back is the real scandal",
        "You don't get to handwave away the externalities just because the GDP number looks good",
    ],
    "argument_low": [
        "Sharing my day, here is my cat, what I made for dinner tonight",
        "Quietly posting creative work, art, photos, no opinions attached",
        "Simple life updates, no takes, no discourse, just here and present",
        "Made sourdough this morning, the crumb turned out perfect this time",
        "My cat found a sunbeam and hasn't moved in three hours",
        "Went for a walk, found some wildflowers, putting them on my desk",
        "Here's a watercolor I finished this weekend, no particular subject",
        "Cooked a big pot of soup for the week, the kitchen smells amazing",
        "Watching the rain from the porch with coffee, no plans today",
        "Finally repotted the fern, it's been needing a bigger home",
        "The light at golden hour today was something else",
        "Planted tomatoes this morning, fingers crossed for a good summer",
        "Reading on the couch, the dog asleep on my feet, perfect evening",
        "Baked cookies for the neighbors, kept a few for myself obviously",
        "Listening to the same album on repeat while I clean the apartment",
        "Found an old photo of my grandparents at the same age I am now",
        "Saturday morning farmers market haul -- peaches, basil, good bread",
        "Finished a puzzle, 1000 pieces, very satisfying",
        "The sunset tonight looked like a painting, just stood there watching",
        "Nothing to report, just a quiet day, and that's enough",
    ],
}

POLE_NAMES = list(POLES.keys())
AXIS_PAIRS = [("flesh_high", "flesh_low"), ("knowledge_high", "knowledge_low"), ("argument_high", "argument_low")]


# ── Embedding backends ────────────────────────────────────────

def embed_local(texts):
    """Use sentence-transformers locally."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("BAAI/bge-base-en-v1.5")
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    return [v.tolist() for v in vecs]


def embed_cloudflare(texts, account_id, api_token):
    """Use Cloudflare Workers AI REST API."""
    import urllib.request
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/baai/bge-base-en-v1.5"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    # Batch in groups of 100
    all_vecs = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i+100]
        body = json.dumps({"text": batch}).encode()
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
        all_vecs.extend(result["result"]["data"])
        print(f"  embedded {min(i+100, len(texts))}/{len(texts)}", file=sys.stderr)
    return all_vecs


# ── Math ──────────────────────────────────────────────────────

def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def centroid(vecs):
    dim = len(vecs[0])
    c = [0.0] * dim
    for v in vecs:
        for i in range(dim):
            c[i] += v[i]
    n = len(vecs)
    return [x / n for x in c]


def pairwise_cosines(vecs_a, vecs_b):
    """All pairwise cosines between two sets of vectors."""
    vals = []
    for a in vecs_a:
        for b in vecs_b:
            vals.append(cosine(a, b))
    return vals


def stats(vals):
    if not vals:
        return {"mean": 0, "min": 0, "max": 0, "std": 0}
    n = len(vals)
    m = sum(vals) / n
    variance = sum((v - m) ** 2 for v in vals) / n
    return {
        "mean": round(m, 4),
        "min": round(min(vals), 4),
        "max": round(max(vals), 4),
        "std": round(math.sqrt(variance), 4),
    }


def within_pole_cosines(vecs):
    """All unique pairs within a single pole (excludes self-similarity)."""
    vals = []
    for i in range(len(vecs)):
        for j in range(i + 1, len(vecs)):
            vals.append(cosine(vecs[i], vecs[j]))
    return vals


# ── Main ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Anchor cosine analysis for ternary scoring")
    parser.add_argument("--local", action="store_true", help="Use local sentence-transformers instead of Cloudflare API")
    parser.add_argument("--json", type=str, default=None, help="Write full results to JSON file")
    args = parser.parse_args()

    # Flatten all texts in pole order
    all_texts = []
    pole_slices = {}
    for name, texts in POLES.items():
        start = len(all_texts)
        all_texts.extend(texts)
        pole_slices[name] = (start, len(all_texts))

    print(f"Embedding {len(all_texts)} anchor texts...", file=sys.stderr)

    if args.local:
        all_vecs = embed_local(all_texts)
    else:
        account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        api_token = os.environ.get("CLOUDFLARE_API_TOKEN")
        if not account_id or not api_token:
            print("ERROR: Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or use --local", file=sys.stderr)
            sys.exit(1)
        all_vecs = embed_cloudflare(all_texts, account_id, api_token)

    # Slice embeddings per pole
    pole_vecs = {}
    for name, (start, end) in pole_slices.items():
        pole_vecs[name] = all_vecs[start:end]

    dim = len(all_vecs[0])
    print(f"Embedding dimension: {dim}", file=sys.stderr)
    print()

    # ── 1. Within-pole coherence ──────────────────────────────
    print("=" * 72)
    print("WITHIN-POLE COHERENCE (all unique pairs within each pole)")
    print("=" * 72)
    print(f"{'Pole':<20} {'Mean':>8} {'Min':>8} {'Max':>8} {'Std':>8}   N_pairs")
    print("-" * 72)
    within_stats = {}
    for name in POLE_NAMES:
        vals = within_pole_cosines(pole_vecs[name])
        s = stats(vals)
        within_stats[name] = s
        n_pairs = len(pole_vecs[name]) * (len(pole_vecs[name]) - 1) // 2
        print(f"{name:<20} {s['mean']:>8.4f} {s['min']:>8.4f} {s['max']:>8.4f} {s['std']:>8.4f}   {n_pairs}")
    print()

    # ── 2. Full 6x6 cross-pole matrix (mean pairwise cosines) ─
    print("=" * 72)
    print("CROSS-POLE MEAN COSINE MATRIX (all 20x20 pairwise between poles)")
    print("=" * 72)
    cross_matrix = {}
    # Header
    header = f"{'':>20}" + "".join(f"{n:>14}" for n in POLE_NAMES)
    print(header)
    print("-" * len(header))
    for name_a in POLE_NAMES:
        row = f"{name_a:>20}"
        cross_matrix[name_a] = {}
        for name_b in POLE_NAMES:
            if name_a == name_b:
                val = within_stats[name_a]["mean"]
            else:
                vals = pairwise_cosines(pole_vecs[name_a], pole_vecs[name_b])
                val = stats(vals)["mean"]
            cross_matrix[name_a][name_b] = round(val, 4)
            row += f"{val:>14.4f}"
        print(row)
    print()

    # ── 3. Axis diagnostics ───────────────────────────────────
    print("=" * 72)
    print("AXIS DIAGNOSTICS")
    print("=" * 72)

    # Compute axis direction vectors (high_centroid - low_centroid)
    axis_dirs = {}
    for high_name, low_name in AXIS_PAIRS:
        axis = high_name.replace("_high", "")
        hc = centroid(pole_vecs[high_name])
        lc = centroid(pole_vecs[low_name])
        direction = [h - l for h, l in zip(hc, lc)]
        axis_dirs[axis] = direction

    print("\nAnti-pole cosine (high_centroid vs low_centroid — want negative):")
    for high_name, low_name in AXIS_PAIRS:
        axis = high_name.replace("_high", "")
        hc = centroid(pole_vecs[high_name])
        lc = centroid(pole_vecs[low_name])
        val = cosine(hc, lc)
        print(f"  {axis:>12}: cos(high, low) = {val:>8.4f}")

    print("\nAxis direction orthogonality (want ~0):")
    axis_names = list(axis_dirs.keys())
    dir_cosines = {}
    for i in range(len(axis_names)):
        for j in range(i + 1, len(axis_names)):
            a, b = axis_names[i], axis_names[j]
            val = cosine(axis_dirs[a], axis_dirs[b])
            dir_cosines[f"{a}_vs_{b}"] = round(val, 4)
            print(f"  {a:>12} vs {b:<12}: {val:>8.4f}")

    print("\nAxis direction magnitudes:")
    for axis, d in axis_dirs.items():
        mag = math.sqrt(sum(x * x for x in d))
        print(f"  {axis:>12}: ||d|| = {mag:.4f}")

    print()

    # ── 4. Condensed verdict ──────────────────────────────────
    print("=" * 72)
    print("SUMMARY")
    print("=" * 72)
    for high_name, low_name in AXIS_PAIRS:
        axis = high_name.replace("_high", "")
        intra_high = within_stats[high_name]["mean"]
        intra_low = within_stats[low_name]["mean"]
        anti = cross_matrix[high_name][low_name]
        print(f"  {axis}:")
        print(f"    high internal coherence: {intra_high:.4f}")
        print(f"    low  internal coherence: {intra_low:.4f}")
        print(f"    high-low cross cosine:   {anti:.4f}  {'OK' if anti < 0.5 else 'LEAKY'}")
    print()
    print("  axis orthogonality:")
    for pair, val in dir_cosines.items():
        label = "OK" if abs(val) < 0.15 else ("WEAK" if abs(val) < 0.30 else "CORRELATED")
        print(f"    {pair}: {val:>8.4f}  {label}")
    print()

    # ── 5. JSON output ────────────────────────────────────────
    if args.json:
        output = {
            "model": "BAAI/bge-base-en-v1.5",
            "dimension": dim,
            "n_anchors_per_pole": 20,
            "within_pole_coherence": within_stats,
            "cross_pole_matrix": cross_matrix,
            "axis_direction_cosines": dir_cosines,
            "antipole_cosines": {
                hp.replace("_high", ""): round(cosine(centroid(pole_vecs[hp]), centroid(pole_vecs[lp])), 4)
                for hp, lp in AXIS_PAIRS
            },
        }
        with open(args.json, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Wrote {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
