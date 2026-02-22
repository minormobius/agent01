import { useState, useMemo, useEffect, useCallback } from "react";
import ATProtoPanel from "./ATProtoPanel";
import TernaryChart from "./TernaryChart";

const FLOURS = [
  {
    name: "Einkorn (Unifine)",
    servingG: 96,
    servingLabel: "1/2 cup",
    calories: 340, totalFat: 3, saturatedFat: 0, transFat: 0, cholesterol: 0,
    sodium: 0, totalCarb: 64, fiber: 8, totalSugars: 0, addedSugars: 0,
    protein: 18, vitaminD: 0, calcium: 80, iron: 4.32, potassium: 0,
    color: "#b8860b",
    tip: "Ancient grain, rich in protein & carotenoids. Weak gluten — best blended or for flatbreads.",
  },
  {
    name: "Dark Rye (Unifine)",
    servingG: 42,
    servingLabel: "1/4 cup",
    calories: 140, totalFat: 0.5, saturatedFat: 0.083, transFat: 0, cholesterol: 0,
    sodium: 0, totalCarb: 32, fiber: 6, totalSugars: 0, addedSugars: 0,
    protein: 4, vitaminD: 0, calcium: 10, iron: 1.11, potassium: 215,
    color: "#5c4033",
    tip: "Very high fiber, absorbs more water than wheat. Speeds up fermentation — reduce starter % when using a lot.",
  },
  {
    name: "Khorasan (Unifine)",
    servingG: 34,
    servingLabel: "1/4 cup",
    calories: 110, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
    sodium: 0, totalCarb: 24, fiber: 4, totalSugars: 0, addedSugars: 0,
    protein: 4, vitaminD: 0, calcium: 0, iron: 0.32, potassium: 0,
    color: "#daa520",
    tip: "Marketed as Kamut. Buttery flavor, good extensibility but low elasticity. Great in pasta and enriched breads.",
  },
  {
    name: "Spelt White (Ultra-Unifine)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 120, totalFat: 1, saturatedFat: 0, transFat: 0, cholesterol: 0,
    sodium: 1, totalCarb: 22, fiber: 4, totalSugars: 0, addedSugars: 0,
    protein: 4, vitaminD: 0, calcium: 0, iron: 1.44, potassium: 116,
    color: "#f5deb3",
    tip: "Delicate, fragile gluten — don't over-knead. Lower hydration than wheat. Mild, slightly sweet flavor.",
  },
  {
    name: "Hard Red Wheat (Costco)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 110, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
    sodium: 0, totalCarb: 23, fiber: 1, totalSugars: 0, addedSugars: 0,
    protein: 4, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
    color: "#cd853f",
    tip: "Workhorse bread flour. Strong gluten, reliable structure. Good base for any sourdough loaf.",
  },
  {
    name: "Whole Wheat (Sprouts)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 100, totalFat: 1, saturatedFat: 0, transFat: 0, cholesterol: 0,
    sodium: 0, totalCarb: 22, fiber: 3, totalSugars: 0, addedSugars: 0,
    protein: 4, vitaminD: 0, calcium: 10, iron: 1, potassium: 109,
    color: "#d2691e",
    tip: "Bran cuts gluten strands — expect denser crumb above 50%. Needs more water and longer autolyse.",
  },
];

// FDA daily values for %DV calculation
const DAILY_VALUES = {
  totalFat: 78, saturatedFat: 20, cholesterol: 300, sodium: 2300,
  totalCarb: 275, fiber: 28, addedSugars: 50, protein: 50,
  calcium: 1300, iron: 18, potassium: 4700, vitaminD: 20,
};

const NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "", bold: true },
  { key: "totalFat", label: "Total Fat", unit: "g", bold: true, dv: true },
  { key: "saturatedFat", label: "Saturated Fat", unit: "g", indent: true, dv: true },
  { key: "transFat", label: "Trans Fat", unit: "g", indent: true },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", bold: true, dv: true },
  { key: "sodium", label: "Sodium", unit: "mg", bold: true, dv: true },
  { key: "totalCarb", label: "Total Carbohydrate", unit: "g", bold: true, dv: true },
  { key: "fiber", label: "Dietary Fiber", unit: "g", indent: true, dv: true },
  { key: "totalSugars", label: "Total Sugars", unit: "g", indent: true },
  { key: "addedSugars", label: "Incl. Added Sugars", unit: "g", indent: true, dv: true, extraIndent: true },
  { key: "protein", label: "Protein", unit: "g", bold: true, dv: true },
  { key: "vitaminD", label: "Vitamin D", unit: "mcg", dv: true, bottom: true },
  { key: "calcium", label: "Calcium", unit: "mg", dv: true, bottom: true },
  { key: "iron", label: "Iron", unit: "mg", dv: true, bottom: true },
  { key: "potassium", label: "Potassium", unit: "mg", dv: true, bottom: true },
];

