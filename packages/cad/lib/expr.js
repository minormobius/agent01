// expr.js — the tree's expression language, in JavaScript, for the places
// the engine never sees: assembly placements (`at`, `rotate`), assembly
// `params` and `derived`, and component parameter overrides, evaluated per
// frame as a function of time.
//
// This is a line-for-line mirror of engine/src/expr.rs: numbers, parameters,
// + - * / ^, unary minus, parentheses, the same fixed set of functions, `pi`
// and `e`. Same precedence (`-t^2` is `-(t^2)`, `2^3^2` is `2^(3^2)`), same
// error messages, same rule that a result must be finite. `deg(x)` turns
// DEGREES INTO RADIANS (for sin/cos), `rad2deg(x)` the other way — as in the
// engine. assembly.selftest.mjs evaluates a corpus through both and fails on
// the first disagreement, so the two cannot drift silently. Extend the
// function table in the Rust first, then here.

const NUM = /[0-9]/, DOT = '.';
const ALPHA = /[\p{L}_]/u, ALNUM = /[\p{L}\p{N}_.]/u;

function lex(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (NUM.test(c) || (c === DOT && i + 1 < s.length && NUM.test(s[i + 1]))) {
      const st = i;
      while (i < s.length && (NUM.test(s[i]) || s[i] === DOT)) i++;
      if (i < s.length && (s[i] === 'e' || s[i] === 'E')) {
        const save = i; i++;
        if (i < s.length && (s[i] === '+' || s[i] === '-')) i++;
        if (i < s.length && NUM.test(s[i])) { while (i < s.length && NUM.test(s[i])) i++; } else i = save;
      }
      const t = s.slice(st, i); const n = Number(t);
      if (!Number.isFinite(n) || (t.match(/\./g) || []).length > 1) throw new Error(`bad number \`${t}\``);
      out.push({ k: 'num', v: n });
    } else if (ALPHA.test(c)) {
      const st = i; while (i < s.length && ALNUM.test(s[i])) i++;
      out.push({ k: 'id', v: s.slice(st, i) });
    } else if ('+-*/^'.includes(c)) { out.push({ k: 'op', v: c }); i++; }
    else if (c === '(') { out.push({ k: '(' }); i++; }
    else if (c === ')') { out.push({ k: ')' }); i++; }
    else if (c === ',') { out.push({ k: ',' }); i++; }
    else throw new Error(`unexpected \`${c}\` in expression \`${s}\``);
  }
  return out;
}

const one = (name, a, f) => { if (a.length === 1) return f(a[0]); throw new Error(`\`${name}\` takes 1 argument`); };
const FN = {
  sin: (n, a) => one(n, a, Math.sin), cos: (n, a) => one(n, a, Math.cos), tan: (n, a) => one(n, a, Math.tan),
  asin: (n, a) => one(n, a, Math.asin), acos: (n, a) => one(n, a, Math.acos), atan: (n, a) => one(n, a, Math.atan),
  sqrt: (n, a) => one(n, a, Math.sqrt), abs: (n, a) => one(n, a, Math.abs), floor: (n, a) => one(n, a, Math.floor), ceil: (n, a) => one(n, a, Math.ceil),
  round: (n, a) => one(n, a, (x) => Math.sign(x) * Math.round(Math.abs(x))), // Rust rounds half away from zero
  deg: (n, a) => one(n, a, (x) => (x * Math.PI) / 180),      // deg(30) → radians, for sin/cos
  rad2deg: (n, a) => one(n, a, (x) => (x * 180) / Math.PI),
  atan2: (n, a) => { if (a.length === 2) return Math.atan2(a[0], a[1]); throw new Error('`atan2` takes 2'); },
  min: (n, a) => { if (!a.length) throw new Error('`min` needs arguments'); return a.reduce((m, x) => Math.min(m, x), Infinity); },
  max: (n, a) => { if (!a.length) throw new Error('`max` needs arguments'); return a.reduce((m, x) => Math.max(m, x), -Infinity); },
};

function parse(t, env) {
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const isOp = (c) => peek()?.k === 'op' && peek().v === c;
  function expr() { let v = term(); while (isOp('+') || isOp('-')) { const c = next().v; const r = term(); v = c === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (isOp('*') || isOp('/')) { const c = next().v; const r = unary(); v = c === '*' ? v * r : v / r; } return v; }
  function unary() { if (isOp('-')) { next(); return -unary(); } if (isOp('+')) { next(); return unary(); } return pow(); }
  function pow() { const base = atom(); if (isOp('^')) { next(); return base ** unary(); } return base; }
  function atom() {
    const tok = next();
    if (!tok) throw new Error('unexpected token None');
    if (tok.k === 'num') return tok.v;
    if (tok.k === '(') { const v = expr(); const c = next(); if (c?.k !== ')') throw new Error('expected `)`'); return v; }
    if (tok.k === 'id') {
      const name = tok.v;
      if (peek()?.k === '(') {
        next(); const args = [];
        if (peek()?.k === ')') next();
        else for (;;) { args.push(expr()); const c = next(); if (c?.k === ',') continue; if (c?.k === ')') break; throw new Error(`bad argument list for \`${name}\``); }
        const f = FN[name]; if (!f) throw new Error(`unknown function \`${name}\``);
        return f(name, args);
      }
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      if (Object.prototype.hasOwnProperty.call(env, name) && typeof env[name] === 'number') return env[name];
      throw new Error(`unknown parameter \`${name}\``);
    }
    throw new Error(`unexpected token ${tok.k === 'op' ? `Op('${tok.v}')` : tok.k === '(' ? 'LParen' : tok.k === ')' ? 'RParen' : 'Comma'}`);
  }
  const v = expr();
  if (i !== t.length) throw new Error('trailing input');
  return v;
}

const cache = new Map();
/// Evaluate `src` against `env` (a plain object of numbers). Whitespace-tolerant; errors name the problem.
export function evaluate(src, env = {}) {
  let t = cache.get(src);
  if (!t) { t = lex(src); if (cache.size > 4096) cache.clear(); cache.set(src, t); }
  if (!t.length) throw new Error('empty expression');
  let v;
  try { v = parse(t, env); } catch (e) { throw new Error(e.message === 'trailing input' ? `trailing input in \`${src}\`` : e.message); }
  if (!Number.isFinite(v)) throw new Error(`\`${src}\` is not finite`);
  return v;
}

/// A number stays a number; a string is an expression. Anything else is an error.
export function num(v, env, what = 'value') {
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${what} is not finite`); return v; }
  if (typeof v === 'string') return evaluate(v, env);
  throw new Error(`${what} must be a number or expression`);
}

/// Resolve `params` in dependency order, any order in the document: a
/// parameter may reference an earlier or a later one; iteration continues
/// until a pass makes no progress, and the last error names the culprit.
export function resolveParams(raw, base = {}) {
  const env = { ...base }; let pending = [];
  for (const [k, v] of Object.entries(raw || {})) {
    if (typeof v === 'number') env[k] = v;
    else if (typeof v === 'string') pending.push([k, v]);
    else throw new Error(`param \`${k}\` must be a number or expression`);
  }
  while (pending.length) {
    const before = pending.length, still = []; let lastErr = '';
    for (const [k, s] of pending) { try { env[k] = evaluate(s, env); } catch (e) { lastErr = `param \`${k}\`: ${e.message}`; still.push([k, s]); } }
    pending = still;
    if (pending.length === before) throw new Error(lastErr);
  }
  return env;
}
