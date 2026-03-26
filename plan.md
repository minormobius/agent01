# Refactor Plan: Hub-Level Org Management, Shared Vault, Delete Org, Calendar Fixes

## Overview

Five changes that together constitute a significant architectural refactor:
1. Move CRM's OrgManager to the hub level (all apps share it)
2. Add delete org flow
3. Single vault — no re-decrypting between apps
4. Quarter view events match month view (titles, not dots)
5. Calendar uses in-app navigation, no new tab

## 1. Move OrgManager from CRM to Hub

**What changes:**
- Move `crm/components/OrgManager.tsx` → `components/OrgManager.tsx` (update imports)
- Move `crm/components/HandleTypeahead.tsx` → `components/HandleTypeahead.tsx`
- Move `crm/authority.ts` → `authority.ts` (OrgManager depends on it)
- In `App.tsx` HubHome: replace simple `OrgList → OrgDetail → CreateOrg` with `OrgManager` as the full org management UI
- Remove the OrgManager modal from `CrmApp.tsx` — CRM no longer owns org management
- CRM keeps its `OrgSwitcher` dropdown for filtering deals by org (read-only org selection, minus "Manage Orgs" button)
- Remove org creation/join/member-invite callbacks from CrmApp (those live in hub now)

**Key decision:** The hub's existing simple OrgDetail and CreateOrg get **replaced** by the CRM's more capable OrgManager (which already contains its own OrgList, CreateOrg, JoinOrg, and ManageOrg sub-views with offices, workflow, relationships). The hub's simpler versions in `components/OrgDetail.tsx` and `components/CreateOrg.tsx` become unused.

## 2. Delete Org Flow

**Add to OrgManager's ManageOrg view:**
- New "Danger Zone" section at bottom of manage view
- "Delete Organization" button (only for founder)
- Confirmation: type org name to confirm
- On confirm:
  1. Delete all keyring records for this org
  2. Delete all membership records for this org
  3. Delete the org record itself
  4. Sealed records become orphaned (encrypted, keys gone) — graceful degradation
  5. Members' bookmarks become stale — they'll see "org not found" on next load
- Callback: `onOrgDeleted: (orgRkey: string) => void` — hub removes from state

## 3. Single Vault — Shared Across Apps

**Current problem:** Each app independently calls `discoverOrgs()` and `buildOrgContext()` on mount, duplicating network calls and crypto.

**Solution — lift org contexts to App.tsx:**
- After `bootstrapVault()`, App.tsx builds all org contexts using `buildOrgContext` from crm/context.ts
- Store `orgContexts: Map<string, OrgContext>` in App-level state
- Pass `orgContexts` + `orgs` + `memberships` down to all apps as props
- Each app no longer does its own org discovery on mount
- Apps receive pre-built contexts with unwrapped DEKs ready to use

**What gets removed from each app:**
- CrmApp: Remove `discoverOrgs()` call, remove local `orgs`/`memberships`/`orgContexts` state. Keep deal-loading (uses passed-in contexts).
- CalendarApp: Remove org discovery. Keep event-loading.
- WaveApp: Remove org discovery. Keep channel/thread loading.
- PmApp: Receives org list for its picker.

## 4. Quarter View Events — Match Month View

- Replace dot rendering with mini event bars (same `.cal-day-event` pattern but compact)
- Show max 2 events per cell with "+N more" overflow
- New CSS `.cal-qday-event` — smaller font version of `.cal-day-event`

## 5. Calendar — No New Tab

- Add `cal: "/cal"` to `INTERNAL_ROUTES` in `AppGrid.tsx` (currently missing — only pm, wave, crm are listed)

## Implementation Order

1. QuarterView events (isolated fix)
2. Calendar navigation (one-line fix)
3. Lift org contexts to App.tsx (shared vault)
4. Move OrgManager to hub
5. Delete org flow
6. Build, commit, push
