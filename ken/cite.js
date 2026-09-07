/* ken/cite.js — numbers citations in document order and renders the reference
   list. Pages write <a class="cite" data-ref="key"></a> and leave an empty
   <ol id="reflist">; everything else happens here.

   The same rules are asserted offline by ken.selftest.mjs — a dangling key
   fails the build rather than rendering "[?]" to a reader. */
(function () {
  'use strict';
  const REFS = globalThis.KEN_REFS;
  if (!REFS) return;

  const order = [];
  const num = new Map();

  document.querySelectorAll('a.cite[data-ref]').forEach((el) => {
    const keys = el.dataset.ref.split(/[,\s]+/).filter(Boolean);
    const parts = keys.map((k) => {
      if (!REFS[k]) { el.classList.add('bad'); return '?'; }
      if (!num.has(k)) { order.push(k); num.set(k, order.length); }
      return String(num.get(k));
    });
    el.textContent = '[' + parts.join(', ') + ']';
    el.setAttribute('href', '#ref-' + keys[0]);
    const titles = keys.filter((k) => REFS[k]).map((k) => `${REFS[k].a} (${REFS[k].y})`);
    if (titles.length) el.setAttribute('title', titles.join('; '));
  });

  const list = document.getElementById('reflist');
  if (!list) return;
  const host = (u) => u.replace(/^https:\/\//, '').split('/')[0]
    .replace('doi.org', 'doi').replace('arxiv.org', 'arXiv').replace('openlibrary.org', 'Open Library');

  list.innerHTML = order.map((k, i) => {
    const r = REFS[k];
    const note = r.n ? `<span class="rn-note">${r.n}</span>` : '';
    // A bibliography that cannot be clicked is decoration. Where the entry
    // resolved against a registry it links there; where it did not, it says so
    // rather than linking somewhere approximate.
    const link = r.u
      ? ` <a class="rlink" href="${r.u}" rel="noopener">${host(r.u)}</a>`
      : ' <span class="rnolink" title="no registry record found for this entry">unlinked</span>';
    return `<li id="ref-${k}"><span class="rn">[${i + 1}]</span> ${r.a} (${r.y}). ` +
           `<span class="rt">${r.t}.</span> ${r.v}.${link}${note}</li>`;
  }).join('');

  const linked = order.filter((k) => REFS[k].u).length;
  const cov = document.getElementById('refcoverage');
  if (cov) cov.textContent = `${linked} of ${order.length} linked to a registry record`;

  const count = document.getElementById('refcount');
  if (count) count.textContent = String(order.length);
})();
