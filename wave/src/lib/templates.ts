/**
 * Template system for Wave.
 *
 * Templates are ATProto records (com.minomobi.wave.template) that contain
 * page scaffolds with markdown content, template variables, and plugin hints.
 *
 * Flow:
 * 1. User browses templates (built-in + from ATProto feeds)
 * 2. User fills in template variables
 * 3. Template is instantiated → creates a new doc thread with expanded content
 */

import type { WaveTemplate, WaveTemplateRecord, TemplateCategory } from '../types';
import type { PdsClient } from './pds';
import { expandTemplate } from './markdown';

const TEMPLATE_COLLECTION = 'com.minomobi.wave.template';

// --- Built-in starter templates ---

export const STARTER_TEMPLATES: WaveTemplate[] = [
  {
    $type: 'com.minomobi.wave.template',
    title: 'Project Board',
    description: 'Kanban-style project tracker with status columns and metadata.',
    category: 'project',
    content: `# {{project_name}}

\`\`\`data
status: active
owner: {{owner}}
started: {{date}}
tags: {{tags}}
\`\`\`

## Overview

{{description}}

## Board

\`\`\`kanban
## Backlog
- [ ] Define requirements
- [ ] Design architecture

## In Progress
- [ ] Set up project

## Review
- [ ] Code review

## Done
\`\`\`

## Notes

`,
    variables: [
      { key: 'project_name', label: 'Project name' },
      { key: 'owner', label: 'Owner' },
      { key: 'description', label: 'Brief description', defaultValue: 'Project overview goes here.' },
      { key: 'tags', label: 'Tags (comma-separated)', defaultValue: 'project' },
      { key: 'date', label: 'Start date' },
    ],
    plugins: ['kanban', 'data'],
    tags: ['project', 'kanban', 'tracker'],
    createdAt: new Date().toISOString(),
  },
  {
    $type: 'com.minomobi.wave.template',
    title: 'Daily Journal',
    description: 'Daily note with gratitude, tasks, and reflections.',
    category: 'journal',
    content: `# {{date}} — Daily Journal

## Gratitude
-

## Today's Focus
- [ ]

## Tasks

\`\`\`kanban
## Must Do
- [ ]

## Should Do
- [ ]

## Could Do
- [ ]
\`\`\`

## Notes & Ideas


## Evening Reflection

**What went well?**


**What could improve?**


**Key takeaway:**

`,
    variables: [
      { key: 'date', label: 'Date' },
    ],
    plugins: ['kanban'],
    tags: ['journal', 'daily', 'reflection'],
    createdAt: new Date().toISOString(),
  },
  {
    $type: 'com.minomobi.wave.template',
    title: 'Meeting Notes',
    description: 'Structured meeting notes with attendees, agenda, and action items.',
    category: 'meeting',
    content: `# {{meeting_title}}

\`\`\`data
date: {{date}}
attendees: {{attendees}}
type: {{meeting_type}}
\`\`\`

## Agenda

1.

## Discussion Notes


## Decisions Made

-

## Action Items

- [ ] **{{owner}}**:
- [ ]

## Follow-up

Next meeting:

`,
    variables: [
      { key: 'meeting_title', label: 'Meeting title' },
      { key: 'date', label: 'Date' },
      { key: 'attendees', label: 'Attendees (comma-separated)' },
      { key: 'meeting_type', label: 'Meeting type', defaultValue: 'standup' },
      { key: 'owner', label: 'Your name' },
    ],
    plugins: ['data'],
    tags: ['meeting', 'notes', 'action-items'],
    createdAt: new Date().toISOString(),
  },
  {
    $type: 'com.minomobi.wave.template',
    title: 'Contact / CRM Entry',
    description: 'Track a person or organization with structured data and interaction log.',
    category: 'crm',
    content: `# {{contact_name}}

\`\`\`data
role: {{role}}
company: {{company}}
email: {{email}}
met: {{date}}
tags: {{tags}}
status: active
\`\`\`

## About


## Interaction Log

### {{date}}
- Initial contact

## Notes

## Links

`,
    variables: [
      { key: 'contact_name', label: 'Contact name' },
      { key: 'role', label: 'Role / title', defaultValue: '' },
      { key: 'company', label: 'Company / org', defaultValue: '' },
      { key: 'email', label: 'Email', defaultValue: '' },
      { key: 'tags', label: 'Tags', defaultValue: 'contact' },
      { key: 'date', label: 'Date met' },
    ],
    plugins: ['data'],
    tags: ['crm', 'contact', 'people'],
    createdAt: new Date().toISOString(),
  },
  {
    $type: 'com.minomobi.wave.template',
    title: 'Knowledge Base Article',
    description: 'Structured reference article with overview, details, and related links.',
    category: 'knowledge',
    content: `# {{title}}

\`\`\`data
category: {{category}}
tags: {{tags}}
last_updated: {{date}}
\`\`\`

## Overview

{{summary}}

## Details


## Examples


## Related Pages

- [[]]

## References

`,
    variables: [
      { key: 'title', label: 'Article title' },
      { key: 'category', label: 'Category' },
      { key: 'tags', label: 'Tags', defaultValue: 'knowledge' },
      { key: 'summary', label: 'Brief summary', defaultValue: '' },
      { key: 'date', label: 'Date' },
    ],
    plugins: ['data'],
    tags: ['knowledge', 'wiki', 'reference'],
    createdAt: new Date().toISOString(),
  },
  {
    $type: 'com.minomobi.wave.template',
    title: 'Bug / Issue Tracker',
    description: 'Track bugs and issues with severity, status, and resolution notes.',
    category: 'tracker',
    content: `# {{issue_title}}

\`\`\`data
severity: {{severity}}
status: open
reported_by: {{reporter}}
assigned_to: {{assignee}}
date: {{date}}
tags: bug, {{component}}
\`\`\`

## Description

{{description}}

## Steps to Reproduce

1.

## Expected Behavior


## Actual Behavior


## Resolution

`,
    variables: [
      { key: 'issue_title', label: 'Issue title' },
      { key: 'severity', label: 'Severity', defaultValue: 'medium' },
      { key: 'reporter', label: 'Reported by' },
      { key: 'assignee', label: 'Assigned to', defaultValue: '' },
      { key: 'component', label: 'Component', defaultValue: 'general' },
      { key: 'description', label: 'Brief description' },
      { key: 'date', label: 'Date' },
    ],
    plugins: ['data'],
    tags: ['bug', 'issue', 'tracker'],
    createdAt: new Date().toISOString(),
  },
];

