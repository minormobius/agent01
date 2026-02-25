import { useState, useEffect } from "react";
import { fetchRecipeByHandle } from "./atproto";
import { formatDuration } from "./recipeTransform";

const card = {
  background: "#fff",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const btnPrimary = {
  padding: "10px 20px",
  background: "#5d4037",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const btnSecondary = {
  padding: "10px 20px",
  background: "#efebe9",
  color: "#5d4037",
  border: "1px solid #d7ccc8",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

function Tag({ label }) {
  return (
    <span style={{
      fontSize: 11, color: "#5d4037", background: "#d7ccc8",
      padding: "2px 8px", borderRadius: 10,
    }}>
      {label}
    </span>
  );
}

export default function RecipeViewer({ handle, rkey }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchRecipeByHandle(handle, rkey)
      .then(setRecipe)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [handle, rkey]);

  const shareUrl = `${window.location.origin}${window.location.pathname}#/recipe/${encodeURIComponent(handle)}/${encodeURIComponent(rkey)}`;

  const shareToBluesky = () => {
    const v = recipe?.value;
    const text = v
      ? `${v.name}\n\n${shareUrl}`
      : shareUrl;
    window.open(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
      "_blank"
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openInCalculator = () => {
    if (recipe) {
      localStorage.setItem("bakery-load-recipe", JSON.stringify(recipe));
    }
    window.location.hash = "";
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      maxWidth: 900, margin: "0 auto", padding: 16,
      background: "#faf8f5", minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26, fontWeight: 700, color: "#3e2723",
            margin: 0, letterSpacing: "-0.5px", cursor: "pointer",
          }}
          onClick={() => { window.location.hash = ""; }}
        >
          {"\u{1F33E}"} Flour Blend Calculator
        </h1>
        <p style={{ color: "#795548", fontSize: 14, margin: "6px 0 0" }}>
          Shared recipe from <strong>@{handle}</strong>
        </p>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#795548" }}>
          Loading recipe...
        </div>
      )}

      {error && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <p style={{ color: "#c62828", fontSize: 15, margin: "0 0 16px" }}>
            Could not load recipe: {error}
          </p>
          <button onClick={() => { window.location.hash = ""; }} style={btnSecondary}>
            Back to Calculator
          </button>
        </div>
      )}

      {recipe && (() => {
        const v = recipe.value;
        return (
          <>
            {/* Recipe name & description */}
            <div style={card}>
              <h2 style={{ margin: "0 0 8px", color: "#3e2723", fontSize: 22 }}>
                {v.name}
              </h2>
              {v.text && (
                <p style={{ color: "#5d4037", fontSize: 14, margin: "0 0 10px", lineHeight: 1.6 }}>
                  {v.text}
                </p>
              )}
              {/* Metadata tags */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {v.cookingMethod && <Tag label={v.cookingMethod} />}
                {v.recipeCategory && <Tag label={v.recipeCategory} />}
                {v.recipeCuisine && <Tag label={v.recipeCuisine} />}
                {v.prepTime && <Tag label={`Prep: ${formatDuration(v.prepTime)}`} />}
                {v.cookTime && <Tag label={`Cook: ${formatDuration(v.cookTime)}`} />}
                {v.recipeYield && <Tag label={v.recipeYield} />}
              </div>
              {v.keywords?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                  {v.keywords.map((k, i) => (
                    <span key={i} style={{
                      fontSize: 11, color: "#8d6e63", background: "#efebe9",
                      padding: "2px 8px", borderRadius: 10,
                    }}>
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Ingredients */}
            {v.ingredients?.length > 0 && (
              <div style={card}>
                <h3 style={{ margin: "0 0 10px", color: "#3e2723", fontSize: 16, fontWeight: 700 }}>
                  Ingredients
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#3e2723", lineHeight: 1.8 }}>
                  {v.ingredients.map((ing, i) =>
                    ing.startsWith("## ") ? (
                      <li key={i} style={{
                        listStyle: "none", marginLeft: -20,
                        fontWeight: 600, marginTop: i > 0 ? 10 : 0, color: "#5d4037",
                      }}>
                        {ing.slice(3)}
                      </li>
                    ) : (
                      <li key={i}>{ing}</li>
                    )
                  )}
                </ul>
              </div>
            )}

            {/* Instructions */}
            {v.instructions?.length > 0 && (
              <div style={card}>
                <h3 style={{ margin: "0 0 10px", color: "#3e2723", fontSize: 16, fontWeight: 700 }}>
                  Instructions
                </h3>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#3e2723", lineHeight: 1.8 }}>
                  {v.instructions.map((step, i) =>
                    step.startsWith("## ") ? (
                      <li key={i} style={{
                        listStyle: "none", marginLeft: -20,
                        fontWeight: 600, marginTop: i > 0 ? 10 : 0, color: "#5d4037",
                      }}>
                        {step.slice(3)}
                      </li>
                    ) : (
                      <li key={i} style={{ marginBottom: 6 }}>{step}</li>
                    )
                  )}
                </ol>
              </div>
            )}

            {/* Nutrition */}
            {v.nutrition && (
              <div style={card}>
                <h3 style={{ margin: "0 0 10px", color: "#3e2723", fontSize: 16, fontWeight: 700 }}>
                  Nutrition
                </h3>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "#5d4037" }}>
                  {v.nutrition.calories != null && <span>{v.nutrition.calories} cal</span>}
                  {v.nutrition.proteinContent != null && <span>{v.nutrition.proteinContent}g protein</span>}
                  {v.nutrition.carbohydrateContent != null && <span>{v.nutrition.carbohydrateContent}g carbs</span>}
                  {v.nutrition.fatContent != null && <span>{v.nutrition.fatContent}g fat</span>}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <button onClick={shareToBluesky} style={btnPrimary}>
                Share on Bluesky
              </button>
              <button onClick={copyLink} style={btnSecondary}>
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button onClick={openInCalculator} style={btnSecondary}>
                Open in Calculator
              </button>
            </div>

            {/* AT URI */}
            <div style={{
              marginTop: 16, fontSize: 11, fontFamily: "monospace",
              color: "#a1887f", wordBreak: "break-all",
            }}>
              {recipe.uri}
            </div>
          </>
        );
      })()}
    </div>
  );
}