const ENRICHMENTS = [
  {
    key: "butter", label: "Butter", emoji: "\u{1F9C8}", unit: "g", color: "#f9e076",
    per100: { calories: 717, totalFat: 81, saturatedFat: 51, transFat: 0, cholesterol: 215, sodium: 11, totalCarb: 0.06, fiber: 0, totalSugars: 0.06, addedSugars: 0, protein: 0.85, vitaminD: 0, calcium: 24, iron: 0.02, potassium: 24 },
  },
  {
    key: "eggs", label: "Eggs", emoji: "\u{1F95A}", unit: "eggs", gramsPerUnit: 50, color: "#ffe0b2",
    per100: { calories: 143, totalFat: 9.5, saturatedFat: 3.1, transFat: 0, cholesterol: 372, sodium: 142, totalCarb: 0.72, fiber: 0, totalSugars: 0.37, addedSugars: 0, protein: 12.6, vitaminD: 2, calcium: 56, iron: 1.75, potassium: 138 },
  },
  {
    key: "milk", label: "Whole Milk", emoji: "\u{1F95B}", unit: "g", color: "#e3f2fd",
    per100: { calories: 61, totalFat: 3.25, saturatedFat: 1.87, transFat: 0, cholesterol: 14, sodium: 43, totalCarb: 4.8, fiber: 0, totalSugars: 5.05, addedSugars: 0, protein: 3.15, vitaminD: 1.3, calcium: 113, iron: 0.03, potassium: 132 },
  },
  {
    key: "oliveOil", label: "Olive Oil", emoji: "\u{1FAD2}", unit: "g", color: "#c5e1a5",
    per100: { calories: 884, totalFat: 100, saturatedFat: 13.8, transFat: 0, cholesterol: 0, sodium: 2, totalCarb: 0, fiber: 0, totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0, calcium: 1, iron: 0.56, potassium: 1 },
  },
  {
    key: "sugar", label: "Sugar", emoji: "\u{1F36C}", unit: "g", color: "#f5f5f5",
    per100: { calories: 387, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 1, totalCarb: 100, fiber: 0, totalSugars: 100, addedSugars: 100, protein: 0, vitaminD: 0, calcium: 1, iron: 0.01, potassium: 2 },
  },
];

// Starter flour types — user picks which flour their starter is fed with
const STARTER_FLOURS = [
  {
    name: "White / AP Flour",
    color: "#e8e0d8",
    tip: "Most common. Mild flavor, predictable rise, fast fermentation.",
    per100: { calories: 364, totalFat: 1, saturatedFat: 0.15, transFat: 0, cholesterol: 0, sodium: 2, totalCarb: 76, fiber: 2.7, totalSugars: 0.27, addedSugars: 0, protein: 10, vitaminD: 0, calcium: 15, iron: 4.64, potassium: 107 },
  },
  {
    name: "Whole Wheat",
    color: "#d2691e",
    tip: "More mineral-rich, more microbial diversity. Ferments faster and more sour than white.",
    per100: { calories: 332, totalFat: 2.5, saturatedFat: 0.43, transFat: 0, cholesterol: 0, sodium: 2, totalCarb: 71, fiber: 10.7, totalSugars: 0.41, addedSugars: 0, protein: 13, vitaminD: 0, calcium: 34, iron: 3.6, potassium: 363 },
  },
  {
    name: "Rye",
    color: "#5c4033",
    tip: "Most active fermentation, tangiest flavor. Great for boosting a sluggish starter.",
    per100: { calories: 325, totalFat: 2.5, saturatedFat: 0.3, transFat: 0, cholesterol: 0, sodium: 1, totalCarb: 69, fiber: 15.1, totalSugars: 0.8, addedSugars: 0, protein: 10.9, vitaminD: 0, calcium: 24, iron: 2.63, potassium: 396 },
  },
];

function per100(flour, key) {
  return (flour[key] / flour.servingG) * 100;
}

function formatNum(n) {
  if (n === 0) return "0";
  if (n < 0.1) return n.toFixed(2);
  if (n < 1) return n.toFixed(1);
  return Math.round(n).toString();
}

const STORAGE_KEY = "bakery-saved-recipes";

function loadRecipes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveRecipes(recipes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

// Shared card style
const card = (active, borderColor) => ({
  background: "#fff",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  border: active ? `2px solid ${borderColor}` : "2px solid transparent",
});

function SliderRow({ min = 0, max, step, value, onChange, color, unitLabel }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: color }} />
      <input type="number" min={min} value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
        style={{ width: 56, padding: "4px 6px", borderRadius: 6, border: "1px solid #d7ccc8", fontSize: 14, textAlign: "center" }} />
      <span style={{ fontSize: 12, color: "#a1887f", width: 30 }}>{unitLabel}</span>
    </div>
  );
}

