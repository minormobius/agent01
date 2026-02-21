import { useState, useMemo } from "react";

/**
 * Ternary chart of egg / milk / flour recipes.
 *
 * Each recipe is placed by its relative weight-proportions of eggs, milk,
 * and flour.  Like a soil-texture triangle, but for batter & dough.
 *
 * Points are clickable — they call onSelect(recipe) so the parent can
 * load the recipe from the PDS.
 */

// ---- Recipe data ----
// Weights in grams: flour, egg, milk — position is by proportion, tooltip shows masses.
// Everything else in the recipe (butter, sugar, leavening) doesn't affect position.

const RECIPES = [
  // ---- Flour corner: breads ----
  {
    name: "Sourdough",
    flour: 500, egg: 0, milk: 0,
    color: "#8d6e63",
    description: "Pure flour, water, salt, and starter. The flour vertex.",
  },
  {
    name: "Challah",
    flour: 500, egg: 200, milk: 0,
    color: "#ff8f00",
    description: "Braided egg bread. Rich but no dairy.",
  },
  {
    name: "Brioche",
    flour: 500, egg: 300, milk: 60,
    color: "#ffab40",
    description: "Butter-and-egg enriched bread. More egg than you'd expect.",
  },
  {
    name: "Milk Bread",
    flour: 500, egg: 50, milk: 300,
    color: "#e6cba8",
    description: "Japanese shokupan. Tangzhong method, pillowy crumb.",
  },
  {
    name: "Choux Pastry",
    flour: 125, egg: 200, milk: 125,
    color: "#a1887f",
    description: "Cream puffs, éclairs, gougères. The eggs do all the leavening.",
  },
  {
    name: "Scones",
    flour: 300, egg: 50, milk: 120,
    color: "#bcaaa4",
    description: "Flour-heavy, barely bound. Cold butter does the work.",
  },

  // ---- Classic batters ----
  {
    name: "Traditional Pasta",
    flour: 250, egg: 150, milk: 0,
    color: "#d2691e",
    description: "Just flour and eggs — the Emilia-Romagna way.",
  },
  {
    name: "Pancakes",
    flour: 240, egg: 100, milk: 360,
    color: "#daa520",
    description: "Buttermilk pancakes. Flour is light — milk dominates by weight.",
  },
  {
    name: "Waffles",
    flour: 250, egg: 100, milk: 420,
    color: "#b8860b",
    description: "Crispy outside, fluffy inside. Even more milk than pancakes.",
  },
  {
    name: "Crêpes",
    flour: 120, egg: 100, milk: 240,
    color: "#f5deb3",
    description: "Thin French pancakes. Less flour, more liquid.",
  },
  {
    name: "French Toast",
    flour: 120, egg: 150, milk: 120,
    color: "#cd853f",
    description: "Bread is the flour. Egg-custard soaked and pan-fried.",
  },
  {
    name: "Kaiserschmarrn",
    flour: 120, egg: 200, milk: 240,
    color: "#e8a87c",
    description: "Shredded Austrian pancake, caramelized and dusted with sugar.",
  },
  {
    name: "Dutch Baby",
    flour: 65, egg: 150, milk: 120,
    color: "#ffcc80",
    description: "Oven-puffed popover pancake. The eggs do the lifting.",
  },
  {
    name: "Pannukakku",
    flour: 120, egg: 150, milk: 600,
    color: "#b3e5fc",
    description: "Finnish oven pancake. Enormous, custardy, milk-heavy.",
  },

  // ---- Egg-milk axis: custards & drinks ----
  {
    name: "Eggnog",
    flour: 0, egg: 300, milk: 720,
    color: "#fffdd0",
    description: "Eggs and milk, spiced and spiked. No flour at all.",
  },
  {
    name: "Ice Cream",
    flour: 0, egg: 80, milk: 480,
    color: "#fce4ec",
    description: "Custard-base ice cream. Yolks for richness, milk for body.",
  },
  {
    name: "Custard",
    flour: 0, egg: 200, milk: 480,
    color: "#fff9c4",
    description: "Baked egg-and-milk set. The simplest alchemy.",
  },
  {
    name: "Flan",
    flour: 0, egg: 250, milk: 480,
    color: "#ffe0b2",
    description: "Caramel-topped custard, unmolded.",
  },
  {
    name: "Quiche",
    flour: 125, egg: 200, milk: 360,
    color: "#c8e6c9",
    description: "Savory custard in pastry. The crust is the flour.",
  },

  // ---- Flour-milk axis ----
  {
    name: "Farina",
    flour: 40, egg: 0, milk: 240,
    color: "#e0e0e0",
    description: "Cream of wheat. Pure flour-in-milk comfort.",
  },
];

// ---- Geometry ----

// Equilateral triangle with vertices at:
//   top          = Egg
//   bottom-left  = Milk
//   bottom-right = Flour

const W = 440;
const H = 420;
const PAD = 55;

const V_EGG   = { x: W / 2,   y: PAD };
const V_MILK  = { x: PAD,     y: H - PAD };
const V_FLOUR = { x: W - PAD, y: H - PAD };

function ternaryToXY(flour, egg, milk) {
  const total = flour + egg + milk || 1;
  const f = flour / total;
  const e = egg   / total;
  const m = milk  / total;
  return {
    x: V_EGG.x * e + V_MILK.x * m + V_FLOUR.x * f,
    y: V_EGG.y * e + V_MILK.y * m + V_FLOUR.y * f,
  };
}

// ---- Component ----

