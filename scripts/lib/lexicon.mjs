// lexicon.mjs — where a lexicon schema has to live for anyone to find it.
//
// THE RULE IS EASY TO GET SUBTLY WRONG AND IT NEVER COMPLAINS. Lexicon
// resolution takes an NSID, DROPS THE FINAL SEGMENT, reverses the rest into a
// hostname, and looks for a TXT record at `_lexicon.<that>` containing
// `did=did:plc:…`. It does NOT recurse up or down the DNS hierarchy — only the
// exact computed name is queried.
//
//   com.minomobi.lab.doc  →  com.minomobi.lab  →  lab.minomobi.com
//
// So `_lexicon.minomobi.com` is wrong for that NSID, despite being a real name
// we own and the obvious guess. A schema published behind the wrong TXT record
// looks identical to one published behind the right one until somebody tries to
// resolve it.

/** The DNS authority for an NSID, or null if it is too short to have one.
 * @param {string} nsid @returns {string | null} */
export function lexiconAuthority(nsid) {
  const parts = String(nsid ?? '').split('.').filter(Boolean);
  if (parts.length < 3) return null;
  return parts.slice(0, -1).reverse().join('.');
}
