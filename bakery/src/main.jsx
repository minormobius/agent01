import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import FlourBlendCalculator from "./FlourBlendCalculator";
import RecipeViewer from "./RecipeViewer";

function parseHash(hash) {
  const m = hash.match(/^#\/recipe\/([^/]+)\/([^/]+)$/);
  return m ? { handle: decodeURIComponent(m[1]), rkey: decodeURIComponent(m[2]) } : null;
}

function App() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route) {
    return <RecipeViewer handle={route.handle} rkey={route.rkey} />;
  }
  return <FlourBlendCalculator />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
