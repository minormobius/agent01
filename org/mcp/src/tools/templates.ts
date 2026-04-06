/**
 * Template tools — reusable templates for deals, tasks, events, and docs.
 * Stored as plain records on PDS (templates are structural, not sensitive).
 */

import { state, requireVault } from "../state";

const TEMPLATE_COLLECTION = "com.minomobi.vault.template";

export interface Template {
  $type: "com.minomobi.vault.template";
  name: string;
  category: "deal" | "task" | "event" | "doc" | "checklist";
  orgRkey: string;
  /** JSON-serialized template content — structure depends on category */
  content: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
}

interface TemplateRecord {
  rkey: string;
  template: Template;
}

async function loadTemplates(orgRkey?: string, category?: string): Promise<TemplateRecord[]> {
  const vault = state.vault!;
  const templates: TemplateRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await vault.client.listRecords(TEMPLATE_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as Template;
      if (orgRkey && val.orgRkey !== orgRkey) continue;
      if (category && val.category !== category) continue;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      templates.push({ rkey, template: val });
    }
    cursor = page.cursor;
  } while (cursor);
  return templates;
}

export const templateTools = {
  "list-templates": {
    description: "List available templates. Filter by org or category (deal/task/event/doc/checklist).",
    handler: async (args: { org?: string; category?: string }) => {
      requireVault();
      const templates = await loadTemplates(args.org, args.category);

      if (templates.length === 0) {
        return { content: [{ type: "text" as const, text: "No templates found." }] };
      }

      const orgName = (rkey: string) => state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;

      const lines = templates.map((t) =>
        `- [${t.rkey}] ${t.template.category}: "${t.template.name}" | ${orgName(t.template.orgRkey)}${t.template.description ? ` — ${t.template.description}` : ""}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `${templates.length} template(s):\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "get-template": {
    description: "Get a template's full content. Returns the parsed template structure.",
    handler: async (args: { rkey: string }) => {
      requireVault();
      const templates = await loadTemplates();
      const t = templates.find((x) => x.rkey === args.rkey);
      if (!t) return { content: [{ type: "text" as const, text: `Template not found: ${args.rkey}` }] };

      const orgName = state.orgs.find((o) => o.rkey === t.template.orgRkey)?.org.name ?? t.template.orgRkey;

      let contentDisplay: string;
      try {
        const parsed = JSON.parse(t.template.content);
        contentDisplay = JSON.stringify(parsed, null, 2);
      } catch {
        contentDisplay = t.template.content;
      }

      return {
        content: [{
          type: "text" as const,
          text: [
            `Template: ${t.template.name}`,
            `Rkey: ${t.rkey}`,
            `Category: ${t.template.category}`,
            `Org: ${orgName}`,
            t.template.description ? `Description: ${t.template.description}` : null,
            t.template.tags?.length ? `Tags: ${t.template.tags.join(", ")}` : null,
            `Created: ${t.template.createdAt}`,
            `\nContent:\n${contentDisplay}`,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  },

  "create-template": {
    description:
      "Create a reusable template. Content is a JSON object with default values " +
      "for the target type (deal fields, task fields, checklist items, etc).",
    handler: async (args: {
      org: string; name: string;
      category: string; content: string;
      description?: string; tags?: string[];
    }) => {
      const vault = requireVault();
      const org = state.orgs.find((o) => o.rkey === args.org);
      if (!org) throw new Error(`Org not found: ${args.org}`);

      // Validate content is valid JSON
      try { JSON.parse(args.content); } catch { throw new Error("Content must be valid JSON"); }

      const template: Template = {
        $type: TEMPLATE_COLLECTION,
        name: args.name,
        category: args.category as Template["category"],
        orgRkey: args.org,
        content: args.content,
        description: args.description,
        tags: args.tags,
        createdAt: new Date().toISOString(),
      };

      const res = await vault.client.createRecord(TEMPLATE_COLLECTION, template);
      const rkey = res.uri.split("/").pop()!;

      return {
        content: [{
          type: "text" as const,
          text: `Template created: "${args.name}" [${rkey}]\nCategory: ${args.category}\nOrg: ${org.org.name}`,
        }],
      };
    },
  },

  "update-template": {
    description: "Update a template's content, name, or description.",
    handler: async (args: {
      rkey: string; name?: string; content?: string;
      description?: string; tags?: string[];
    }) => {
      const vault = requireVault();
      const templates = await loadTemplates();
      const existing = templates.find((t) => t.rkey === args.rkey);
      if (!existing) throw new Error(`Template not found: ${args.rkey}`);

      if (args.content) {
        try { JSON.parse(args.content); } catch { throw new Error("Content must be valid JSON"); }
      }

      const updated: Template = {
        ...existing.template,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.content !== undefined ? { content: args.content } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        updatedAt: new Date().toISOString(),
      };

      await vault.client.putRecord(TEMPLATE_COLLECTION, args.rkey, updated);

      return {
        content: [{
          type: "text" as const,
          text: `Template updated: "${updated.name}" [${args.rkey}]`,
        }],
      };
    },
  },

  "delete-template": {
    description: "Delete a template.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const templates = await loadTemplates();
      const existing = templates.find((t) => t.rkey === args.rkey);
      if (!existing) throw new Error(`Template not found: ${args.rkey}`);

      await vault.client.deleteRecord(TEMPLATE_COLLECTION, args.rkey);
      return { content: [{ type: "text" as const, text: `Template deleted: "${existing.template.name}" [${args.rkey}]` }] };
    },
  },

  "apply-template": {
    description:
      "Apply a template — returns the template content with any variable substitutions. " +
      "Use the result to create a new deal, task, event, or doc with the appropriate tool.",
    handler: async (args: { rkey: string; variables?: Record<string, string> }) => {
      requireVault();
      const templates = await loadTemplates();
      const t = templates.find((x) => x.rkey === args.rkey);
      if (!t) throw new Error(`Template not found: ${args.rkey}`);

      let content = t.template.content;

      // Replace {{variable}} placeholders
      if (args.variables) {
        for (const [key, value] of Object.entries(args.variables)) {
          content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
      }

      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch { parsed = content; }

      return {
        content: [{
          type: "text" as const,
          text: `Template "${t.template.name}" (${t.template.category}) applied:\n\n${JSON.stringify(parsed, null, 2)}\n\nUse the appropriate create tool (create-deal, create-task, create-event, etc.) with these values.`,
        }],
      };
    },
  },
};
