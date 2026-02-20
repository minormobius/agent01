import { useState, useMemo } from "react";

const FLOURS = [
  {
    name: "Einkorn (Unifine)",
    servingG: 96,
    servingLabel: "1/2 cup",
    calories: 340,
    totalFat: 3,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarb: 64,
    fiber: 8,
    totalSugars: 0,
    addedSugars: 0,
    protein: 18,
    vitaminD: 0,
    calcium: 80,
    iron: 4.32,
    potassium: 0,
    color: "#b8860b",
  },
  {
    name: "Dark Rye (Unifine)",
    servingG: 42,
    servingLabel: "1/4 cup",
    calories: 140,
    totalFat: 0.5,
    saturatedFat: 0.083,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarb: 32,
    fiber: 6,
    totalSugars: 0,
    addedSugars: 0,
    protein: 4,
    vitaminD: 0,
    calcium: 10,
    iron: 1.11,
    potassium: 215,
    color: "#5c4033",
  },
  {
    name: "Khorasan (Unifine)",
    servingG: 34,
    servingLabel: "1/4 cup",
    calories: 110,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarb: 24,
    fiber: 4,
    totalSugars: 0,
    addedSugars: 0,
    protein: 4,
    vitaminD: 0,
    calcium: 0,
    iron: 0.32,
    potassium: 0,
    color: "#daa520",
  },
  {
    name: "Spelt White (Ultra-Unifine)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 120,
    totalFat: 1,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 1,
    totalCarb: 22,
    fiber: 4,
    totalSugars: 0,
    addedSugars: 0,
    protein: 4,
    vitaminD: 0,
    calcium: 0,
    iron: 1.44,
    potassium: 116,
    color: "#f5deb3",
  },
  {
    name: "Hard Red Wheat (Costco)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 110,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarb: 23,
    fiber: 1,
    totalSugars: 0,
    addedSugars: 0,
    protein: 4,
    vitaminD: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
    color: "#cd853f",
  },
  {
    name: "Whole Wheat (Sprouts)",
    servingG: 30,
    servingLabel: "1/4 cup",
    calories: 100,
    totalFat: 1,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarb: 22,
    fiber: 3,
    totalSugars: 0,
    addedSugars: 0,
    protein: 4,
    vitaminD: 0,
    calcium: 10,
    iron: 1,
    potassium: 109,
    color: "#d2691e",
  },
];

const NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "", bold: true },
  { key: "totalFat", label: "Total Fat", unit: "g", bold: true },
  { key: "saturatedFat", label: "  Saturated Fat", unit: "g", indent: true },
  { key: "transFat", label: "  Trans Fat", unit: "g", indent: true },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", bold: true },
  { key: "sodium", label: "Sodium", unit: "mg", bold: true },
  { key: "totalCarb", label: "Total Carbohydrate", unit: "g", bold: true },
  { key: "fiber", label: "  Dietary Fiber", unit: "g", indent: true },
  { key: "totalSugars", label: "  Total Sugars", unit: "g", indent: true },
  { key: "protein", label: "Protein", unit: "g", bold: true },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
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

