// journal.mjs — Jev's own decision history, handed back to him.
//
// In the dungeon the same gap had the same shape: he could see the room he
// was in and not the rooms he had already tried, so he walked into dead ends
// and gave up in them. Here he has been deciding a position every few
// seconds with no idea what he decided last time, how long he has held it,
// or whether it has made or lost anything since.
//
// The last column is the one he has never had: what the position has done
// SINCE it was taken. That is real feedback rather than more description —
// and it is also the reason to be careful, because feedback on your own
// recent P&L is exactly what invites chasing it. So this is measured against
// the version without it rather than assumed to help.

export const WINDOW = 8;

const bp = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}bp`;

/**
 * @param {object} book   the paper book, for history and the current position
 * @param {number} nowPx  the current mid, to mark each past decision against
 */
export function journalDoc(book, nowPx, { window = WINDOW } = {}) {
  const h = book.history;
  if (!h.length || !(nowPx > 0)) return '';
  const rows = h.slice(-window);

  const lines = rows.map((r, k) => {
    const ago = h.length - (h.length - rows.length) - k - 1;
    const moveBps = (nowPx - r.px) / r.px * 1e4;
    // What the position taken THEN has earned on the move since then. Signed
    // by the position, so a short in a falling market reads positive.
    const earned = moveBps * r.pos;
    const when = ago === 0 ? 'just now' : `${ago} decision${ago === 1 ? '' : 's'} ago`;
    return `${when.padEnd(18)} went ${(r.pos === 0 ? 'flat' : `${r.pos > 0 ? '+' : ''}${r.pos.toFixed(2)}x`).padStart(7)}` +
      `  price has moved ${bp(moveBps).padStart(9)} since  →  that position is ${bp(earned).padStart(9)}` +
      `${r.blocked ? '   (held, did not act)' : ''}`;
  });

  // How long the current position has stood, in decisions.
  let held = 0;
  for (let i = h.length - 1; i >= 0; i--) { if (h[i].pos !== book.jev.pos) break; held++; }
  const flips = rows.slice(1).filter((r, i) => Math.sign(r.pos) !== Math.sign(rows[i].pos)).length;

  return [
    'YOUR OWN RECENT DECISIONS. You have made these; nobody else has.',
    ...lines,
    `currently ${book.jev.pos === 0 ? 'flat' : `${book.jev.pos > 0 ? 'long' : 'short'} ${Math.abs(book.jev.pos).toFixed(2)}x`}` +
      `, unchanged for ${held} decision${held === 1 ? '' : 's'}; ${flips} side change${flips === 1 ? '' : 's'} in the last ${rows.length}.`,
    'Changing position costs money every time. A reading that agrees with what',
    'you already hold is a reason to leave it alone, not a reason to trade.',
  ].join('\n');
}
