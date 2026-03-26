import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./router";
import { App } from "./App";
import { initTheme } from "./theme";
import "./index.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
