/**
 * Doc state tool — composes the current state of a Wave doc thread
 * by reading all doc_edit operations and returning the latest full text.
 */

import {
  loadOpsForThread,
  decryptOp,
} from "../../../src/wave/context";
import type { WaveOrgContext, DocEditPayload } from "../../../src/wave/types";
import { state, requireVault } from "../state";

function getOrgCtx(orgRkey: string): WaveOrgContext {
  const ctx = state.orgContexts.get(orgRkey);
  if (!ctx) throw new Error(`Org not found or no access: ${orgRkey}`);
  return ctx as unknown as WaveOrgContext;
}

export const docStateTools = {
  "doc-state": {
    description:
      "Get the current full text of a Wave doc thread. " +
      "Reads all doc_edit operations and returns the latest version, " +
      "plus edit history summary.",
    handler: async (args: {
      org: string; threadAuthorDid: string; threadRkey: string;
      includeHistory?: boolean;
    }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);
      const threadUri = `at://${args.threadAuthorDid}/com.minomobi.wave.thread/${args.threadRkey}`;
      const ops = await loadOpsForThread(vault.client, ctx, threadUri, vault.did);

      // Filter to doc_edit ops only
      const docOps = ops.filter((o) => o.op.opType === "doc_edit");

      if (docOps.length === 0) {
        return { content: [{ type: "text" as const, text: "This thread has no document edits." }] };
      }

      // Decrypt all edits
      const edits: Array<{
        text: string;
        authorDid: string;
        authorHandle?: string;
        createdAt: string;
        rkey: string;
      }> = [];

      for (const op of docOps) {
        const payload = await decryptOp(op.op, ctx);
        if (payload && "text" in payload) {
          edits.push({
            text: (payload as DocEditPayload).text,
            authorDid: op.authorDid,
            authorHandle: op.authorHandle,
            createdAt: op.op.createdAt,
            rkey: op.rkey,
          });
        }
      }

      if (edits.length === 0) {
        return { content: [{ type: "text" as const, text: "Could not decrypt any document edits." }] };
      }

      // Latest edit is the current doc state
      const current = edits[edits.length - 1];
      const author = current.authorDid === vault.did ? `you (@${vault.handle})` : (current.authorHandle ?? current.authorDid);

      let output = `Document (${edits.length} edit(s), last by ${author} at ${new Date(current.createdAt).toLocaleString()}):\n\n---\n${current.text}\n---`;

      if (args.includeHistory && edits.length > 1) {
        const history = edits.map((e, i) => {
          const who = e.authorDid === vault.did ? "you" : (e.authorHandle ?? e.authorDid);
          const len = e.text.length;
          return `  ${i + 1}. [${e.rkey}] ${new Date(e.createdAt).toLocaleString()} by ${who} (${len} chars)`;
        });
        output += `\n\nEdit history:\n${history.join("\n")}`;
      }

      return { content: [{ type: "text" as const, text: output }] };
    },
  },
};
