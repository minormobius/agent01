// pm.selftest.ts — the PM tools against a sealed project on a stub PDS (no network).
// Run: npm run selftest
import assert from "node:assert/strict";
import { sealRecord } from "../../src/crypto";
import { state } from "./state";
import { pmTools } from "./tools/pm";

const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
const T = (id: string, cost: number, pct: number, s: string, e: string, parentId: string | null = null) => ({
  id, name: `task ${id}`, plannedCost: cost, actualCost: cost * pct / 200, plannedStart: s, plannedEnd: e,
  duration: 40, percentComplete: pct, parentId, assigneeId: null, createdAt: "2026-01-01",
  kanbanLane: "", queued: false, reviewed: false,
});
const project = {
  projectName: "Stub", tasks: [T("a", 100, 100, "2026-01-01", "2026-01-05"), T("b", 300, 50, "2026-01-05", "2026-01-15")],
  deps: [{ from: "a", to: "b" }], baselines: [], baselineVisible: {}, collapsed: [], members: [], kanbanLanes: [],
};
const envelope = await sealRecord("com.minomobi.pm.project", { _pmState: project }, "self", dek);
state.vault = {
  client: { getRecord: async (c: string, k: string) => (k === "pm-main" ? { value: envelope } : null) },
  dek, did: "did:plc:stub", handle: "stub.test",
} as never;

const read = async (name: keyof typeof pmTools, args: Record<string, unknown> = {}) =>
  JSON.parse((await pmTools[name].handler(args)).content[0].text);

const st = await read("pm-status", { asOf: "2026-01-10" });
assert.equal(st.project, "Stub");
assert.equal(st.evm.ev, 250);
assert.equal(st.evm.bac, 400);
assert.deepEqual(st.criticalPath, ["task a", "task b"]);
assert.deepEqual(st.late, []);
assert.equal((await read("pm-status", { asOf: "2026-01-20" })).late[0].id, "b");

const tk = await read("pm-tasks");
assert.equal(tk.tasks.length, 2);
assert.deepEqual(tk.deps, [{ from: "a", to: "b" }]);

const ve = await read("pm-verified-earned", {
  asOf: "2026-01-10", status: { R1: "verified", R2: "failed" },
  links: [{ from: "a", to: "R1" }, { from: "b", to: "R2" }],
});
assert.equal(ve.verified.evm.ev, 100);
assert.equal(ve.claimedEv, 250);
assert.equal(ve.unverifiedClaim, 150);
assert.deepEqual(ve.byTask.b.failed, ["R2"]);

await assert.rejects(() => pmTools["pm-status"].handler({ asOf: "soon" }), /YYYY-MM-DD/);
console.log("vault-mcp pm selftest: status, tasks, verified-earned on a sealed stub project");
