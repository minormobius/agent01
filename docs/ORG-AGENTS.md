# Agents in org — remote, scoped, encryption-aware access

**Status: design, 2026-10-04. Nothing here is built.** What is built: vault-mcp (`org/mcp/`), a
local stdio server that holds the person's whole vault in-process, and its read-only `pm-*` tools.

## The problem with the local server

vault-mcp unlocks with the person's handle, app password **and vault passphrase**. Whatever runs
it holds everything: every tier of every org, the personal vault, write access to the PDS. That is
fine on the person's own laptop with their own Claude Code. It is wrong for anything else: a
cloud session, a scheduled routine, the miniphim, a colleague's agent. Those need access that is
*remote* (no laptop in the loop), *scoped* (one org, one tier, one kind of record), and
*revocable* (gone without changing the person's passphrase).

## The answer is already in the org model: an agent is a member

org's encryption is per-tier keyrings. Each tier's DEK is wrapped to each member's identity public
key by ECDH (`wrapDekForMember`), and a member decrypts exactly the tiers at or below theirs.
Writes that change someone else's record go through `Proposal` → `Approval` (signed per office
from workflow gates) → `applyProposal`. So:

1. **The agent has its own ATProto account and identity keypair**: a DID, a PDS, an app password,
   and an identity key generated and held where the agent runs, never the person's.
   (`miniphim.delve.town` is the shape; for org it would be any PDS.)
2. **The person invites it into an org at a tier**, the same as a human. The keyring for that tier
   is wrapped to the agent's public key. It can read that tier and below, nothing else, and never
   the person's personal vault.
3. **Revocation is the existing epoch rotation.** Remove the membership, rotate the tier (new
   epoch, new DEK wrapped to everyone else). Old records stay readable to the agent, as for any
   departed member; new ones are not.
4. **The agent writes proposals, not records.** It holds no office, so its changes sit as `open`
   proposals until a human with the right office approves. Its own notes and computed reports it
   writes to its own PDS, sealed to the tier, where members can read them.

Nothing about this needs a new server. The agent runs vault-mcp (or the same library) unlocked
with **its own** credentials, and sees the org through its membership.

## What has to be built

In order, each useful alone:

| # | Piece | Size |
|---|---|---|
| 1 | **Agent unlock** in vault-mcp: identity key from a file or env (`VAULT_IDENTITY_KEY`), so a headless agent needs no passphrase prompt and never sees the person's | small |
| 2 | **PM in orgs.** PM sync writes `pm-main` to the personal keyring only (`"self"`). Add an org target: seal the project to an org tier keyring, rkey `pm-<org>-<project>`. Then a member, agent or human, can read it. Also fixes one-project-per-PDS | medium; touches Sync.tsx |
| 3 | **`pm-propose`**: a task change as a `Proposal` against the project record (`changeType: "edit"`, a plaintext `summary`), applied in the app by someone holding the office | medium; reuses `createProposal`/`applyProposal` |
| 4 | **Agent badge** in the members list: a membership flag `agent: true`, shown, so nobody mistakes the miniphim for a colleague | small |
| 5 | **Remote transport**: vault-mcp over streamable HTTP, run by the agent's own host (a container, a Worker with the key in a secret). Only once 1–4 exist; until then stdio wherever the agent runs is enough | medium |

Deliberately **not** built: a server that holds people's passphrases or DEKs on their behalf.
The point of the vault is that nobody but members can read it; an agent is just another member.

## Where vv and des fit

They are not PM screens; they are things an agent *computes with*. `pm-verified-earned` is the
seam: the agent runs a V&V tool over a project's requirements and evidence (wherever those live:
a repo, a sealed record), gets a status map, and asks the PM engine what EV that verification
supports. A discrete-event forecast (`pm-forecast`: simulate the remaining task network with
duration uncertainty and resource contention, return a finish-date distribution) is the natural
next tool once the souls' `des` is promoted out of the lab into `packages/`.
