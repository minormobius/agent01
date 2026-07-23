/* ─────────────────────────────────────────────────────────────────────
   conjectures — shared helpers (field colours, status labels, escaping)
   Loaded by both index.html and c.html. Depends on window.CONJECTURES.
   ───────────────────────────────────────────────────────────────────── */
(function (g) {
  // Map a raw `field` string (as authored in data.js) to a stable key + css var.
  const FIELD_RULES = [
    [/graph/i,                                 { key: 'graph',    css: '--f-graph',    label: 'Graph theory' }],
    [/combinator/i,                            { key: 'combin',   css: '--f-combin',   label: 'Combinatorics' }],
    // algebra/arithmetic BEFORE geometry, so "arithmetic geometry" isn't mis-read as geometry
    [/algebra|arithmetic|number field/i,       { key: 'algebra',  css: '--f-algebra',  label: 'Algebra & arithmetic geometry' }],
    [/geometr/i,                               { key: 'geometry', css: '--f-geometry', label: 'Geometry' }],
    [/comput|complex|theoretical|\bcs\b/i,     { key: 'tcs',      css: '--f-tcs',      label: 'Theoretical CS' }],
    [/group/i,                                 { key: 'group',    css: '--f-group',    label: 'Group theory' }],
    [/logic|set theory/i,                      { key: 'logic',    css: '--f-logic',    label: 'Logic & set theory' }],
    [/analysis|dynamic|pde|physic/i,           { key: 'analysis', css: '--f-analysis', label: 'Analysis & dynamics' }],
    [/number|additive|sequence|iteration/i,    { key: 'number',   css: '--f-number',   label: 'Number theory' }],
  ];
  function fieldMeta(field) {
    const f = String(field || '');
    for (const [re, meta] of FIELD_RULES) if (re.test(f)) return meta;
    return { key: 'other', css: '--f-other', label: f || 'Other' };
  }
  function fieldColor(field) { return `var(${fieldMeta(field).css})`; }

  const STATUS_LABEL = {
    open:     'open',
    mostly:   'mostly open',
    'mostly-open': 'mostly open',
    partial:  'partial',
  };
  function statusKey(s) {
    if (s === 'mostly-open') return 'mostly';
    if (s === 'partial') return 'partial';
    return 'open';
  }
  function statusLabel(s) { return STATUS_LABEL[s] || 'open'; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  g.CONJ = { fieldMeta, fieldColor, statusKey, statusLabel, esc };
})(window);
