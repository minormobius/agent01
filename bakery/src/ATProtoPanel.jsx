import { useState, useEffect } from "react";
import { createSession, publishRecipe, listRecipes, fetchRecipe, deleteRecipe } from "./atproto";
import { calculatorToRecipe, recipeToCalculator, parseAtUri, formatDuration } from "./recipeTransform";

const SESSION_KEY = "bakery-atproto-session";
const HANDLE_KEY = "bakery-atproto-handle";

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

const sectionCard = {
  background: "#fff",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  border: "2px solid transparent",
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
  padding: "8px 16px",
  background: "#efebe9",
  color: "#5d4037",
  border: "1px solid #d7ccc8",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #d7ccc8",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

// --- Login Panel ---

function LoginPanel({ onLogin }) {
  const [handle, setHandle] = useState(() => localStorage.getItem(HANDLE_KEY) || "");
  const [appPassword, setAppPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await createSession(handle, appPassword);
      localStorage.setItem(HANDLE_KEY, handle);
      saveSession(session);
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={sectionCard}>
      <h3 style={{ margin: "0 0 8px", color: "#3e2723", fontSize: 16 }}>Sign in with AT Protocol</h3>
      <p style={{ color: "#795548", fontSize: 13, margin: "0 0 12px" }}>
        Use your Bluesky handle and an{" "}
        <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer"
          style={{ color: "#8d6e63" }}>
          app password
        </a>{" "}
        to publish recipes to your Personal Data Server.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          placeholder="handle.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="App password (xxxx-xxxx-xxxx-xxxx)"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          style={inputStyle}
          required
        />
        <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Connecting..." : "Sign In"}
        </button>
        {error && (
          <p style={{ color: "#c62828", fontSize: 13, margin: 0 }}>{error}</p>
        )}
      </form>
    </div>
  );
}

// --- Publish Panel ---

function PublishPanel({ session, recipeState, flours, enrichments, starterFlours, nutrition, recipeName }) {
  const [name, setName] = useState(recipeName || "");
  const [description, setDescription] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (recipeName && !name) setName(recipeName);
  }, [recipeName]);

  const buildRecord = () =>
    calculatorToRecipe({
      name,
      description,
      state: recipeState,
      flours,
      enrichments,
      starterFlours,
      nutrition,
    });

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    setResult(null);
    try {
      const record = buildRecord();
      const res = await publishRecipe(session, record);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={sectionCard}>
      <h3 style={{ margin: "0 0 8px", color: "#3e2723", fontSize: 16 }}>Publish Recipe</h3>
      <p style={{ color: "#795548", fontSize: 13, margin: "0 0 12px" }}>
        Save your current calculator state as a recipe record on your PDS.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          placeholder="Recipe name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handlePublish}
            disabled={publishing || !name.trim()}
            style={{ ...btnPrimary, flex: 1, opacity: publishing || !name.trim() ? 0.6 : 1 }}
          >
            {publishing ? "Publishing..." : "Publish to AT Protocol"}
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={btnSecondary}
          >
            {showPreview ? "Hide JSON" : "Preview JSON"}
          </button>
        </div>
        {showPreview && (
          <pre style={{
            background: "#263238", color: "#a5d6a7", padding: 12, borderRadius: 8,
            fontSize: 11, overflow: "auto", maxHeight: 300, margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {JSON.stringify(buildRecord(), null, 2)}
          </pre>
        )}
        {result && (
          <div style={{ background: "#e8f5e9", padding: 12, borderRadius: 8, fontSize: 13 }}>
            <strong style={{ color: "#2e7d32" }}>Published!</strong>
            <div style={{ marginTop: 4, wordBreak: "break-all", color: "#33691e", fontFamily: "monospace", fontSize: 12 }}>
              {result.uri}
            </div>
          </div>
        )}
        {error && (
          <p style={{ color: "#c62828", fontSize: 13, margin: 0, wordBreak: "break-word" }}>{error}</p>
        )}
      </div>
    </div>
  );
}

// --- Recipe Card (displays a single recipe) ---

function RecipeCard({ record, uri, onDelete, canDelete, onLoadToBuilder }) {
  const [expanded, setExpanded] = useState(false);
  const v = record.value || record;
  const rkey = parseAtUri(uri)?.rkey;

  return (
    <div style={{ ...sectionCard, border: "1px solid #d7ccc8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: "0 0 4px", color: "#3e2723", fontSize: 15 }}>{v.name}</h4>
          <p style={{ color: "#795548", fontSize: 13, margin: 0 }}>{v.text}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Metadata row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {v.cookingMethod && <Tag label={v.cookingMethod} />}
        {v.recipeCategory && <Tag label={v.recipeCategory} />}
        {v.recipeCuisine && <Tag label={v.recipeCuisine} />}
        {v.prepTime && <Tag label={`Prep: ${formatDuration(v.prepTime)}`} />}
        {v.cookTime && <Tag label={`Cook: ${formatDuration(v.cookTime)}`} />}
        {v.recipeYield && <Tag label={v.recipeYield} />}
      </div>

      {v.keywords?.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {v.keywords.map((k, i) => (
            <span key={i} style={{ fontSize: 11, color: "#8d6e63", background: "#efebe9", padding: "2px 8px", borderRadius: 10 }}>
              {k}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid #efebe9", paddingTop: 12 }}>
          {/* Ingredients */}
          <h5 style={{ margin: "0 0 6px", color: "#5d4037", fontSize: 13 }}>Ingredients</h5>
          <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: "#3e2723" }}>
            {v.ingredients?.map((ing, i) =>
              ing.startsWith("## ") ? (
                <li key={i} style={{ listStyle: "none", marginLeft: -20, fontWeight: 600, marginTop: i > 0 ? 8 : 0, color: "#5d4037" }}>
                  {ing.slice(3)}
                </li>
              ) : (
                <li key={i}>{ing}</li>
              )
            )}
          </ul>

          {/* Instructions */}
          <h5 style={{ margin: "0 0 6px", color: "#5d4037", fontSize: 13 }}>Instructions</h5>
          <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: "#3e2723" }}>
            {v.instructions?.map((step, i) =>
              step.startsWith("## ") ? (
                <li key={i} style={{ listStyle: "none", marginLeft: -20, fontWeight: 600, marginTop: i > 0 ? 8 : 0, color: "#5d4037" }}>
                  {step.slice(3)}
                </li>
              ) : (
                <li key={i} style={{ marginBottom: 4 }}>{step}</li>
              )
            )}
          </ol>

          {/* Nutrition */}
          {v.nutrition && (
            <>
              <h5 style={{ margin: "0 0 6px", color: "#5d4037", fontSize: 13 }}>Nutrition (whole recipe)</h5>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                {v.nutrition.calories != null && <span>{v.nutrition.calories} cal</span>}
                {v.nutrition.proteinContent != null && <span>{v.nutrition.proteinContent}g protein</span>}
                {v.nutrition.carbohydrateContent != null && <span>{v.nutrition.carbohydrateContent}g carbs</span>}
                {v.nutrition.fatContent != null && <span>{v.nutrition.fatContent}g fat</span>}
              </div>
            </>
          )}

          {/* AT URI */}
          <div style={{ marginTop: 12, fontSize: 11, fontFamily: "monospace", color: "#a1887f", wordBreak: "break-all" }}>
            {uri}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {onLoadToBuilder && (
              <button
                onClick={() => onLoadToBuilder(record)}
                style={{ ...btnPrimary, fontSize: 12, padding: "6px 14px" }}
              >
                Load to Builder
              </button>
            )}
            {canDelete && rkey && onDelete && (
              <button
                onClick={() => onDelete(rkey)}
                style={{ ...btnSecondary, color: "#c62828", borderColor: "#ef9a9a", fontSize: 12 }}
              >
                Delete from PDS
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ label }) {
  return (
    <span style={{ fontSize: 11, color: "#5d4037", background: "#d7ccc8", padding: "2px 8px", borderRadius: 10 }}>
      {label}
    </span>
  );
}

// --- Browse Panel ---

function BrowsePanel({ session, onLoadToBuilder }) {
  const [handle, setHandle] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedHandle, setLoadedHandle] = useState("");

  const loadUserRecipes = async (targetHandle) => {
    const h = targetHandle || handle;
    if (!h.trim()) return;
    setLoading(true);
    setError("");
    try {
      const records = await listRecipes(h.trim());
      setRecipes(records);
      setLoadedHandle(h.trim());
    } catch (err) {
      setError(err.message);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  // Load own recipes on mount
  useEffect(() => {
    if (session?.handle) {
      setHandle(session.handle);
      loadUserRecipes(session.handle);
    }
  }, [session?.handle]);

  const handleDelete = async (rkey) => {
    if (!session) return;
    try {
      await deleteRecipe(session, rkey);
      setRecipes((prev) => prev.filter((r) => !r.uri.endsWith(`/${rkey}`)));
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const isOwnRecipes = session && loadedHandle === session.handle;

  return (
    <div>
      <div style={sectionCard}>
        <h3 style={{ margin: "0 0 8px", color: "#3e2723", fontSize: 16 }}>Browse Recipes</h3>
        <p style={{ color: "#795548", fontSize: 13, margin: "0 0 10px" }}>
          View recipes from any ATProto user's PDS. Enter a handle to look them up.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="handle.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUserRecipes()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => loadUserRecipes()}
            disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>
        {error && (
          <p style={{ color: "#c62828", fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {loadedHandle && (
        <p style={{ color: "#795548", fontSize: 13, marginBottom: 8 }}>
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} from <strong>{loadedHandle}</strong>
        </p>
      )}

      {recipes.map((r) => (
        <RecipeCard
          key={r.uri}
          record={r}
          uri={r.uri}
          canDelete={isOwnRecipes}
          onDelete={handleDelete}
          onLoadToBuilder={onLoadToBuilder}
        />
      ))}

      {loadedHandle && recipes.length === 0 && !loading && (
        <p style={{ color: "#a1887f", fontSize: 13, textAlign: "center", padding: 20 }}>
          No recipes found.
        </p>
      )}
    </div>
  );
}

// --- Main ATProto Panel ---

export default function ATProtoPanel({ recipeState, flours, enrichments, starterFlours, nutrition, recipeName, onLoadToBuilder }) {
  const [session, setSession] = useState(loadSession);
  const [view, setView] = useState("publish"); // "publish" | "browse"

  const handleLogout = () => {
    saveSession(null);
    setSession(null);
  };

  const handleLoadToBuilder = onLoadToBuilder
    ? (record) => {
        const { name, state } = recipeToCalculator(record, flours, enrichments, starterFlours);
        onLoadToBuilder(name, state);
      }
    : null;

  if (!session) {
    return (
      <div>
        <LoginPanel onLogin={(s) => setSession(s)} />
        <div style={{ ...sectionCard, borderTop: "2px solid #d7ccc8" }}>
          <h3 style={{ margin: "0 0 8px", color: "#3e2723", fontSize: 16 }}>Browse without signing in</h3>
          <p style={{ color: "#795548", fontSize: 13, margin: "0 0 10px" }}>
            You can read anyone's recipes from their PDS without an account.
          </p>
          <BrowsePanel session={null} onLoadToBuilder={handleLoadToBuilder} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Session bar */}
      <div style={{ ...sectionCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#3e2723" }}>
          Signed in as <strong>{session.handle}</strong>
        </span>
        <button onClick={handleLogout} style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }}>
          Sign out
        </button>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid #d7ccc8" }}>
        {[
          { id: "publish", label: "Publish" },
          { id: "browse", label: "My Recipes" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            style={{
              flex: 1, padding: "8px", border: "none",
              background: view === t.id ? "#5d4037" : "#efebe9",
              color: view === t.id ? "#fff" : "#5d4037",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "publish" && (
        <PublishPanel
          session={session}
          recipeState={recipeState}
          flours={flours}
          enrichments={enrichments}
          starterFlours={starterFlours}
          nutrition={nutrition}
          recipeName={recipeName}
        />
      )}
      {view === "browse" && <BrowsePanel session={session} onLoadToBuilder={handleLoadToBuilder} />}
    </div>
  );
}
