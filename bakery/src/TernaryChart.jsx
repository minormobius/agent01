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
// Proportions are by weight: [flour, egg, milk] — they get normalized to 100%.
// atUri will be populated after seeding.

const RECIPES = [
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
    description: "American-style buttermilk pancakes.",
  },
  {
    name: "Waffles",
    flour: 250, egg: 100, milk: 420,
    color: "#b8860b",
    description: "Crispy outside, fluffy inside.",
  },
  {
    name: "Crêpes",
    flour: 120, egg: 100, milk: 240,
    color: "#f5deb3",
    description: "Thin French pancakes.",
  },
  {
    name: "French Toast",
    flour: 60, egg: 150, milk: 120,
    color: "#cd853f",
    description: "Bread is the flour. Custardy, golden, simple.",
  },
  {
    name: "Kaiserschmarrn",
    flour: 120, egg: 200, milk: 240,
    color: "#e8a87c",
    description: "Shredded Austrian pancake, caramelized and dusted with sugar.",
  },
  {
    name: "Eggnog",
    flour: 0, egg: 300, milk: 720,
    color: "#fffdd0",
    description: "Eggs and milk, spiced and spiked.",
  },
  {
    name: "Ice Cream",
    flour: 0, egg: 80, milk: 480,
    color: "#fce4ec",
    description: "Custard-base ice cream. Eggs for richness, milk for body.",
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
  {
    name: "Dutch Baby",
    flour: 65, egg: 150, milk: 120,
    color: "#ffcc80",
    description: "Oven-puffed popover pancake. More egg than you'd think.",
  },
  {
    name: "Farina",
    flour: 85, egg: 0, milk: 240,
    color: "#e0e0e0",
    description: "Cream of wheat. Pure flour-in-milk comfort.",
  },
  {
    name: "Pannukakku",
    flour: 120, egg: 150, milk: 600,
    color: "#b3e5fc",
    description: "Finnish oven pancake. Milky, custardy, enormous.",
  },
];

// ---- Geometry ----

// Equilateral triangle with vertices at:
//   top        = Egg
//   bottom-left  = Milk
//   bottom-right = Flour
//
// We work in a 400x400 SVG viewBox with some padding.

const W = 400;
const H = 380;
const PAD = 50;

// Triangle vertices (px)
const V_EGG   = { x: W / 2,        y: PAD };          // top
const V_MILK  = { x: PAD,          y: H - PAD };      // bottom-left
const V_FLOUR = { x: W - PAD,      y: H - PAD };      // bottom-right

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
      pctFlour: Math.round((r.flour / (r.flour + r.egg + r.milk || 1)) * 100),
      pctEgg:   Math.round((r.egg   / (r.flour + r.egg + r.milk || 1)) * 100),
      pctMilk:  Math.round((r.milk  / (r.flour + r.egg + r.milk || 1)) * 100),
    })),
  []);

  // Label nudge offsets to avoid overlap (hand-tuned)
  const nudge = {
    "Traditional Pasta": { dx: 12, dy: 4 },
    "Pancakes":          { dx: 8, dy: -10 },
    "Waffles":           { dx: 10, dy: 8 },
    "Crêpes":            { dx: 10, dy: -8 },
    "French Toast":      { dx: 10, dy: 4 },
    "Kaiserschmarrn":    { dx: -90, dy: -10 },
    "Eggnog":            { dx: -50, dy: -10 },
    "Ice Cream":         { dx: -70, dy: 8 },
    "Custard":           { dx: 10, dy: -8 },
    "Flan":              { dx: 10, dy: 8 },
    "Quiche":            { dx: 10, dy: -8 },
    "Dutch Baby":        { dx: 10, dy: -8 },
    "Farina":            { dx: 10, dy: 4 },
    "Pannukakku":        { dx: -80, dy: 8 },
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
        The Egg-Milk-Flour Triangle
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#795548", lineHeight: 1.5 }}>
        Every batter and dough lives somewhere on this chart. Tap a point to see the recipe.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", maxWidth: 520, display: "block", margin: "0 auto" }}
      >
        {/* Grid lines — 25% intervals */}
        {[0.25, 0.5, 0.75].map((t) => {
          // Lines parallel to each side
          // Flour lines (parallel to Egg-Milk edge)
          const fA = ternaryToXY(t, 1 - t, 0);
          const fB = ternaryToXY(t, 0, 1 - t);
          // Egg lines (parallel to Milk-Flour edge)
          const eA = ternaryToXY(0, t, 1 - t);
          const eB = ternaryToXY(1 - t, t, 0);
          // Milk lines (parallel to Egg-Flour edge)
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
          style={{ fontSize: 14, fontWeight: 700, fill: "#5d4037" }}>
          Egg
        </text>
        <text x={V_MILK.x - 8} y={V_MILK.y + 22} textAnchor="middle"
          style={{ fontSize: 14, fontWeight: 700, fill: "#5d4037" }}>
          Milk
        </text>
        <text x={V_FLOUR.x + 8} y={V_FLOUR.y + 22} textAnchor="middle"
          style={{ fontSize: 14, fontWeight: 700, fill: "#5d4037" }}>
          Flour
        </text>

        {/* Percentage ticks along edges */}
        {[25, 50, 75].map((pct) => {
          const t = pct / 100;
          // Along Egg-Flour edge (right side) — egg %
          const ef = ternaryToXY(1 - t, t, 0);
          // Along Egg-Milk edge (left side) — egg %
          const em = ternaryToXY(0, t, 1 - t);
          // Along Milk-Flour edge (bottom) — flour %
          const mf = ternaryToXY(t, 0, 1 - t);
          return (
            <g key={pct}>
              <text x={ef.x + 10} y={ef.y + 2} style={{ fontSize: 9, fill: "#a1887f" }} textAnchor="start">{pct}%</text>
              <text x={em.x - 10} y={em.y + 2} style={{ fontSize: 9, fill: "#a1887f" }} textAnchor="end">{pct}%</text>
              <text x={mf.x} y={mf.y + 16} style={{ fontSize: 9, fill: "#a1887f" }} textAnchor="middle">{pct}%</text>
            </g>
          );
        })}

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
              <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
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

      {/* Tooltip / detail box */}
      {hovered && (() => {
        const p = points.find((r) => r.name === hovered);
        if (!p) return null;
        return (
          <div style={{
            background: "#efebe9", borderRadius: 8, padding: "10px 14px",
            marginTop: 4, fontSize: 13, color: "#3e2723", lineHeight: 1.5,
          }}>
            <strong>{p.name}</strong>
            <span style={{ color: "#795548", marginLeft: 8, fontSize: 12 }}>
              {p.pctFlour}% flour · {p.pctEgg}% egg · {p.pctMilk}% milk
            </span>
            <div style={{ color: "#5d4037", marginTop: 4 }}>
              {p.description}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export { RECIPES };
