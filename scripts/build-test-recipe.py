#!/usr/bin/env python3
"""Build a test recipe record for ATProto recipe.exchange publishing."""

import json
import os
from datetime import datetime, timezone

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Start minimal — just the required fields from the lexicon
# required: name, text, ingredients, instructions, createdAt, updatedAt
record = {
    "$type": "exchange.recipe.recipe",
    "name": os.environ.get("RECIPE_NAME", "Bakery Calculator Test Loaf"),
    "text": "A test sourdough recipe from a bakery percentage calculator.",
    "ingredients": [
        "500g bread flour",
        "125g whole wheat flour",
        "425g water",
        "12.5g salt",
        "125g sourdough starter",
    ],
    "instructions": [
        "Mix flour and water. Rest 30 minutes.",
        "Add salt and starter. Mix until incorporated.",
        "Bulk ferment 4-5 hours with stretch and folds.",
        "Shape and cold proof overnight.",
        "Bake in dutch oven at 500F for 20 min covered, then 450F for 20 min uncovered.",
    ],
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