// --- Template operations ---

/** Get built-in templates, optionally filtered by category */
export function getStarterTemplates(category?: TemplateCategory): WaveTemplate[] {
  if (!category) return STARTER_TEMPLATES;
  return STARTER_TEMPLATES.filter(t => t.category === category);
}

/** Get all template categories with counts */
export function getTemplateCategories(): Array<{ category: TemplateCategory; count: number }> {
  const counts = new Map<TemplateCategory, number>();
  for (const t of STARTER_TEMPLATES) {
    counts.set(t.category, (counts.get(t.category) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

/**
 * Instantiate a template: expand variables and return final markdown.
 * Built-in variables like {{date}} are auto-filled if not provided.
 */
export function instantiateTemplate(
  template: WaveTemplate,
  userVars: Record<string, string>,
): string {
  // Auto-fill built-in variables
  const now = new Date();
  const vars: Record<string, string> = {
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    datetime: now.toISOString(),
    ...userVars,
  };

  return expandTemplate(
    template.content,
    Object.entries(vars).map(([key, value]) => ({ key, value })),
  );
}

/** Publish a template to your PDS for others to discover */
export async function publishTemplate(
  pds: PdsClient,
  template: WaveTemplate,
): Promise<string> {
  const rkey = generateTid();
  await pds.putRecord(TEMPLATE_COLLECTION, rkey, template);
  return rkey;
}

/** List templates published by a user */
export async function listUserTemplates(
  pds: PdsClient,
  did: string,
): Promise<WaveTemplateRecord[]> {
  const res = await pds.listRecordsFrom(did, TEMPLATE_COLLECTION);
  return res.records.map((r) => {
    const rkey = r.uri.split('/').pop()!;
    return {
      rkey,
      template: r.value as unknown as WaveTemplate,
      authorDid: did,
    };
  });
}

/** Delete a template from your PDS */
export async function deleteTemplate(
  pds: PdsClient,
  rkey: string,
): Promise<void> {
  await pds.deleteRecord(TEMPLATE_COLLECTION, rkey);
}

/** Simple TID generator (timestamp-based) */
function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const rand = BigInt(Math.floor(Math.random() * 1024));
  const tid = now | rand;
  return tid.toString(32).padStart(13, '2');
}