export default function FlourBlendCalculator() {
  const [tab, setTab] = useState("blend");
  const [blendGrams, setBlendGrams] = useState(FLOURS.map(() => 0));
  const [totalFlourInLoaf, setTotalFlourInLoaf] = useState(500);
  const [usePercentMode, setUsePercentMode] = useState(true);
  const [blendPercents, setBlendPercents] = useState(FLOURS.map(() => 0));
  const [waterGrams, setWaterGrams] = useState(0);
  const [saltGrams, setSaltGrams] = useState(0);
  const [isEnriched, setIsEnriched] = useState(false);
  const [enrichAmounts, setEnrichAmounts] = useState({ butter: 0, eggs: 0, milk: 0, oliveOil: 0, sugar: 0 });
  const [starterEnabled, setStarterEnabled] = useState(false);
  const [starterGrams, setStarterGrams] = useState(0);
  const [starterHydration, setStarterHydration] = useState(100);
  const [starterFlourIdx, setStarterFlourIdx] = useState(0);
  const [recipeInstructions, setRecipeInstructions] = useState("");
  const [savedRecipes, setSavedRecipes] = useState(loadRecipes);
  const [recipeName, setRecipeName] = useState("");

  const totalBlendPercent = blendPercents.reduce((a, b) => a + b, 0);

  const effectiveGrams = useMemo(() => {
    if (usePercentMode) {
      return blendPercents.map((p) => (p / 100) * totalFlourInLoaf);
    }
    return blendGrams;
  }, [usePercentMode, blendPercents, blendGrams, totalFlourInLoaf]);

  const totalEffective = effectiveGrams.reduce((a, b) => a + b, 0);

  // Starter contributes both flour and water
  const starterFlourG = useMemo(() => {
    if (!starterEnabled || starterGrams <= 0) return 0;
    return starterGrams / (1 + starterHydration / 100);
  }, [starterEnabled, starterGrams, starterHydration]);

  const starterWaterG = useMemo(() => {
    if (!starterEnabled || starterGrams <= 0) return 0;
    return starterGrams - starterFlourG;
  }, [starterEnabled, starterGrams, starterFlourG]);

  // Total flour includes starter flour contribution
  const totalAllFlour = totalEffective + starterFlourG;

  const hydrationPercent = useMemo(() => {
    if (totalAllFlour === 0) return 0;
    let totalLiquid = waterGrams + starterWaterG;
    if (isEnriched) {
      const milkG = enrichAmounts.milk;
      const eggG = enrichAmounts.eggs * 50;
      totalLiquid += milkG * 0.87 + eggG * 0.75;
    }
    return (totalLiquid / totalAllFlour) * 100;
  }, [totalAllFlour, waterGrams, starterWaterG, isEnriched, enrichAmounts]);

  const saltPercent = useMemo(() => {
    if (totalAllFlour === 0) return 0;
    return (saltGrams / totalAllFlour) * 100;
  }, [saltGrams, totalAllFlour]);

  const blendNutrition = useMemo(() => {
    const result = {};
    NUTRIENTS.forEach(({ key }) => {
      let total = 0;
      // Flour blend
      effectiveGrams.forEach((g, i) => {
        if (g > 0) total += (FLOURS[i][key] / FLOURS[i].servingG) * g;
      });
      // Enrichments
      if (isEnriched) {
        ENRICHMENTS.forEach((en) => {
          const amount = enrichAmounts[en.key];
          if (amount > 0) {
            const grams = en.gramsPerUnit ? amount * en.gramsPerUnit : amount;
            total += (en.per100[key] / 100) * grams;
          }
        });
      }
      // Starter flour nutrition
      if (starterEnabled && starterFlourG > 0) {
        const sf = STARTER_FLOURS[starterFlourIdx];
        total += (sf.per100[key] / 100) * starterFlourG;
      }
      // Salt sodium: salt is ~38.76% sodium by weight
      if (key === "sodium") {
        total += saltGrams * 387.6;
      }
      result[key] = total;
    });
    return result;
  }, [effectiveGrams, isEnriched, enrichAmounts, starterEnabled, starterFlourG, starterFlourIdx, saltGrams]);

  const handlePercentChange = (idx, val) => {
    const next = [...blendPercents];
    next[idx] = Math.max(0, Math.min(100, val));
    setBlendPercents(next);
  };

  const handleGramChange = (idx, val) => {
    const next = [...blendGrams];
    next[idx] = Math.max(0, val);
    setBlendGrams(next);
  };

  const handleEnrichChange = (key, val) => {
    setEnrichAmounts((prev) => ({ ...prev, [key]: Math.max(0, val) }));
  };

  // Save / load recipes
  const getRecipeState = useCallback(() => ({
    blendPercents, blendGrams, totalFlourInLoaf, usePercentMode,
    waterGrams, saltGrams, isEnriched, enrichAmounts,
    starterEnabled, starterGrams, starterHydration, starterFlourIdx,
    recipeInstructions,
  }), [blendPercents, blendGrams, totalFlourInLoaf, usePercentMode,
    waterGrams, saltGrams, isEnriched, enrichAmounts,
    starterEnabled, starterGrams, starterHydration, starterFlourIdx,
    recipeInstructions]);

  const handleSaveRecipe = () => {
    const name = recipeName.trim() || `Recipe ${savedRecipes.length + 1}`;
    const recipe = { name, ts: Date.now(), state: getRecipeState() };
    const next = [recipe, ...savedRecipes.filter((r) => r.name !== name)];
    setSavedRecipes(next);
    saveRecipes(next);
  };

  const handleLoadRecipe = (recipe) => {
    const s = recipe.state;
    setBlendPercents(s.blendPercents);
    setBlendGrams(s.blendGrams);
    setTotalFlourInLoaf(s.totalFlourInLoaf);
    setUsePercentMode(s.usePercentMode);
    setWaterGrams(s.waterGrams);
    setSaltGrams(s.saltGrams ?? 0);
    setIsEnriched(s.isEnriched);
    setEnrichAmounts(s.enrichAmounts);
    setStarterEnabled(s.starterEnabled ?? false);
    setStarterGrams(s.starterGrams ?? 0);
    setStarterHydration(s.starterHydration ?? 100);
    setStarterFlourIdx(s.starterFlourIdx ?? 0);
    setRecipeInstructions(s.recipeInstructions ?? "");
    setRecipeName(recipe.name);
  };

  const handleDeleteRecipe = (name) => {
    const next = savedRecipes.filter((r) => r.name !== name);
    setSavedRecipes(next);
    saveRecipes(next);
  };

  // Load a recipe from ATProto record into the calculator
  const handleLoadFromAT = (parsedName, parsedState) => {
    const s = parsedState;
    setBlendPercents(s.blendPercents);
    setBlendGrams(s.blendGrams);
    setTotalFlourInLoaf(s.totalFlourInLoaf);
    setUsePercentMode(s.usePercentMode);
    setWaterGrams(s.waterGrams);
    setSaltGrams(s.saltGrams ?? 0);
    setIsEnriched(s.isEnriched);
    setEnrichAmounts(s.enrichAmounts);
    setStarterEnabled(s.starterEnabled ?? false);
    setStarterGrams(s.starterGrams ?? 0);
    setStarterHydration(s.starterHydration ?? 100);
    setStarterFlourIdx(s.starterFlourIdx ?? 0);
    setRecipeInstructions(s.recipeInstructions ?? "");
    setRecipeName(parsedName);
    setTab("blend");
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", maxWidth: 900, margin: "0 auto", padding: "16px", background: "#faf8f5", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#3e2723", margin: 0, letterSpacing: "-0.5px" }}>
          {"\u{1F33E}"} Flour Blend Calculator
        </h1>
        <p style={{ color: "#795548", fontSize: 14, margin: "6px 0 0" }}>
          Design your perfect loaf
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 10, overflow: "hidden", border: "1px solid #d7ccc8" }}>
        {[
          { id: "blend", label: "\u{1F35E} Recipe Builder" },
          { id: "reference", label: "\u{1F4D6} Flour Reference" },
          { id: "atproto", label: "\u{1F310} AT Protocol" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "12px 16px", border: "none",
            background: tab === t.id ? "#5d4037" : "#efebe9",
            color: tab === t.id ? "#fff" : "#5d4037",
            fontWeight: 600, fontSize: 15, cursor: "pointer", transition: "all 0.2s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== RECIPE BUILDER TAB ====== */}
      {tab === "blend" && (
        <div>
          {/* Save / Load bar */}
          <div style={{ ...card(false, ""), display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text" placeholder="Recipe name..." value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 6, border: "1px solid #d7ccc8", fontSize: 14, color: "#3e2723" }}
            />
            <button onClick={handleSaveRecipe} disabled={totalEffective === 0}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: totalEffective > 0 ? "#5d4037" : "#d7ccc8", color: totalEffective > 0 ? "#fff" : "#a1887f",
              }}>
              Save
            </button>
            {savedRecipes.length > 0 && (
              <div style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {savedRecipes.map((r) => (
                  <div key={r.name} style={{
                    display: "flex", alignItems: "center", gap: 4, background: "#efebe9",
                    borderRadius: 20, padding: "3px 6px 3px 10px", fontSize: 12, color: "#5d4037",
                  }}>
                    <span style={{ cursor: "pointer", fontWeight: 500 }} onClick={() => handleLoadRecipe(r)}>
                      {r.name}
                    </span>
                    <button onClick={() => handleDeleteRecipe(r.name)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#a1887f", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>
                      {"\u00d7"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14, color: "#5d4037" }}>
              <input type="checkbox" checked={usePercentMode} onChange={(e) => setUsePercentMode(e.target.checked)} style={{ accentColor: "#5d4037" }} />
              <span style={{ fontWeight: 600 }}>Percentage mode</span>
            </label>
            {usePercentMode && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#5d4037" }}>
                Total flour in loaf:
                <input type="number" value={totalFlourInLoaf} onChange={(e) => setTotalFlourInLoaf(Math.max(1, Number(e.target.value)))}
                  style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid #d7ccc8", fontSize: 14, textAlign: "center" }} />
                <span>g</span>
              </label>
            )}
          </div>

          {/* Flour sliders */}
          <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
            {FLOURS.map((f, i) => {
              const val = usePercentMode ? blendPercents[i] : blendGrams[i];
              const grams = effectiveGrams[i];
              return (
                <div key={i} style={{ ...card(grams > 0, f.color) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: f.color, marginRight: 8 }} />
                      {f.name}
                    </span>
                    <span style={{ fontSize: 13, color: "#795548" }}>
                      {usePercentMode ? `${val}% \u2192 ${Math.round(grams)}g` : `${val}g`}
                    </span>
                  </div>
                  <SliderRow min={0} max={usePercentMode ? 100 : 1000} step={usePercentMode ? 5 : 10}
                    value={val} onChange={(v) => usePercentMode ? handlePercentChange(i, v) : handleGramChange(i, v)}
                    color={f.color} unitLabel={usePercentMode ? "%" : "g"} />
                </div>
              );
            })}
          </div>

          {/* Water & Hydration */}
          <div style={card(waterGrams > 0, "#42a5f5")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                {"\u{1F4A7}"} Water
              </span>
              {totalAllFlour > 0 && waterGrams > 0 && (
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: hydrationPercent >= 58 && hydrationPercent <= 75 ? "#2e7d32" : "#e65100",
                  background: hydrationPercent >= 58 && hydrationPercent <= 75 ? "#e8f5e9" : "#fff3e0",
                  padding: "2px 10px", borderRadius: 20,
                }}>
                  {Math.round(hydrationPercent)}% hydration
                </span>
              )}
            </div>
            <SliderRow min={0} max={usePercentMode ? Math.round(totalFlourInLoaf * 1.2) : 2000} step={5}
              value={waterGrams} onChange={setWaterGrams} color="#42a5f5" unitLabel="g" />
            {totalAllFlour > 0 && (
              <div style={{ fontSize: 11, color: "#8d6e63", marginTop: 6 }}>
                {starterEnabled || isEnriched
                  ? "Effective hydration includes water from starter" + (isEnriched ? ", milk & eggs" : "")
                  : "Hydration = water \u00f7 flour \u00d7 100"}
              </div>
            )}
          </div>

          {/* Salt */}
          <div style={card(saltGrams > 0, "#78909c")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                {"\u{1F9C2}"} Salt
              </span>
              {totalAllFlour > 0 && saltGrams > 0 && (
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: saltPercent >= 1.8 && saltPercent <= 2.2 ? "#2e7d32" : "#e65100",
                  background: saltPercent >= 1.8 && saltPercent <= 2.2 ? "#e8f5e9" : "#fff3e0",
                  padding: "2px 10px", borderRadius: 20,
                }}>
                  {saltPercent.toFixed(1)}% baker's %
                </span>
              )}
            </div>
            <SliderRow min={0} max={50} step={1} value={saltGrams} onChange={setSaltGrams} color="#78909c" unitLabel="g" />
            {totalAllFlour > 0 && (
              <div style={{ fontSize: 11, color: "#8d6e63", marginTop: 6 }}>
                Typical: 1.8\u20132.2% of total flour. Salt strengthens gluten and controls fermentation.
              </div>
            )}
          </div>

          {/* Sourdough Starter */}
          <div style={card(starterEnabled && starterGrams > 0, "#a1887f")}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: starterEnabled ? 12 : 0 }}>
              <input type="checkbox" checked={starterEnabled} onChange={(e) => setStarterEnabled(e.target.checked)}
                style={{ accentColor: "#a1887f", width: 18, height: 18 }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                Sourdough Starter
              </span>
              <span style={{ fontSize: 12, color: "#a1887f" }}>
                (levain)
              </span>
            </label>

            {starterEnabled && (
              <div style={{ display: "grid", gap: 12 }}>
                {/* Starter flour type selector with mini comparison */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#5d4037", margin: "0 0 8px" }}>Starter flour type</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {STARTER_FLOURS.map((sf, idx) => (
                      <label key={idx} style={{
                        display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                        background: starterFlourIdx === idx ? "#efebe9" : "#fafafa",
                        borderRadius: 8, padding: "8px 12px",
                        border: starterFlourIdx === idx ? `2px solid ${sf.color}` : "2px solid transparent",
                      }}>
                        <input type="radio" name="starterFlour" checked={starterFlourIdx === idx}
                          onChange={() => setStarterFlourIdx(idx)}
                          style={{ accentColor: sf.color, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: sf.color }} />
                            <span style={{ fontWeight: 600, fontSize: 13, color: "#3e2723" }}>{sf.name}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#8d6e63", marginBottom: 4 }}>{sf.tip}</div>
                          <div style={{ fontSize: 10, color: "#a1887f", display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>Cal: {sf.per100.calories}</span>
                            <span>Protein: {sf.per100.protein}g</span>
                            <span>Fiber: {sf.per100.fiber}g</span>
                            <span>Iron: {sf.per100.iron}mg</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Starter amount */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#5d4037" }}>Starter amount</span>
                    <span style={{ fontSize: 12, color: "#795548" }}>
                      {starterGrams}g ({Math.round(starterFlourG)}g flour + {Math.round(starterWaterG)}g water)
                    </span>
                  </div>
                  <SliderRow min={0} max={500} step={5} value={starterGrams} onChange={setStarterGrams} color="#a1887f" unitLabel="g" />
                </div>

                {/* Starter hydration */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#5d4037" }}>Starter hydration</span>
                    <span style={{ fontSize: 12, color: "#795548" }}>{starterHydration}%</span>
                  </div>
                  <SliderRow min={50} max={200} step={5} value={starterHydration} onChange={setStarterHydration} color="#a1887f" unitLabel="%" />
                  <div style={{ fontSize: 11, color: "#8d6e63", marginTop: 4 }}>
                    100% = equal parts flour and water (most common). Lower = stiffer, slower ferment.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enriched toggle & ingredients */}
          <div style={card(isEnriched, "#ff8a65")}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: isEnriched ? 12 : 0 }}>
              <input type="checkbox" checked={isEnriched} onChange={(e) => setIsEnriched(e.target.checked)}
                style={{ accentColor: "#ff8a65", width: 18, height: 18 }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>Enriched Dough</span>
              <span style={{ fontSize: 12, color: "#a1887f" }}>(butter, eggs, milk, olive oil)</span>
            </label>

            {isEnriched && (
              <div style={{ display: "grid", gap: 10 }}>
                {ENRICHMENTS.map((en) => {
                  const val = enrichAmounts[en.key];
                  const maxVal = en.key === "eggs" ? 12 : 500;
                  const step = en.key === "eggs" ? 1 : 5;
                  return (
                    <div key={en.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "#5d4037" }}>{en.emoji} {en.label}</span>
                        <span style={{ fontSize: 12, color: "#795548" }}>
                          {val}{en.unit === "eggs" ? (val === 1 ? " egg" : " eggs") : "g"}
                          {en.gramsPerUnit && val > 0 ? ` (${val * en.gramsPerUnit}g)` : ""}
                        </span>
                      </div>
                      <SliderRow min={0} max={maxVal} step={step} value={val}
                        onChange={(v) => handleEnrichChange(en.key, v)} color={en.color}
                        unitLabel={en.unit === "eggs" ? "qty" : en.unit} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div style={card(false, "")}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#3e2723", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              Instructions
              <span style={{ fontSize: 12, fontWeight: 400, color: "#a1887f" }}>(optional)</span>
            </h3>
            <textarea
              placeholder={"Write your baking instructions here...\n\nIf left blank, standard sourdough instructions will be generated when publishing to AT Protocol."}
              value={recipeInstructions}
              onChange={(e) => setRecipeInstructions(e.target.value)}
              rows={5}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 12px", borderRadius: 8,
                border: "1px solid #d7ccc8", fontSize: 14,
                fontFamily: "inherit", color: "#3e2723",
                resize: "vertical", lineHeight: 1.5,
              }}
            />
          </div>

          {/* Totals warning */}
          {usePercentMode && totalBlendPercent !== 100 && totalBlendPercent > 0 && (
            <div style={{
              background: totalBlendPercent > 100 ? "#ffebee" : "#fff3e0",
              border: `1px solid ${totalBlendPercent > 100 ? "#ef9a9a" : "#ffcc80"}`,
              borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13,
              color: totalBlendPercent > 100 ? "#c62828" : "#e65100", fontWeight: 500,
            }}>
              Total: {totalBlendPercent}% — {totalBlendPercent > 100 ? "exceeds" : "under"} 100%
            </div>
          )}

          {/* Blend Nutrition Facts */}
          {totalEffective > 0 && (() => {
            const servings = 10;
            const servingFraction = 1 / servings;
            const enrichWeight = isEnriched
              ? enrichAmounts.butter + enrichAmounts.milk + enrichAmounts.oliveOil + enrichAmounts.eggs * 50
              : 0;
            const totalDoughWeight = totalEffective + waterGrams + saltGrams + starterGrams + enrichWeight;
            const servingWeight = Math.round(totalDoughWeight / servings);

            return (
            <div style={{
              background: "#fff", borderRadius: 12, border: "2px solid #3e2723",
              padding: "20px", maxWidth: 380, margin: "0 auto",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}>
              <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 2px", color: "#3e2723", borderBottom: "10px solid #3e2723", paddingBottom: 4, letterSpacing: "-0.5px" }}>
                Nutrition Facts
              </h2>
              <p style={{ fontSize: 13, color: "#3e2723", margin: "6px 0 0", fontWeight: 600 }}>
                {servings} servings per loaf
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "6px solid #3e2723", paddingBottom: 4, margin: "2px 0 4px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#3e2723" }}>Serving size</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#3e2723" }}>1/10 loaf ({servingWeight}g)</span>
              </div>

              <p style={{ fontSize: 11, color: "#8d6e63", margin: "4px 0 6px" }}>
                Blend: {FLOURS.map((f, i) => effectiveGrams[i] > 0 ? `${f.name} ${Math.round(effectiveGrams[i])}g` : null).filter(Boolean).join(" \u00b7 ")}
                {starterEnabled && starterGrams > 0 ? ` \u00b7 Starter ${starterGrams}g` : ""}
              </p>

              {/* %DV header */}
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 0 4px", borderBottom: "1px solid #3e2723" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#3e2723" }}>% Daily Value*</span>
              </div>

              {NUTRIENTS.map(({ key, label, unit, bold, indent, dv, extraIndent }) => {
                const totalVal = blendNutrition[key];
                const perServing = totalVal * servingFraction;
                const dvPercent = dv && DAILY_VALUES[key] ? Math.round((perServing / DAILY_VALUES[key]) * 100) : null;

                return (
                <div key={key} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  padding: "3px 0",
                  borderBottom: key === "calories" ? "4px solid #3e2723"
                    : key === "protein" ? "6px solid #3e2723"
                    : "1px solid #e0dad5",
                  paddingLeft: extraIndent ? 28 : indent ? 16 : 0,
                }}>
                  <span style={{ fontWeight: bold ? 700 : 400, fontSize: key === "calories" ? 15 : 13, color: "#3e2723", flex: 1 }}>
                    {label} {key !== "calories" && <span style={{ fontWeight: 400 }}>{formatNum(perServing)}{unit}</span>}
                  </span>
                  {key === "calories" ? (
                    <span style={{ fontWeight: 900, fontSize: 20, color: "#3e2723" }}>{formatNum(perServing)}</span>
                  ) : dvPercent !== null ? (
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#3e2723", minWidth: 36, textAlign: "right" }}>{dvPercent}%</span>
                  ) : (
                    <span style={{ minWidth: 36 }} />
                  )}
                </div>
                );
              })}

              <p style={{ fontSize: 10, color: "#8d6e63", marginTop: 8, lineHeight: 1.4 }}>
                * The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
              </p>

              {/* Pie chart */}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#5d4037", marginBottom: 8 }}>Flour Composition</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg width="80" height="80" viewBox="0 0 36 36">
                    {(() => {
                      let cumulative = 0;
                      const segments = [];
                      const allParts = [
                        ...FLOURS.map((f, i) => ({ name: f.name, grams: effectiveGrams[i], color: f.color })),
                        ...(starterEnabled && starterFlourG > 0
                          ? [{ name: `Starter (${STARTER_FLOURS[starterFlourIdx].name})`, grams: starterFlourG, color: STARTER_FLOURS[starterFlourIdx].color }]
                          : []),
                      ];
                      const totalParts = allParts.reduce((a, p) => a + p.grams, 0);
                      allParts.forEach((part, i) => {
                        const pct = totalParts > 0 ? (part.grams / totalParts) * 100 : 0;
                        if (pct > 0) {
                          segments.push(
                            <circle key={i} cx="18" cy="18" r="15.91" fill="transparent"
                              stroke={part.color} strokeWidth="3.5"
                              strokeDasharray={`${pct} ${100 - pct}`}
                              strokeDashoffset={25 - cumulative} />
                          );
                          cumulative += pct;
                        }
                      });
                      return segments;
                    })()}
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {FLOURS.map((f, i) =>
                      effectiveGrams[i] > 0 ? (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, display: "inline-block" }} />
                          <span style={{ color: "#5d4037" }}>{f.name} ({Math.round((effectiveGrams[i] / totalAllFlour) * 100)}%)</span>
                        </div>
                      ) : null
                    )}
                    {starterEnabled && starterFlourG > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: STARTER_FLOURS[starterFlourIdx].color, display: "inline-block" }} />
                        <span style={{ color: "#5d4037" }}>Starter ({Math.round((starterFlourG / totalAllFlour) * 100)}%)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {totalEffective === 0 && (
            <div style={{ textAlign: "center", color: "#a1887f", padding: "40px 20px", fontSize: 15 }}>
              Adjust the sliders above to build your flour blend
            </div>
          )}
        </div>
      )}

      {/* ====== FLOUR REFERENCE TAB ====== */}
      {tab === "reference" && (
        <div>
          <TernaryChart />

          <p style={{ fontSize: 14, color: "#5d4037", marginBottom: 16, lineHeight: 1.5 }}>
            Nutritional comparison of all available flours, normalized to 100g. Use this reference to understand the strengths of each flour when designing your blend.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <thead>
                <tr style={{ background: "#5d4037", color: "#fff" }}>
                  <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, position: "sticky", left: 0, background: "#5d4037", zIndex: 1, minWidth: 130 }}>
                    Per 100g
                  </th>
                  {FLOURS.map((f, i) => (
                    <th key={i} style={{ padding: "10px 6px", textAlign: "right", fontWeight: 600, minWidth: 80, fontSize: 11, lineHeight: 1.3 }}>
                      {f.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NUTRIENTS.map(({ key, label, unit, bold, indent }, ri) => (
                  <tr key={key} style={{ background: ri % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{
                      padding: "7px 8px", fontWeight: bold ? 600 : 400,
                      paddingLeft: indent ? 24 : 8, color: "#3e2723",
                      position: "sticky", left: 0,
                      background: ri % 2 === 0 ? "#fff" : "#fafafa",
                      zIndex: 1, borderRight: "1px solid #ede7e3",
                    }}>
                      {label.trim()} {unit && <span style={{ color: "#a1887f", fontSize: 11 }}>({unit})</span>}
                    </td>
                    {FLOURS.map((f, fi) => {
                      const val = per100(f, key);
                      const maxVal = Math.max(...FLOURS.map((fl) => per100(fl, key)));
                      const isMax = maxVal > 0 && val === maxVal;
                      const isGood = isMax && key !== "sodium" && key !== "totalSugars" && key !== "transFat" && key !== "cholesterol";
                      return (
                        <td key={fi} style={{
                          padding: "7px 6px", textAlign: "right", fontWeight: bold ? 600 : 400,
                          color: isGood ? "#2e7d32" : "#3e2723",
                          background: isGood ? "#e8f5e9" : "inherit",
                        }}>
                          {formatNum(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: "#a1887f", marginTop: 8 }}>
              Green highlights = highest value across all flours for that nutrient
            </p>
          </div>

          {/* Flour baking tips */}
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#3e2723", marginBottom: 12 }}>
              Baking Notes
            </h3>
            <div style={{ display: "grid", gap: 10 }}>
              {FLOURS.map((f, i) => (
                <div key={i} style={{
                  background: "#fff", borderRadius: 10, padding: "12px 16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  borderLeft: `4px solid ${f.color}`,
                }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: f.color, marginRight: 8 }} />
                    {f.name}
                  </span>
                  <p style={{ fontSize: 13, color: "#5d4037", margin: "6px 0 0", lineHeight: 1.5 }}>
                    {f.tip}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* About AT Protocol integration */}
          <div style={{ marginTop: 32 }}>
            <div style={{
              background: "#fff", borderRadius: 12, padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              border: "1px solid #d7ccc8",
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#3e2723", margin: "0 0 12px" }}>
                This calculator publishes to AT Protocol
              </h3>
              <div style={{ fontSize: 14, color: "#5d4037", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 12px" }}>
                  This isn't just a calculator — it's a recipe publisher for the{" "}
                  <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" style={{ color: "#8d6e63", fontWeight: 600 }}>AT Protocol</a>,
                  the open network behind Bluesky. When you publish a recipe here, it gets written directly to your
                  Personal Data Server as an{" "}
                  <a href="https://recipe.exchange" target="_blank" rel="noopener noreferrer" style={{ color: "#8d6e63", fontWeight: 600 }}>exchange.recipe.recipe</a>{" "}
                  record — the same schema used by recipe.exchange.
                </p>
                <p style={{ margin: "0 0 12px" }}>
                  <strong>What that means:</strong> your recipes live on your PDS, not in someone else's database. Any app
                  that speaks AT Protocol can read them. This page is a static site on Cloudflare Pages with zero backend —
                  it talks directly to PDS endpoints using <code style={{ background: "#efebe9", padding: "1px 5px", borderRadius: 4, fontSize: 13 }}>fetch()</code>.
                  No API keys, no server, no database.
                </p>
                <p style={{ margin: "0 0 16px" }}>
                  <strong>How it works:</strong> design a flour blend with the sliders in Recipe Builder, write your
                  baking instructions, then flip to the AT Protocol tab to sign in and publish. You can also browse
                  anyone's published recipes by handle and load them back into the calculator to tweak and republish.
                </p>
                <div style={{
                  background: "#efebe9", borderRadius: 8, padding: "12px 16px",
                  fontSize: 13, color: "#5d4037",
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Try it:</div>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}>Build a flour blend in the Recipe Builder tab</li>
                    <li style={{ marginBottom: 4 }}>Go to the AT Protocol tab and sign in with your Bluesky handle + an{" "}
                      <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer" style={{ color: "#8d6e63" }}>app password</a>
                    </li>
                    <li style={{ marginBottom: 4 }}>Hit publish — your recipe is now an AT Protocol record on your PDS</li>
                    <li>Browse "My Recipes" to see it, load it back, or share your handle so others can pull your recipes</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== AT PROTOCOL TAB ====== */}
      {tab === "atproto" && (
        <ATProtoPanel
          recipeState={getRecipeState()}
          flours={FLOURS}
          enrichments={ENRICHMENTS}
          starterFlours={STARTER_FLOURS}
          nutrition={blendNutrition}
          recipeName={recipeName}
          onLoadToBuilder={handleLoadFromAT}
        />
      )}
    </div>
  );
}