export default function TernaryChart({ onSelectRecipe }) {
  const [hovered, setHovered] = useState(null);

  const points = useMemo(() =>
    RECIPES.map((r) => ({
      ...r,
      ...ternaryToXY(r.flour, r.egg, r.milk),
      total: r.flour + r.egg + r.milk,
    })),
  []);

  // Hand-tuned label nudge offsets to reduce overlap
  const nudge = {
    "Sourdough":         { dx: -8, dy: -10, anchor: "middle" },
    "Challah":           { dx: 10, dy: -6 },
    "Brioche":           { dx: 10, dy: 6 },
    "Milk Bread":        { dx: 10, dy: -6 },
    "Choux Pastry":      { dx: 10, dy: -8 },
    "Scones":            { dx: 10, dy: 6 },
    "Traditional Pasta": { dx: 10, dy: -6 },
    "Pancakes":          { dx: 8, dy: -10 },
    "Waffles":           { dx: 10, dy: 10 },
    "Crêpes":            { dx: 10, dy: -8 },
    "French Toast":      { dx: 10, dy: 6 },
    "Kaiserschmarrn":    { dx: -95, dy: -8 },
    "Dutch Baby":        { dx: 10, dy: -8 },
    "Pannukakku":        { dx: -80, dy: 8 },
    "Eggnog":            { dx: -50, dy: -10 },
    "Ice Cream":         { dx: -68, dy: 8 },
    "Custard":           { dx: 10, dy: -8 },
    "Flan":              { dx: 10, dy: 8 },
    "Quiche":            { dx: 10, dy: -8 },
    "Farina":            { dx: 10, dy: 4 },
  };

  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "16px 16px 8px",
      marginBottom: 24,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      border: "1px solid #d7ccc8",
    }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#3e2723" }}>
        The Egg–Milk–Flour Triangle
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#795548", lineHeight: 1.5 }}>
        Every batter and dough lives somewhere on this chart.
        Position is by weight proportion — hover for actual masses.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", maxWidth: 560, display: "block", margin: "0 auto" }}
      >
        {/* Grid lines — 25% intervals */}
        {[0.25, 0.5, 0.75].map((t) => {
          const fA = ternaryToXY(t, 1 - t, 0);
          const fB = ternaryToXY(t, 0, 1 - t);
          const eA = ternaryToXY(0, t, 1 - t);
          const eB = ternaryToXY(1 - t, t, 0);
          const mA = ternaryToXY(1 - t, 0, t);
          const mB = ternaryToXY(0, 1 - t, t);
          return (
            <g key={t} stroke="#ede7e3" strokeWidth={0.8}>
              <line x1={fA.x} y1={fA.y} x2={fB.x} y2={fB.y} />
              <line x1={eA.x} y1={eA.y} x2={eB.x} y2={eB.y} />
              <line x1={mA.x} y1={mA.y} x2={mB.x} y2={mB.y} />
            </g>
          );
        })}

        {/* Triangle outline */}
        <polygon
          points={`${V_EGG.x},${V_EGG.y} ${V_MILK.x},${V_MILK.y} ${V_FLOUR.x},${V_FLOUR.y}`}
          fill="none"
          stroke="#5d4037"
          strokeWidth={2}
        />

        {/* Vertex labels */}
        <text x={V_EGG.x} y={V_EGG.y - 14} textAnchor="middle"
          style={{ fontSize: 15, fontWeight: 700, fill: "#5d4037" }}>
          Egg
        </text>
        <text x={V_MILK.x - 8} y={V_MILK.y + 22} textAnchor="middle"
          style={{ fontSize: 15, fontWeight: 700, fill: "#5d4037" }}>
          Milk
        </text>
        <text x={V_FLOUR.x + 8} y={V_FLOUR.y + 22} textAnchor="middle"
          style={{ fontSize: 15, fontWeight: 700, fill: "#5d4037" }}>
          Flour
        </text>

        {/* Recipe points */}
        {points.map((p) => {
          const isHovered = hovered === p.name;
          const n = nudge[p.name] || { dx: 8, dy: 0 };
          return (
            <g
              key={p.name}
              style={{ cursor: onSelectRecipe ? "pointer" : "default" }}
              onClick={() => onSelectRecipe?.(p)}
              onMouseEnter={() => setHovered(p.name)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Hit area */}
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y}
                r={isHovered ? 6 : 4.5}
                fill={p.color}
                stroke="#5d4037"
                strokeWidth={isHovered ? 2 : 1.2}
              />
              {/* Label */}
              <text
                x={p.x + n.dx} y={p.y + n.dy}
                textAnchor={n.anchor || "start"}
                style={{
                  fontSize: isHovered ? 11 : 10,
                  fill: isHovered ? "#3e2723" : "#795548",
                  fontWeight: isHovered ? 700 : 500,
                }}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip / detail box — shows actual masses */}
      {hovered && (() => {
        const p = points.find((r) => r.name === hovered);
        if (!p) return null;
        const parts = [];
        if (p.flour) parts.push(`${p.flour}g flour`);
        if (p.egg)   parts.push(`${p.egg}g egg`);
        if (p.milk)  parts.push(`${p.milk}g milk`);
        return (
          <div style={{
            background: "#efebe9", borderRadius: 8, padding: "10px 14px",
            marginTop: 4, fontSize: 13, color: "#3e2723", lineHeight: 1.5,
          }}>
            <strong>{p.name}</strong>
            <span style={{ color: "#5d4037", marginLeft: 8, fontSize: 12, fontFamily: "monospace" }}>
              {parts.join(" · ")}
            </span>
            <div style={{ color: "#795548", marginTop: 4 }}>
              {p.description}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export { RECIPES };
