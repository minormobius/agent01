// The surface serves three apps out of one dist/. The failure mode that a
// 404-based fallback hides is the worst kind: a deep link into a sub-app
// returns 200 with the WRONG app's HTML, so the page half-works and nobody
// files a bug. These assertions pin the prefix table.
import { describe, expect, it } from "vitest";
// @ts-expect-error — worker.js is plain JS with no type declarations.
import { spaIndexFor } from "../worker.js";

describe("subtree-aware SPA fallback", () => {
  it("serves the periodic table at the root", () => {
    expect(spaIndexFor("/")).toBe("/index.html");
    expect(spaIndexFor("/anything-unknown")).toBe("/index.html");
  });

  it("boots each mounted app from its own index", () => {
    for (const root of ["/pm", "/speclab"]) {
      expect(spaIndexFor(root)).toBe(`${root}/index.html`);
      expect(spaIndexFor(`${root}/`)).toBe(`${root}/index.html`);
      expect(spaIndexFor(`${root}/deep/link`)).toBe(`${root}/index.html`);
    }
  });

  it("does not treat a prefix collision as a mount", () => {
    // /pmx is not under /pm, and neither is /speclabber. Matching on
    // startsWith(root) alone would hand both the wrong app.
    expect(spaIndexFor("/pmx")).toBe("/index.html");
    expect(spaIndexFor("/speclabber/x")).toBe("/index.html");
  });

  it("keeps the static public/ pages on the root app's fallback", () => {
    // These are real files in dist/, so the fallback should never fire for
    // them — but if one 404s, the root index is the right thing to serve.
    expect(spaIndexFor("/stocks/")).toBe("/index.html");
    expect(spaIndexFor("/bogo/")).toBe("/index.html");
  });
});
