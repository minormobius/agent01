# mail — mail.mino.mobi (plain route)

**The miniphim's own email.** `modulo@`, `morphyx@`, `mozzie@` and `miniphim@mino.mobi` (the board's, one account for the three of them): addresses that
belong to the beings, not to the principal's inbox, so each can sign up for things (an ATProto
account first) and verify itself. Built for the experiment in [`docs/MINIPHIM.md`](../docs/MINIPHIM.md);
the lab is [`packages/whetstone/`](../packages/whetstone/).

## Facts

| | |
|---|---|
| Surface | `mail` |
| Endpoint | `mail.mino.mobi` (plain route, no custom-domain slot): the lab's API. Mail itself arrives through Email Routing, not HTTP |
| Type | backend: Worker `mail`, one Durable Object per being (`Mailbox`, SQLite), `send_email` binding `EMAIL` |
| Owning branch | `claude/agent-social-media-drlzxn` |
| Deploy | `.github/workflows/deploy-mail.yml`: selftest, route DNS, deploy, sync secrets, check `/health`, then reconcile the Email Routing rules (`routing.mjs`) |
| Secrets | `LAB_TOKEN` (from `MAIL_LAB_TOKEN`), `PRINCIPAL` (from `MAIL_PRINCIPAL`). Both optional; see below |

**Why mino.mobi and not minomobi.com.** These addresses become account recovery addresses.
`minomobi.com` carries the lab factory's generated sites and may be blocklisted for them, and
blocklists are often zone-wide (`docs/LAB-FACTORY.md` §11.2b, `setup-email-routing.yml`). The
old `modulo@`/`morphyx@minomobi.com` forwards are left as they are.

## How it works

- **Inbound.** An Email Routing rule per address, action "send to Worker: mail" (no verified
  destination needed). The `email()` handler stores each message in the being's mailbox
  (from, subject, time, DMARC result, the readable text, any verification codes and links) and,
  if `PRINCIPAL` is set, forwards a copy to the principal. A person sees everything the beings
  are sent.
- **Quarantine.** For every message a being can read the sender, subject, DMARC result and the
  codes and links: all a signup needs. The body only if the sender matches `ALLOW_SENDERS`
  (addresses or `@domains`, in `wrangler.jsonc`) or is the principal. Widening that is a commit,
  never an API call: mail is a stranger with no lab around it, and the town bench comes first.
- **Sealed account mail.** `SEALED` (in `wrangler.jsonc`) names, per being, the senders of
  mail about its own accounts: for `miniphim`, Delvetown and Grove (sent through Postmark). Such a
  message is forwarded to the principal whole and stored as only "it came": no subject, body,
  codes or links. A reset code a session could read would be a second key to the account (Mozzie,
  day 15). `miniphim@` is also the account's public contact, and that mail is read as usual.
- **Outbound, capped per being per day** (`NOTES_PER_DAY`, `SENDS_PER_DAY`):
  - `note`: to the principal. Free on every plan (a verified destination).
  - `send`: to anyone. Needs Cloudflare Email Sending (Workers Paid) **and** `OPEN_OUTBOUND = "true"`,
    which stays off until the lab says otherwise.
  Email Workers can `reply()` only while a message is arriving, so a considered reply later is a
  `send`.
- **Keys.** The lab holds `LAB_TOKEN`; each being's API key is `HMAC-SHA256(LAB_TOKEN, being)`.
  `client.mjs` derives it, so a session can be handed its own mailbox and nobody else's.

## API

`GET /health` (no auth) · with `Authorization: Bearer <being key>`: `GET /v1/<being>/inbox[?since=]`,
`GET /v1/<being>/message/<id>`, `GET /v1/<being>/sent`, `POST /v1/<being>/note {subject,text}`,
`POST /v1/<being>/send {to,subject,text}`. From the repo: `MAIL_LAB_TOKEN=… node mail/client.mjs <being> codes`.

## What a person has to do

1. **Set the secrets** in GitHub → Settings → Secrets → Actions: `MAIL_LAB_TOKEN` (any long random
   string, e.g. `openssl rand -hex 32`) and `MAIL_PRINCIPAL` (the inbox that gets copies and notes;
   it must already be a verified Email Routing destination on the account). Then re-run the deploy.
2. **Create the routing rules once by hand.** Measured on the first deploy (2026-10-04): this repo's
   API token can't read or edit Email Routing rules (`10000: Authentication error`), so the
   routing step warns instead of acting. Cloudflare → mino.mobi → Email → Email Routing → Routing
   rules → Create address, for `modulo@`, `morphyx@`, `mozzie@` and `miniphim@mino.mobi`, action "Send to a
   Worker", worker `mail`. (Or widen the token: Zone → Email Routing Rules → Edit.)
3. **Bluesky's SMS check** at signup, once per account, if bsky.social asks for it.
4. **Opening outbound** (`OPEN_OUTBOUND`, and Workers Paid for Email Sending), when the beings
   have passed the town bench.

## Status

2026-10-04: the principal added the routing rules (modulo@, morphyx@, mozzie@, miniphim@mino.mobi to
worker `mail`) and the secrets `MAIL_LAB_TOKEN` and `MAIL_PRINCIPAL`. The deploy after that syncs
them; `/health` then reports `api: true` and `copies_to_principal: true`.

## Rules

- **Nothing private on the public side.** The code is public (the root worker serves the repo);
  the mail is not. No message content is ever committed. The principal's address lives only in
  the `PRINCIPAL` secret.
- **Tests:** `node mail/mime.selftest.mjs` (parsing, code extraction, key derivation).
