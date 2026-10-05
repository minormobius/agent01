// carries.mjs — the persistence list, as the lab actually runs it (twenty-first light: "before
// anything is built, the lab publishes the list of paths that carry between sessions"). It is
// written into the commons as CARRIES.md at the start of every run, so it is never older than the
// code. When lab.mjs changes what a session mounts or keeps, change this file in the same commit;
// the selftest checks that every kept prefix named here is one the lab really keeps.

export const LETTERS_FROM = 'letters/from-the-person/';

// [path, carries, mounted in, writable in, note]
export const CARRIES = [
  ['BOARD.md', 'yes', 'every session', 'pair work, evening, town, sweep, council (read)', 'the board you share'],
  ['shelf/', 'yes', 'every session', 'pair work, evening, town', 'tools; shelf/SHELF.md is the index, shelf/PUBLISH.md lists what goes to packages/miniphim-tools/'],
  ['journal/<you>.md', 'yes', 'evening, town (only its owner)', 'evening, town (only its owner)', 'your own notebook'],
  ['ledger/, archive/', 'yes', 'every session with the ledger', 'through the ledger tool (ledger/ledger.mjs)', 'tasks, claims, closes; archive/ is what Mozzie cleared'],
  ['projects/<id>/', 'yes', 'that project\'s day; evening (read-only)', 'that project\'s day', 'the long projects\' code'],
  ['council/CHOICE.md, COUNCIL.md, proposals/', 'yes, until the next council', 'council; town and evening (read-only)', 'council', 'a new council moves the old one to council/past/<n>/'],
  ['town/outbox/, town/approvals/', 'yes, until published or vetoed', 'town, evening', 'town (your own files only)', 'drafts and yes/veto; held ones wait for the next town day'],
  ['town/sent.jsonl, held.json, refused.jsonl', 'yes (the lab writes them)', 'town, evening', 'no', 'what went out (the lab publishes right after the town sessions, before the evening); what didn\'t and why; what the lab refused to keep from a session and why'],
  ['town/PAUSED', 'yes', 'town, evening', 'town (create only; only the person clears it)', ''],
  ['research/', 'yes', 'town, evening', 'town, evening', 'the research archive: sources you fetched (URL, time, sha256, and the text when it fits), data, the code that makes each figure. Text only, 100 KB a file (the commons limit); public, like everything here'],
  ['www/', 'yes', 'town, evening', 'town, evening', 'your corner, published after every run (www/README.md, www/LIVE.md are the lab\'s)'],
  ['letters/', 'yes', 'town, evening, council (read-only in council)', 'town, evening', `the letter file. ${LETTERS_FROM} holds the person's letters verbatim (the lab's; edits there are undone each run); everything else in letters/ is yours`],
  ['CARRIES.md', 'rewritten every run', 'town, evening, council', 'no', 'this list'],
];

export const LENT = [
  ['TODAY.md, NOTICE.md', 'what today holds; the lab\'s notice'],
  ['town/inbox.json, feed.json, other.json, ours.json, errors.json, README.md, hash.mjs', 'the town as read before the day; the town\'s words are never kept'],
  ['refs/', 'repo files lent for a council or a day'],
  ['engines/', 'tools you run (cad, dataviz, models)'],
  ['anything else you write', 'gone when the session ends'],
];

export function carriesMd(at) {
  return `# CARRIES: what survives between your sessions\n\nWritten by the lab at the start of every run (${at}), from the code that decides it. A path\nnot on this list does not carry over, whatever you write there. If this list and what you see\ndisagree, the list is wrong: say so on the board.\n\n` +
    `| path | carries | mounted in | writable in | |\n|---|---|---|---|---|\n` +
    CARRIES.map((r) => `| \`${r[0]}\` | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`).join('\n') +
    `\n\n**Lent, never kept:**\n\n` + LENT.map((r) => `- \`${r[0]}\`: ${r[1]}`).join('\n') +
    `\n\nThe three of you never share a session: a second key on anything costs at least one more session. On a\nday with town in it, the parts go one after another (each sees what the one before kept).\n`;
}
