# Next Steps: ATProto Corporate Tools

Last updated: 2026-03-21

---

## Context: Where We Are

### Built and working

- **Vault** — E2EE infrastructure (AES-256-GCM, ECDH P-256, epoch keyrings, tier-based DEKs)
- **CRM** — Deals pipeline, contacts, companies, kanban boards, org-scoped filtering
- **Orgs** — Multi-org with tiers, membership, authority resolution, change control protocol
- **Org relationships** — Inter-org governance (co-founder, acquisition, skunkworks, merger, peer)
- **Tier bridges** — Cross-org data visibility at the tier level
- **Wave** — Encrypted team chat with Jetstream live updates, org/tier-aware channels
- **Wave docs** — Level 2 collaborative editing (snapshot + causal DAG)
- **Mega** — Public infrastructure bounty tracker (separate, unencrypted)

### Existing task primitives

- `com.minomobi.tasks.issue` — title, description, status (open/in-progress/review/done/cancelled), priority, assignee, labels, dueAt
- `com.minomobi.tasks.board` — named kanban board with ordered columns

These are defined as inner records (encrypted inside `vault.sealed`). Not yet wired into any UI.

---

## Next: Project Management Module

Build Jira-like project management with calendar/scheduler/Gantt functionality on top of the existing vault + org infrastructure.

### Phase 1 — New Lexicons

Extend `com.minomobi.tasks.*` with records for projects, milestones, scheduling, and time tracking.

#### `tasks.project`
Top-level container that groups boards, issues, and milestones under one umbrella.

- name, description, status (active/paused/completed/archived)
- ownerDid (project lead)
- boardRkeys[] — associated boards
- startAt, targetEndAt — project-level date range
- orgRkey — ties to org for tier-scoped access

#### `tasks.milestone`
Named checkpoint within a project with a target date. Issues link to milestones.

- name, description
- projectRkey — parent project
- targetAt — deadline
- status (open/reached/missed)
- issueRkeys[] — linked issues (or reverse-link from issue → milestone)

#### `tasks.dependency`
Explicit dependency edge between two issues. This is what makes Gantt possible.

- fromIssueRkey — the blocking issue
- toIssueRkey — the blocked issue
- type (blocks/blocked-by/relates-to)
- lagDays — optional offset (finish-to-start + N days)

#### `tasks.schedule` (per-issue scheduling metadata)
Extends an issue with duration and calendar placement without bloating the issue record.

- issueRkey
- startAt, endAt — scheduled date range
- estimatedHours
- actualHours

#### `tasks.sprint`
Time-boxed iteration (for teams that want sprints).

- name, projectRkey
- startAt, endAt
- issueRkeys[] — issues committed to this sprint
- goal — short description of sprint objective

### Phase 2 — Issue Enhancements

Extend the existing `tasks.issue` lexicon:

- Add `milestoneRkey` — link to parent milestone
- Add `projectRkey` — link to parent project
- Add `sprintRkey` — link to current sprint
- Add `storyPoints` (integer) — relative estimation
- Add `parentIssueRkey` — for subtask/epic hierarchy
- Add `watchers` (DID array) — users subscribed to changes

### Phase 3 — Calendar & Gantt UI

#### Calendar view
- Month/week/day views showing issues by `schedule.startAt`/`endAt`
- Color-coded by project, priority, or assignee
- Drag-to-reschedule (writes new `tasks.schedule` record via change control)
- Milestone markers on timeline
- Sprint boundaries shown as shaded regions

#### Gantt view
- Horizontal bar chart: one row per issue, bar = schedule duration
- Dependency arrows drawn from `tasks.dependency` records
- Critical path highlighting (longest chain of blocking dependencies)
- Milestone diamonds on the timeline
- Zoom: day/week/month granularity
- Drag bar edges to adjust schedule (writes new sealed record)

#### Board view (already have columns from `tasks.board`)
- Wire existing board/issue lexicons into UI
- Swimlanes by assignee, priority, or milestone
- WIP limits per column
- Quick filters (my issues, overdue, blocked)

### Phase 4 — Cross-PDS Project Sync

Since issues are sealed records on individual member PDSes:

- Project lead creates `tasks.project` on their PDS
- Members write their assigned issues to their own PDSes
- Discovery: scan all org member PDSes for `vault.sealed` records with `innerType: com.minomobi.tasks.issue` matching the project rkey
- Gantt/calendar aggregates across PDSes — same pattern as CRM deal aggregation
- Jetstream for live updates when team members create/update issues

### Phase 5 — Workflow Automation

Reuse the existing authority + workflow gate infrastructure:

- Auto-transition: issue moves to "review" when linked PR merges (future: GitHub integration)
- Gate enforcement: "done" requires sign-off from tier with `manage_workflow` authority
- Sprint auto-close: when sprint endAt passes, unfinished issues roll to next sprint
- Notifications via Wave: "@assignee your issue is blocked by X" as encrypted chat ops

---

## Relationship to ATProto Permissioned Data (Holmgren, March 2026)

Daniel Holmgren's "Permissioned Data Diary 4" outlines ATProto's protocol-level direction for group data: permission spaces with member lists, pull-based ECMH sync, and a new `ats://` URI scheme.

**Key differences from our approach:**
- His system is **unencrypted** — access control at the reader/relay level, not crypto
- His system is **protocol-native** — built into ATProto's sync layer
- Ours is **application-layer** — uses existing PDS record APIs + client-side E2EE

**Migration path when permission spaces ship:**
1. Our org → his permission space (member list maps directly)
2. Our tier model layers on top (his read/write → our tiered DEK access)
3. Our sealed records live inside his permissioned repos
4. His ECMH sync replaces our full-PDS-scan discovery
5. We keep E2EE — his sync handles addressing, our crypto handles confidentiality

**No conflict.** We're the encrypted corporate layer; he's building the unencrypted social primitive. When `ats://` lands, we adopt his sync and keep our crypto.

---

## Open Questions

1. **Gantt rendering library** — build from scratch on Canvas/SVG, or use something like frappe-gantt / dhtmlxGantt? Needs to work offline (PWA) and handle encrypted data in-memory only.
2. **Subtask depth** — flat (issue + one level of subtasks) or arbitrary nesting (epic → story → task → subtask)? Jira-style is usually 2-3 levels max.
3. **Time tracking UX** — timer-based (start/stop) or manual entry? Timer needs foreground tab or service worker.
4. **Sprint vs. continuous flow** — support both? Sprint is more overhead but some teams expect it.
5. **Gantt critical path** — compute client-side from dependency graph? Could be expensive with large projects but we're at team scale.
6. **Change control on schedule changes** — should dragging a Gantt bar require proposal/approval, or is that too heavy for day-to-day scheduling?
