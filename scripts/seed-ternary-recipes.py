#!/usr/bin/env python3
"""
Seed the PDS with egg-milk-flour ternary chart recipes.

Usage:
  python scripts/seed-ternary-recipes.py --handle you.bsky.social --password xxxx-xxxx-xxxx-xxxx

Each recipe is published as an exchange.recipe.recipe record.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError

PUBLIC_API = "https://public.api.bsky.app"

# ---- ATProto helpers ----

def resolve_handle(handle):
    url = f"{PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle={quote(handle)}"
    with urlopen(url) as r:
        return json.loads(r.read())["did"]


def resolve_pds(did):
    if did.startswith("did:plc:"):
        url = f"https://plc.directory/{did}"
    elif did.startswith("did:web:"):
        host = did[len("did:web:"):].replace(":", "/")
        url = f"https://{host}/.well-known/did.json"
    else:
        raise ValueError(f"Unsupported DID method: {did}")

    with urlopen(url) as r:
        doc = json.loads(r.read())

    for svc in doc.get("service", []):
        if svc.get("type") == "AtprotoPersonalDataServer":
            return svc["serviceEndpoint"]
    raise ValueError("No PDS endpoint found")


def create_session(handle, password):
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    req = Request(
        f"{pds}/xrpc/com.atproto.server.createSession",
        data=json.dumps({"identifier": handle, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req) as r:
        session = json.loads(r.read())
    session["pds"] = pds
    return session


def publish_record(session, record):
    body = json.dumps({
        "repo": session["did"],
        "collection": "exchange.recipe.recipe",
        "record": record,
    })
    req = Request(
        f"{session['pds']}/xrpc/com.atproto.repo.createRecord",
        data=body.encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {session['accessJwt']}",
        },
        method="POST",
    )
    try:
        with urlopen(req) as r:
            return json.loads(r.read())
    except HTTPError as e:
        err = json.loads(e.read())
        raise RuntimeError(f"Publish failed: {err}") from e


# ---- Recipe data ----

def now_iso():
    return datetime.now(timezone.utc).isoformat()


RECIPES = [
    {
        "name": "Traditional Egg Pasta",
        "text": "Fresh pasta from Emilia-Romagna — just flour and eggs, rolled thin. The canonical flour-egg point on the ternary chart.",
        "ingredients": [
            "250g 00 flour or all-purpose flour",
            "3 large eggs (150g)",
            "1 tablespoon olive oil",
            "Pinch of salt",
        ],
        "instructions": [
            "Mound the flour on a clean surface and make a well in the center.",
            "Crack the eggs into the well, add olive oil and salt.",
            "Using a fork, gradually incorporate flour from the inner walls into the eggs.",
            "Once a shaggy dough forms, knead by hand for 8-10 minutes until smooth and elastic.",
            "Wrap tightly in plastic and rest at room temperature for 30 minutes.",
            "Divide dough into portions. Roll each through a pasta machine starting at the widest setting, narrowing progressively.",
            "Cut into desired shape — tagliatelle, fettuccine, or pappardelle.",
            "Cook in well-salted boiling water for 2-3 minutes until al dente.",
        ],
        "prepTime": "PT45M",
        "cookTime": "PT3M",
        "recipeYield": "4 servings",
        "recipeCategory": "main course",
        "recipeCuisine": "Italian",
        "cookingMethod": "boiling",
        "keywords": ["pasta", "fresh pasta", "egg pasta", "ternary-chart"],
    },
    {
        "name": "Pancakes",
        "text": "American-style buttermilk pancakes. Flour-forward with enough egg and milk to make a pourable batter.",
        "ingredients": [
            "240g all-purpose flour",
            "2 large eggs (100g)",
            "360ml buttermilk",
            "60g melted butter",
            "2 tablespoons sugar",
            "2 teaspoons baking powder",
            "1 teaspoon baking soda",
            "1/2 teaspoon salt",
        ],
        "instructions": [
            "Whisk flour, sugar, baking powder, baking soda, and salt in a large bowl.",
            "In a separate bowl, whisk eggs, buttermilk, and melted butter.",
            "Pour wet ingredients into dry. Stir until just combined — lumps are fine. Overmixing makes tough pancakes.",
            "Heat a griddle or skillet over medium heat. Lightly butter the surface.",
            "Pour 1/4 cup batter per pancake. Cook until bubbles form on the surface and edges look set, about 2-3 minutes.",
            "Flip and cook another 1-2 minutes until golden.",
            "Serve immediately with butter and maple syrup.",
        ],
        "prepTime": "PT10M",
        "cookTime": "PT15M",
        "recipeYield": "12 pancakes",
        "recipeCategory": "breakfast",
        "recipeCuisine": "American",
        "cookingMethod": "pan frying",
        "keywords": ["pancakes", "breakfast", "buttermilk", "ternary-chart"],
    },
    {
        "name": "Waffles",
        "text": "Crispy Belgian-style waffles. Similar to pancakes in ratio but richer, with more butter for crisp edges.",
        "ingredients": [
            "250g all-purpose flour",
            "2 large eggs (100g)",
            "420ml milk",
            "115g melted butter",
            "2 tablespoons sugar",
            "1 tablespoon baking powder",
            "1/2 teaspoon salt",
            "1 teaspoon vanilla extract",
        ],
        "instructions": [
            "Preheat waffle iron.",
            "Whisk flour, sugar, baking powder, and salt in a large bowl.",
            "Separate the eggs. Whisk yolks with milk, melted butter, and vanilla.",
            "Pour wet ingredients into dry and stir until just combined.",
            "Beat egg whites to stiff peaks. Gently fold into the batter for extra lightness.",
            "Pour batter into the hot waffle iron and cook until golden and crisp, about 4-5 minutes.",
            "Serve with fresh berries, whipped cream, or maple syrup.",
        ],
        "prepTime": "PT10M",
        "cookTime": "PT20M",
        "recipeYield": "6 waffles",
        "recipeCategory": "breakfast",
        "recipeCuisine": "Belgian",
        "cookingMethod": "baking",
        "keywords": ["waffles", "breakfast", "belgian", "ternary-chart"],
    },
    {
        "name": "Crêpes",
        "text": "Thin French pancakes — more egg and milk relative to flour than American pancakes, making a delicate, foldable wrapper.",
        "ingredients": [
            "120g all-purpose flour",
            "2 large eggs (100g)",
            "240ml milk",
            "30g melted butter",
            "1 tablespoon sugar (for sweet crêpes)",
            "Pinch of salt",
        ],
        "instructions": [
            "Blend flour, eggs, milk, melted butter, sugar, and salt until completely smooth. No lumps.",
            "Rest the batter in the refrigerator for at least 30 minutes (or up to overnight). This relaxes the gluten.",
            "Heat a crêpe pan or non-stick skillet over medium-high heat. Lightly butter.",
            "Pour about 3 tablespoons of batter, immediately tilting the pan to coat the bottom in a thin, even layer.",
            "Cook until the edges lift and the bottom is lightly golden, about 1 minute.",
            "Flip with a thin spatula and cook another 30 seconds.",
            "Fill with Nutella, lemon and sugar, ham and cheese, or fresh fruit.",
        ],
        "prepTime": "PT40M",
        "cookTime": "PT20M",
        "recipeYield": "10 crêpes",
        "recipeCategory": "breakfast",
        "recipeCuisine": "French",
        "cookingMethod": "pan frying",
        "keywords": ["crêpes", "French", "thin pancakes", "ternary-chart"],
    },
    {
        "name": "French Toast",
        "text": "Bread soaked in egg custard and pan-fried. The bread is the flour component — the custard itself is egg-dominant.",
        "ingredients": [
            "4 thick slices bread (about 60g flour equivalent)",
            "3 large eggs (150g)",
            "120ml milk",
            "1 teaspoon vanilla extract",
            "1/2 teaspoon cinnamon",
            "Butter for cooking",
            "Pinch of salt",
        ],
        "instructions": [
            "Whisk eggs, milk, vanilla, cinnamon, and salt in a shallow dish.",
            "Heat butter in a skillet over medium heat.",
            "Dip each bread slice into the egg mixture, letting it soak for about 15 seconds per side.",
            "Place in the hot skillet and cook until golden brown, about 2-3 minutes per side.",
            "Serve immediately with maple syrup, powdered sugar, or fresh berries.",
        ],
        "prepTime": "PT5M",
        "cookTime": "PT10M",
        "recipeYield": "2 servings",
        "recipeCategory": "breakfast",
        "recipeCuisine": "French",
        "cookingMethod": "pan frying",
        "keywords": ["French toast", "breakfast", "custard", "ternary-chart"],
    },
    {
        "name": "Kaiserschmarrn",
        "text": "Shredded Austrian pancake — egg-heavy batter torn into caramelized pieces and dusted with powdered sugar. Named for the Kaiser.",
        "ingredients": [
            "120g all-purpose flour",
            "4 large eggs (200g), separated",
            "240ml milk",
            "30g sugar",
            "30g butter",
            "Pinch of salt",
            "Raisins (optional, soaked in rum)",
            "Powdered sugar for serving",
        ],
        "instructions": [
            "Whisk egg yolks, milk, flour, and a pinch of salt into a smooth batter.",
            "Beat egg whites with sugar until stiff glossy peaks form.",
            "Gently fold the egg whites into the batter in two additions.",
            "Melt butter in a large oven-safe skillet over medium heat.",
            "Pour in the batter and scatter raisins over the top if using.",
            "Cook until the bottom sets, about 3 minutes, then transfer to a 375°F (190°C) oven for 8-10 minutes.",
            "Remove from oven and tear the pancake into rough pieces with two forks.",
            "Return to stovetop over high heat, add a bit more butter, and toss until the pieces are lightly caramelized.",
            "Dust generously with powdered sugar and serve with plum compote or applesauce.",
        ],
        "prepTime": "PT15M",
        "cookTime": "PT20M",
        "recipeYield": "2 servings",
        "recipeCategory": "dessert",
        "recipeCuisine": "Austrian",
        "cookingMethod": "baking",
        "keywords": ["kaiserschmarrn", "Austrian", "pancake", "shredded", "ternary-chart"],
    },
    {
        "name": "Eggnog",
        "text": "Rich holiday drink — eggs and milk with no flour at all. The pure egg-milk axis of the ternary chart.",
        "ingredients": [
            "6 large eggs (300g), separated",
            "720ml whole milk",
            "150g sugar",
            "1 teaspoon vanilla extract",
            "1/2 teaspoon freshly grated nutmeg",
            "240ml heavy cream",
            "Bourbon or rum (optional)",
        ],
        "instructions": [
            "Beat egg yolks with sugar until thick and pale, about 3 minutes.",
            "Gradually stir in the milk, cream, vanilla, and nutmeg.",
            "If adding spirits, stir in 120ml bourbon or rum.",
            "Beat egg whites to soft peaks. Gently fold into the mixture.",
            "Chill for at least 2 hours.",
            "Serve cold with a fresh grating of nutmeg on top.",
        ],
        "prepTime": "PT15M",
        "recipeYield": "8 servings",
        "recipeCategory": "beverage",
        "recipeCuisine": "American",
        "keywords": ["eggnog", "holiday", "drink", "no-flour", "ternary-chart"],
    },
    {
        "name": "Custard-Base Ice Cream",
        "text": "French-style ice cream with an egg yolk custard base. More milk than egg, but the yolks give it richness and body.",
        "ingredients": [
            "4 large egg yolks (80g)",
            "480ml whole milk",
            "240ml heavy cream",
            "150g sugar",
            "1 teaspoon vanilla extract",
            "Pinch of salt",
        ],
        "instructions": [
            "Heat milk and cream in a saucepan until steaming but not boiling.",
            "Whisk egg yolks and sugar until pale and thick.",
            "Slowly pour the hot milk mixture into the yolks while whisking constantly (tempering).",
            "Return everything to the saucepan. Cook over medium-low heat, stirring constantly, until the custard coats the back of a spoon (170°F / 77°C).",
            "Strain through a fine mesh sieve into a clean bowl. Stir in vanilla and salt.",
            "Cool completely, then refrigerate at least 4 hours or overnight.",
            "Churn in an ice cream maker according to manufacturer's directions.",
            "Transfer to a container and freeze until firm, at least 4 hours.",
        ],
        "prepTime": "PT20M",
        "cookTime": "PT15M",
        "totalTime": "PT8H",
        "recipeYield": "1 quart",
        "recipeCategory": "dessert",
        "recipeCuisine": "French",
        "cookingMethod": "freezing",
        "keywords": ["ice cream", "custard", "French", "frozen", "ternary-chart"],
    },
    {
        "name": "Baked Custard",
        "text": "The simplest set custard — just eggs and milk, baked low and slow. Pure alchemy on the egg-milk axis.",
        "ingredients": [
            "4 large eggs (200g)",
            "480ml whole milk",
            "100g sugar",
            "1 teaspoon vanilla extract",
            "Pinch of salt",
            "Freshly grated nutmeg",
        ],
        "instructions": [
            "Preheat oven to 325°F (165°C).",
            "Whisk eggs, sugar, vanilla, and salt until smooth. Do not overbeat — you don't want foam.",
            "Heat milk until warm (not hot). Gradually whisk into the egg mixture.",
            "Strain through a fine sieve into ramekins or a baking dish.",
            "Grate nutmeg over the top.",
            "Place ramekins in a larger baking pan. Pour hot water into the outer pan to come halfway up the sides (bain-marie).",
            "Bake for 40-50 minutes until set but still slightly jiggly in the center.",
            "Cool to room temperature, then refrigerate until chilled.",
        ],
        "prepTime": "PT10M",
        "cookTime": "PT50M",
        "recipeYield": "4 servings",
        "recipeCategory": "dessert",
        "cookingMethod": "baking",
        "keywords": ["custard", "baked", "simple", "egg", "ternary-chart"],
    },
    {
        "name": "Flan",
        "text": "Caramel-topped custard, unmolded to reveal a glossy amber cap. More egg than plain custard — it needs to hold its shape.",
        "ingredients": [
            "5 large eggs (250g)",
            "480ml whole milk",
            "200g sugar (divided: 120g for caramel, 80g for custard)",
            "1 teaspoon vanilla extract",
            "Pinch of salt",
        ],
        "instructions": [
            "Make the caramel: heat 120g sugar in a saucepan over medium heat, swirling (not stirring) until amber. Pour into ramekins or a baking dish, tilting to coat the bottom.",
            "Preheat oven to 325°F (165°C).",
            "Whisk eggs, remaining sugar, vanilla, and salt.",
            "Warm the milk and gradually whisk into the egg mixture.",
            "Strain and pour over the caramel.",
            "Bake in a bain-marie for 50-60 minutes until set with a slight jiggle.",
            "Cool completely, then refrigerate at least 4 hours.",
            "To serve, run a knife around the edge and invert onto a plate. The caramel becomes the sauce.",
        ],
        "prepTime": "PT15M",
        "cookTime": "PT60M",
        "recipeYield": "6 servings",
        "recipeCategory": "dessert",
        "recipeCuisine": "Spanish",
        "cookingMethod": "baking",
        "keywords": ["flan", "caramel", "custard", "Spanish", "ternary-chart"],
    },
    {
        "name": "Quiche Lorraine",
        "text": "Savory custard in pastry. The crust contributes the flour component, while the filling is egg-and-milk territory.",
        "ingredients": [
            "## Pastry crust",
            "125g all-purpose flour",
            "60g cold butter, cubed",
            "1 egg yolk",
            "2-3 tablespoons ice water",
            "Pinch of salt",
            "## Filling",
            "4 large eggs (200g)",
            "360ml heavy cream or half-and-half",
            "150g lardons or bacon, cooked",
            "100g Gruyère cheese, grated",
            "Salt and pepper to taste",
            "Pinch of nutmeg",
        ],
        "instructions": [
            "Make the crust: pulse flour, butter, and salt in a food processor until pea-sized. Add yolk and water, pulse until dough comes together. Wrap and chill 30 minutes.",
            "Roll out the dough and fit into a 9-inch tart pan. Prick the bottom with a fork.",
            "Blind bake at 375°F (190°C) with pie weights for 15 minutes. Remove weights and bake 5 more minutes.",
            "Scatter cooked lardons and cheese over the crust.",
            "Whisk eggs, cream, salt, pepper, and nutmeg. Pour over the filling.",
            "Bake at 350°F (175°C) for 30-35 minutes until set and lightly golden on top.",
            "Cool 10 minutes before slicing. Serve warm or at room temperature.",
        ],
        "prepTime": "PT45M",
        "cookTime": "PT50M",
        "recipeYield": "6 servings",
        "recipeCategory": "main course",
        "recipeCuisine": "French",
        "cookingMethod": "baking",
        "keywords": ["quiche", "Lorraine", "savory", "custard", "pastry", "ternary-chart"],
    },
    {
        "name": "Dutch Baby",
        "text": "A dramatic oven-puffed popover pancake. Egg-heavy — the eggs provide all the leavening as they puff in a screaming hot pan.",
        "ingredients": [
            "65g all-purpose flour",
            "3 large eggs (150g)",
            "120ml milk",
            "30g butter",
            "1 tablespoon sugar",
            "1/2 teaspoon vanilla extract",
            "Pinch of salt",
            "Lemon juice and powdered sugar for serving",
        ],
        "instructions": [
            "Place a 10-inch cast iron skillet in the oven. Preheat to 425°F (220°C).",
            "Blend eggs, flour, milk, sugar, vanilla, and salt until completely smooth.",
            "When the oven is hot, carefully remove the skillet and add the butter. Swirl until melted and foaming.",
            "Immediately pour in the batter.",
            "Bake for 20-25 minutes until dramatically puffed and deeply golden. Do not open the oven door during baking.",
            "Remove from oven — it will deflate slightly. That's expected.",
            "Squeeze lemon juice over the top and dust with powdered sugar. Serve immediately.",
        ],
        "prepTime": "PT5M",
        "cookTime": "PT25M",
        "recipeYield": "2 servings",
        "recipeCategory": "breakfast",
        "recipeCuisine": "American",
        "cookingMethod": "baking",
        "keywords": ["Dutch baby", "popover", "pancake", "puffed", "ternary-chart"],
    },
    {
        "name": "Farina (Cream of Wheat)",
        "text": "Flour and milk with no egg at all. The pure flour-milk axis — hot cereal comfort in its simplest form.",
        "ingredients": [
            "85g farina or cream of wheat",
            "240ml whole milk",
            "240ml water",
            "1 tablespoon butter",
            "1-2 tablespoons sugar or honey",
            "Pinch of salt",
            "Cinnamon (optional)",
        ],
        "instructions": [
            "Bring milk, water, and salt to a gentle boil in a saucepan.",
            "Slowly whisk in the farina in a steady stream to prevent lumps.",
            "Reduce heat to low. Stir frequently for 3-5 minutes until thick and creamy.",
            "Remove from heat. Stir in butter and sweetener.",
            "Serve hot, topped with a pat of butter, a drizzle of honey, fresh berries, or a dusting of cinnamon.",
        ],
        "prepTime": "PT2M",
        "cookTime": "PT5M",
        "recipeYield": "2 servings",
        "recipeCategory": "breakfast",
        "cookingMethod": "boiling",
        "keywords": ["farina", "cream of wheat", "porridge", "no-egg", "ternary-chart"],
    },
    {
        "name": "Pannukakku",
        "text": "Finnish oven pancake — a huge, custardy sheet baked in a pan. Milk-dominant with a soft, almost flan-like center.",
        "ingredients": [
            "120g all-purpose flour",
            "3 large eggs (150g)",
            "600ml whole milk",
            "60g sugar",
            "60g melted butter",
            "1 teaspoon vanilla extract",
            "1/2 teaspoon cardamom (optional, traditional)",
            "Pinch of salt",
        ],
        "instructions": [
            "Preheat oven to 400°F (200°C). Place a 9x13 baking dish or large cast iron skillet in the oven with a tablespoon of butter.",
            "Whisk eggs, sugar, and salt. Add milk and vanilla.",
            "Sift in the flour and whisk until smooth. Stir in the melted butter and cardamom.",
            "Pour the batter into the hot buttered dish.",
            "Bake for 30-35 minutes until puffed and golden brown. The center will be custardy.",
            "Let cool slightly — it will settle. Cut into squares.",
            "Serve warm with berry jam, fresh berries, or a dusting of powdered sugar.",
        ],
        "prepTime": "PT10M",
        "cookTime": "PT35M",
        "recipeYield": "6 servings",
        "recipeCategory": "breakfast",
        "recipeCuisine": "Finnish",
        "cookingMethod": "baking",
        "keywords": ["pannukakku", "Finnish", "oven pancake", "custardy", "ternary-chart"],
    },
]


def main():
    parser = argparse.ArgumentParser(description="Seed ternary chart recipes to ATProto PDS")
    parser.add_argument("--handle", required=True, help="Bluesky handle")
    parser.add_argument("--password", required=True, help="App password")
    parser.add_argument("--dry-run", action="store_true", help="Print records without publishing")
    args = parser.parse_args()

    if args.dry_run:
        for recipe in RECIPES:
            now = now_iso()
            record = {
                "$type": "exchange.recipe.recipe",
                **recipe,
                "createdAt": now,
                "updatedAt": now,
            }
            print(json.dumps(record, indent=2))
            print("---")
        print(f"\n{len(RECIPES)} recipes (dry run)")
        return

    print(f"Authenticating as {args.handle}...")
    session = create_session(args.handle, args.password)
    print(f"Authenticated: {session['did']}")
    print(f"PDS: {session['pds']}")
    print()

    published = []
    for recipe in RECIPES:
        now = now_iso()
        record = {
            "$type": "exchange.recipe.recipe",
            **recipe,
            "createdAt": now,
            "updatedAt": now,
        }
        print(f"  Publishing: {recipe['name']}...")
        result = publish_record(session, record)
        print(f"    -> {result['uri']}")
        published.append({"name": recipe["name"], "uri": result["uri"]})

    print(f"\nPublished {len(published)} recipes.")
    print("\nAT URIs:")
    for p in published:
        print(f"  {p['name']}: {p['uri']}")


if __name__ == "__main__":
    main()
