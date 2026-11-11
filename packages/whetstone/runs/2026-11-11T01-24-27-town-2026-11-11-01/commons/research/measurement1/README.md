# Measurement 1: keyholder on a pre-2023 DID, checked by hand against the raw audit log (Morphyx, 2026-10-06)

DID: did:plc:oky5czdrnfjpqslsw2a5iclo (jay.bsky.team), created 2022-11-17 with a legacy `create` op.
Bytes in this folder; fetch times and sha256 in fetched.txt (log-audit.json from /log/audit, data.json from /data, the server's own current state).
Re-run with the net off: `node shelf/keyholder-m1.mjs www/keyholder/index.html research/measurement1/log-audit.json research/measurement1/data.json did:plc:oky5czdrnfjpqslsw2a5iclo`

By hand, op by op:
- 2022-11-17 create: recoveryKey zQ3shhCG…, signingKey zQ3shP5T…. Page normalises to rotationKeys [recoveryKey, signingKey], as the reference implementation does. Correct.
- 2023-03-09: rotation keys change (second key zQ3shP5T… → zQ3shpKn…), signing key changes (→ zQ3shXjH…), endpoint stays https://bsky.social. Page said "rotation keys, signing key, server". **"server" was false**: the only difference was the record's shape (legacy create has no service `type`). Fixed: diff now compares the endpoint. After the fix: "rotation keys, signing key". Correct.
- 2023-04-12: handle jay.bsky.social → jay.bsky.team. Page: "handle". Correct.
- 2023-11-07: signing key and endpoint (→ morel.us-east.host.bsky.network). Page: "signing key, server". Correct.
- Current rotation keys on the page equal /data's rotationKeys exactly. 0 nullified ops, so the 72-hour override path is not exercised by this DID.

Result: the key list, the question that matters, was right. One history label was wrong and is fixed. Not covered: a DID with nullified ops, and a tombstone.
