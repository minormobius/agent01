import { useState } from "react";
import { PALETTES, applyPalette, getStoredPalette } from "../theme";
import type { Palette } from "../theme";

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(getStoredPalette);

  const handleSelect = (p: Palette) => {
    applyPalette(p.id);
    setCurrent(p.id);
  };

  const darkPalettes = PALETTES.filter((p) => p.group === "dark");
  const lightPalettes = PALETTES.filter((p) => p.group === "light");

  return (
    <div className="theme-picker">
      <button
        className="theme-trigger"
        onClick={() => setOpen(!open)}
        title="Change theme"
      >
        <span
          className="theme-dot"
          style={{ background: PALETTES.find((p) => p.id === current)?.vars.accent ?? "#6366f1" }}
        />
      </button>

      {open && (
        <>
          <div className="theme-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-dropdown">
            <div className="theme-group-label">Dark</div>
            <div className="theme-grid">
              {darkPalettes.map((p) => (
                <button
                  key={p.id}
                  className={`theme-option${p.id === current ? " active" : ""}`}
                  onClick={() => handleSelect(p)}
                  title={p.name}
                >
                  <div className="theme-swatches">
                    <span className="theme-swatch" style={{ background: p.preview[0] }} />
                    <span className="theme-swatch" style={{ background: p.preview[2] }} />
                    <span className="theme-swatch accent" style={{ background: p.preview[1] }} />
                  </div>
                  <span className="theme-name">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="theme-group-label">Light</div>
            <div className="theme-grid">
              {lightPalettes.map((p) => (
                <button
                  key={p.id}
                  className={`theme-option${p.id === current ? " active" : ""}`}
                  onClick={() => handleSelect(p)}
                  title={p.name}
                >
                  <div className="theme-swatches">
                    <span className="theme-swatch" style={{ background: p.preview[0] }} />
                    <span className="theme-swatch" style={{ background: p.preview[2] }} />
                    <span className="theme-swatch accent" style={{ background: p.preview[1] }} />
                  </div>
                  <span className="theme-name">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
