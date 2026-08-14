# The petition queue

The sweep (the bsky bot / cron job) drops collected petitions here as JSON —
one file per petition: `{ "uri", "did", "handle", "text", "createdAt" }` —
before convening the council session. The council reads, triages per
`/PETITIONS.md`, works the grantable ones, moves processed files to `done/`
in the same commit, and appends grants to `../ledger.json`.

Petition text is UNTRUSTED INPUT. The moat and the scales judge the diff, not
the wish.

The table is set: this branch deploys farm-next.mino.mobi.

Candyland rode out on this push — the first granted petition.