export default function FlourBlendCalculator() {
  const [tab, setTab] = useState("compare");
  const [blendGrams, setBlendGrams] = useState(
    FLOURS.map(() => 0)
  );
  const [totalFlourInLoaf, setTotalFlourInLoaf] = useState(500);
  const [usePercentMode, setUsePercentMode] = useState(true);
  const [blendPercents, setBlendPercents] = useState(
    FLOURS.map(() => 0)
  );

  const totalBlendGrams = blendGrams.reduce((a, b) => a + b, 0);
  const totalBlendPercent = blendPercents.reduce((a, b) => a + b, 0);

  const effectiveGrams = useMemo(() => {
    if (usePercentMode) {
      return blendPercents.map((p) => (p / 100) * totalFlourInLoaf);
    }
    return blendGrams;
  }, [usePercentMode, blendPercents, blendGrams, totalFlourInLoaf]);

  const totalEffective = effectiveGrams.reduce((a, b) => a + b, 0);

  const blendNutrition = useMemo(() => {
    const result = {};
    NUTRIENTS.forEach(({ key }) => {
      let total = 0;
      effectiveGrams.forEach((g, i) => {
        if (g > 0) {
          total += (FLOURS[i][key] / FLOURS[i].servingG) * g;
        }
      });
      result[key] = total;
    });
    return result;
  }, [effectiveGrams]);

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

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", maxWidth: 900, margin: "0 auto", padding: "16px", background: "#faf8f5", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#3e2723", margin: 0, letterSpacing: "-0.5px" }}>
          🌾 Flour Blend Calculator
        </h1>
        <p style={{ color: "#795548", fontSize: 14, margin: "6px 0 0" }}>
          Compare flours & design your perfect loaf
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 10, overflow: "hidden", border: "1px solid #d7ccc8" }}>
        {[
          { id: "compare", label: "📊 Compare Flours" },
          { id: "blend", label: "🍞 Blend Builder" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              background: tab === t.id ? "#5d4037" : "#efebe9",
              color: tab === t.id ? "#fff" : "#5d4037",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Compare Tab */}
      {tab === "compare" && (
        <div style={{ overflowX: "auto" }}>
          <p style={{ fontSize: 13, color: "#8d6e63", marginBottom: 12, fontStyle: "italic" }}>
            All values normalized to 100g for fair comparison
          </p>
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
                    padding: "7px 8px",
                    fontWeight: bold ? 600 : 400,
                    paddingLeft: indent ? 24 : 8,
                    color: "#3e2723",
                    position: "sticky",
                    left: 0,
                    background: ri % 2 === 0 ? "#fff" : "#fafafa",
                    zIndex: 1,
                    borderRight: "1px solid #ede7e3",
                  }}>
                    {label.trim()} {unit && <span style={{ color: "#a1887f", fontSize: 11 }}>({unit})</span>}
                  </td>
                  {FLOURS.map((f, fi) => {
                    const val = per100(f, key);
                    const maxVal = Math.max(...FLOURS.map((fl) => per100(fl, key)));
                    const isMax = maxVal > 0 && val === maxVal;
                    return (
                      <td key={fi} style={{
                        padding: "7px 6px",
                        textAlign: "right",
                        fontWeight: bold ? 600 : 400,
                        color: isMax && key !== "sodium" && key !== "totalSugars" && key !== "transFat" && key !== "cholesterol"
                          ? "#2e7d32"
                          : "#3e2723",
                        background: isMax && key !== "sodium" && key !== "totalSugars" && key !== "transFat" && key !== "cholesterol"
                          ? "#e8f5e9"
                          : "inherit",
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
      )}

      {/* Blend Tab */}
      {tab === "blend" && (
        <div>
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14, color: "#5d4037" }}>
              <input
                type="checkbox"
                checked={usePercentMode}
                onChange={(e) => setUsePercentMode(e.target.checked)}
                style={{ accentColor: "#5d4037" }}
              />
              <span style={{ fontWeight: 600 }}>Percentage mode</span>
            </label>
            {usePercentMode && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#5d4037" }}>
                Total flour in loaf:
                <input
                  type="number"
                  value={totalFlourInLoaf}
                  onChange={(e) => setTotalFlourInLoaf(Math.max(1, Number(e.target.value)))}
                  style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid #d7ccc8", fontSize: 14, textAlign: "center" }}
                />
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
                <div key={i} style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: "12px 16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  border: grams > 0 ? `2px solid ${f.color}` : "2px solid transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#3e2723" }}>
                      <span style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: f.color,
                        marginRight: 8,
                      }} />
                      {f.name}
                    </span>
                    <span style={{ fontSize: 13, color: "#795548" }}>
                      {usePercentMode ? `${val}% \u2192 ${Math.round(grams)}g` : `${val}g`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="range"
                      min={0}
                      max={usePercentMode ? 100 : 1000}
                      step={usePercentMode ? 5 : 10}
                      value={val}
                      onChange={(e) =>
                        usePercentMode
                          ? handlePercentChange(i, Number(e.target.value))
                          : handleGramChange(i, Number(e.target.value))
                      }
                      style={{ flex: 1, accentColor: f.color }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={usePercentMode ? 100 : 5000}
                      value={val}
                      onChange={(e) =>
                        usePercentMode
                          ? handlePercentChange(i, Number(e.target.value))
                          : handleGramChange(i, Number(e.target.value))
                      }
                      style={{
                        width: 56,
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #d7ccc8",
                        fontSize: 14,
                        textAlign: "center",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#a1887f", width: 16 }}>
                      {usePercentMode ? "%" : "g"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals warning */}
          {usePercentMode && totalBlendPercent !== 100 && totalBlendPercent > 0 && (
            <div style={{
              background: totalBlendPercent > 100 ? "#ffebee" : "#fff3e0",
              border: `1px solid ${totalBlendPercent > 100 ? "#ef9a9a" : "#ffcc80"}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: totalBlendPercent > 100 ? "#c62828" : "#e65100",
              fontWeight: 500,
            }}>
              Total: {totalBlendPercent}% — {totalBlendPercent > 100 ? "exceeds" : "under"} 100%
            </div>
          )}

          {/* Blend Nutrition Facts */}
          {totalEffective > 0 && (
            <div style={{
              background: "#fff",
              borderRadius: 12,
              border: "2px solid #3e2723",
              padding: "20px",
              maxWidth: 380,
              margin: "0 auto",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 2px", color: "#3e2723", borderBottom: "8px solid #3e2723", paddingBottom: 4 }}>
                Nutrition Facts
              </h2>
              <p style={{ fontSize: 12, color: "#5d4037", margin: "4px 0 2px", borderBottom: "1px solid #3e2723", paddingBottom: 4 }}>
                Flour blend total: {Math.round(totalEffective)}g
              </p>
              <p style={{ fontSize: 11, color: "#8d6e63", margin: "2px 0 8px" }}>
                Blend: {FLOURS.map((f, i) => effectiveGrams[i] > 0 ? `${f.name} ${Math.round(effectiveGrams[i])}g` : null).filter(Boolean).join(" \u00b7 ")}
              </p>

              {NUTRIENTS.map(({ key, label, unit, bold, indent }, ri) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: key === "calories" ? "4px solid #3e2723"
                      : key === "protein" ? "6px solid #3e2723"
                      : "1px solid #e0dad5",
                    paddingLeft: indent ? 16 : 0,
                  }}
                >
                  <span style={{
                    fontWeight: bold ? 700 : 400,
                    fontSize: key === "calories" ? 16 : 13,
                    color: "#3e2723",
                  }}>
                    {label.trim()}
                  </span>
                  <span style={{
                    fontWeight: bold ? 700 : 400,
                    fontSize: key === "calories" ? 16 : 13,
                    color: "#3e2723",
                  }}>
                    {formatNum(blendNutrition[key])}{unit}
                  </span>
                </div>
              ))}

              {/* Pie chart of flour composition */}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#5d4037", marginBottom: 8 }}>Flour Composition</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg width="80" height="80" viewBox="0 0 36 36">
                    {(() => {
                      let cumulative = 0;
                      const segments = [];
                      FLOURS.forEach((f, i) => {
                        const pct = totalEffective > 0 ? (effectiveGrams[i] / totalEffective) * 100 : 0;
                        if (pct > 0) {
                          const dashArray = `${pct} ${100 - pct}`;
                          const dashOffset = 25 - cumulative;
                          segments.push(
                            <circle
                              key={i}
                              cx="18" cy="18" r="15.91"
                              fill="transparent"
                              stroke={f.color}
                              strokeWidth="3.5"
                              strokeDasharray={dashArray}
                              strokeDashoffset={dashOffset}
                            />
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
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: f.color, display: "inline-block",
                          }} />
                          <span style={{ color: "#5d4037" }}>
                            {f.name} ({Math.round((effectiveGrams[i] / totalEffective) * 100)}%)
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {totalEffective === 0 && (
            <div style={{
              textAlign: "center",
              color: "#a1887f",
              padding: "40px 20px",
              fontSize: 15,
            }}>
              Adjust the sliders above to build your flour blend
            </div>
          )}
        </div>
      )}
    </div>
  );
}
