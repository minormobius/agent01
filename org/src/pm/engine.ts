/**
 * PM computation engine. Moved to packages/pm/engine.mjs on 2026-10-04 so the app, vault-mcp's PM
 * tools and agents share one implementation (engine.selftest.mjs there pins today's numbers).
 * This file keeps the app's imports working unchanged.
 */
export * from "../../../packages/pm/engine.mjs";
