// The surface serves three apps out of one dist/. The failure mode that a
// 404-based fallback hides is the worst kind: a deep link into a sub-app
// returns 200 with the WRONG app's HTML, so the page half-works and nobody
// files a bug. These assertions pin the prefix table.
import { describe, expect, it } from "vitest";
// @ts-expect-error — worker.js is plain JS with no type declarations.
import { spaFallbackFor } from "../worker.js";

describe("subtree-aware SPA fallback", () => {
  it("serves the periodic table at the root", () => {
    expect(spaFallbackFor("/")).toBe("/");
    expect(spaFallbackFor("/anything-unknown")).toBe("/");
  });

  it("boots each mounted app from its own directory", () => {
    for (const root of ["/pm", "/speclab"]) {
      expect(spaFallbackFor(root)).toBe(`${root}/`);
      expect(spaFallbackFor(`${root}/`)).toBe(`${root}/`);
      expect(spaFallbackFor(`${root}/deep/link`)).toBe(`${root}/`);
    }
  });

  it("never asks ASSETS for an index.html", () => {
    // Workers Static Assets 307s "/pm/index.html" -> "/pm/". Copying that
    // empty redirect body into a 200 is the blank-page bug; asking for the
    // directory avoids it entirely.
    for (const p of ["/", "/x", "/pm", "/pm/deep", "/speclab", "/speclab/deep"]) {
      expect(spaFallbackFor(p)).not.toContain("index.html");
    }
  });

  it("does not treat a prefix collision as a mount", () => {
    // /pmx is not under /pm, and neither is /speclabber. Matching on
    // startsWith(root) alone would hand both the wrong app.
    expect(spaFallbackFor("/pmx")).toBe("/");
    expect(spaFallbackFor("/speclabber/x")).toBe("/");
  });

  it("does not mount /elements — it is one static page, not an SPA", () => {
    // The table routes with location.hash, so it needs no fallback of its own.
    // If it ever grows real paths, add it to SPA_ROOTS and change this.
    expect(spaFallbackFor("/elements")).toBe("/");
    expect(spaFallbackFor("/elements/anything")).toBe("/");
  });

  it("keeps the static public/ pages on the root app's fallback", () => {
    // These are real files in dist/, so the fallback should never fire for
    // them — but if one 404s, the root index is the right thing to serve.
    for (const p of ["/stocks/", "/bogo/", "/agimet/", "/universe.json"]) {
      expect(spaFallbackFor(p)).toBe("/");
    }
  });
});
