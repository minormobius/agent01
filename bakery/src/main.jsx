import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FlourBlendCalculator from "./FlourBlendCalculator";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FlourBlendCalculator />
  </StrictMode>
);
