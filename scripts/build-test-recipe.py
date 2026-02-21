#!/usr/bin/env python3
"""Build a test recipe record for ATProto recipe.exchange publishing."""

import json
import os
from datetime import datetime, timezone

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

record = {
    "$type": "exchange.recipe.recipe",
    "name": os.environ.get("RECIPE_NAME", "Bakery Calculator Test Loaf"),
    "text": (
        "A test recipe published from a bakery percentage calculator. "
        "68% hydration sourdough with a simple flour blend. "
        "Written programmatically via GitHub Actions to test ATProto recipe publishing."
    ),
    "ingredients": [
        "500g bread flour (80%)",
        "125g whole wheat flour (20%)",
        "425g water (68%)",
        "12.5g salt (2%)",
        "125g sourdough starter (20%)",
    ],
    "instructions": [
        "## Autolyse",
        "Mix flour and water. Rest 30 minutes.",
        "## Mix",
        "Add salt and starter to the dough. Mix until incorporated using the slap and fold method.",
        "## Bulk Fermentation",
        "Ferment at room temperature for 4-5 hours, performing stretch and folds every 30 minutes for the first 2 hours.",
        "## Shape",
        "Pre-shape into a round. Bench rest 20 minutes. Final shape into a batard or boule.",
        "## Cold Proof",
        "Place in a banneton, cover, and refrigerate overnight (12-16 hours).",
        "## Bake",
        "Preheat oven with dutch oven to 500F (260C). Score the loaf. Bake covered for 20 minutes, then uncovered at 450F (230C) for 20-25 minutes until deep golden brown.",
    ],
    "prepTime": "PT30M",
    "cookTime": "PT45M",
    "totalTime": "PT18H",
    "recipeYield": "1 loaf",
    "recipeCategory": "breakfast",
    "recipeCuisine": "european",
    "cookingMethod": "baking",
    "nutrition": {
        "calories": 2200,
        "fatContent": 8.5,
        "proteinContent": 72.0,
        "carbohydrateContent": 440.0,
    },
    "keywords": [
        "sourdough",
        "bread",
        "bakery calculator",
        "bakers percentage",
        "atproto-test",
    ],
    "attribution": {
        "$type": "exchange.recipe.defs#attributionOriginal",
        "license": "cc_by",
    },
    "createdAt": now,
    "updatedAt": now,
}

request = {
    "repo": os.environ["DID"],
    "collection": "exchange.recipe.recipe",
    "record": record,
}

output_path = os.environ.get("OUTPUT_PATH", "/tmp/create-request.json")
with open(output_path, "w") as f:
    json.dump(request, f, indent=2)

print(json.dumps(request, indent=2))
