/**
 * Transform bakery calculator state into an exchange.recipe.recipe record.
 */

export function calculatorToRecipe({ name, description, state, flours, enrichments, starterFlours, nutrition }) {
  const now = new Date().toISOString();

  // Build ingredient lines from calculator state
  const ingredients = [];

  // Flour blend
  const effectiveGrams = state.usePercentMode
    ? state.blendPercents.map((p) => (p / 100) * state.totalFlourInLoaf)
    : state.blendGrams;

  const totalFlour = effectiveGrams.reduce((a, b) => a + b, 0);

  ingredients.push("## Flour Blend");
  effectiveGrams.forEach((g, i) => {
    if (g > 0) {
      const pct = totalFlour > 0 ? ((g / totalFlour) * 100).toFixed(0) : 0;
      ingredients.push(`${Math.round(g)}g ${flours[i].name} (${pct}%)`);
    }
  });

  // Water
  if (state.waterGrams > 0) {
    ingredients.push("## Liquids & Leavening");
    ingredients.push(`${Math.round(state.waterGrams)}g water`);
  }

  // Salt
  if (state.saltGrams > 0) {
    ingredients.push(`${Number(state.saltGrams.toFixed(1))}g salt`);
  }

  // Starter
  if (state.starterEnabled && state.starterGrams > 0) {
    const flourName = starterFlours[state.starterFlourIdx]?.name || "starter";
    ingredients.push(
      `${Math.round(state.starterGrams)}g sourdough starter (${state.starterHydration}% hydration, ${flourName})`
    );
  }

  // Enrichments
  if (state.isEnriched) {
    const enrichLines = [];
    for (const en of enrichments) {
      const amount = state.enrichAmounts[en.key];
      if (amount > 0) {
        enrichLines.push(`${amount}${en.unit} ${en.label.toLowerCase()}`);
      }
    }
    if (enrichLines.length > 0) {
      ingredients.push("## Enrichments");
      ingredients.push(...enrichLines);
    }
  }

  // Build instructions
  const totalAllFlour =
    totalFlour +
    (state.starterEnabled && state.starterGrams > 0
      ? state.starterGrams / (1 + state.starterHydration / 100)
      : 0);

  const hydration =
    totalAllFlour > 0
      ? ((state.waterGrams +
          (state.starterEnabled && state.starterGrams > 0
            ? state.starterGrams -
              state.starterGrams / (1 + state.starterHydration / 100)
            : 0)) /
          totalAllFlour) *
        100
      : 0;

  const instructions = [];
  instructions.push("## Autolyse");
  instructions.push(
    `Mix ${Math.round(totalFlour)}g flour blend with ${Math.round(state.waterGrams)}g water. Rest 30 minutes.`
  );

  instructions.push("## Mix");
  const mixParts = [];
  if (state.saltGrams > 0) mixParts.push("salt");
  if (state.starterEnabled && state.starterGrams > 0) mixParts.push("starter");
  if (state.isEnriched) {
    const enrichNames = enrichments
      .filter((en) => state.enrichAmounts[en.key] > 0)
      .map((en) => en.label.toLowerCase());
    mixParts.push(...enrichNames);
  }
  if (mixParts.length > 0) {
    instructions.push(
      `Add ${mixParts.join(", ")} to the dough. Mix until well incorporated.`
    );
  }

  instructions.push("## Bulk Fermentation");
  instructions.push(
    `Ferment at room temperature. Perform stretch and folds every 30 minutes for the first 2 hours. Target: ${hydration.toFixed(0)}% hydration dough.`
  );

  instructions.push("## Shape & Proof");
  instructions.push(
    "Pre-shape into a round, bench rest 20 minutes, then final shape. Cold proof in the refrigerator overnight."
  );

  instructions.push("## Bake");
  instructions.push(
    "Preheat oven with dutch oven to 500F (260C). Score the loaf and bake covered 20 minutes, then uncovered at 450F (230C) for 20-25 minutes until deep golden brown."
  );

  // Build the record
  const record = {
    $type: "exchange.recipe.recipe",
    name: name || "Untitled Bread Recipe",
    text: description || `A ${hydration.toFixed(0)}% hydration bread recipe designed with the Flour Blend Calculator.`,
    ingredients,
    instructions,
    cookingMethod: "exchange.recipe.defs#cookingMethodBaking",
    recipeCategory: "exchange.recipe.defs#categoryBreakfast",
    createdAt: now,
    updatedAt: now,
  };

  // Add nutrition if available
  if (nutrition && nutrition.calories > 0) {
    record.nutrition = {
      calories: Math.round(nutrition.calories),
      fatContent: Number(nutrition.totalFat?.toFixed(1)) || 0,
      proteinContent: Number(nutrition.protein?.toFixed(1)) || 0,
      carbohydrateContent: Number(nutrition.totalCarb?.toFixed(1)) || 0,
    };
  }

  // Build keywords from flour types used
  const keywords = [];
  effectiveGrams.forEach((g, i) => {
    if (g > 0) keywords.push(flours[i].name.split(" (")[0].toLowerCase());
  });
  if (state.starterEnabled) keywords.push("sourdough");
  if (state.isEnriched) keywords.push("enriched");
  keywords.push("bread");
  record.keywords = [...new Set(keywords)].slice(0, 8);

  return record;
}

/**
 * Parse an AT URI into its components.
 */
export function parseAtUri(uri) {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { repo: match[1], collection: match[2], rkey: match[3] };
}

/**
 * Format an ISO 8601 duration into a human-readable string.
 */
export function formatDuration(dur) {
  if (!dur) return "";
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return dur;
  const parts = [];
  if (m[1]) parts.push(`${m[1]}h`);
  if (m[2]) parts.push(`${m[2]}m`);
  if (m[3]) parts.push(`${m[3]}s`);
  return parts.join(" ") || dur;
}
