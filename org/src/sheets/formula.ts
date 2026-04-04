/**
 * Formula engine — tokenizer, recursive descent parser, AST evaluator.
 * No eval(). No Function constructor. Fully sandboxed.
 */

import type { CellValue, Cell } from "./types";
import { isCellError } from "./types";
import { parseCellRef, parseRange, expandRange, cellKey, extractRefs } from "./cellRef";

// ── Tokens ──

type TokenType =
  | "NUMBER" | "STRING" | "BOOLEAN" | "CELL_REF" | "RANGE_REF"
  | "FUNC" | "LPAREN" | "RPAREN" | "COMMA" | "COLON"
  | "PLUS" | "MINUS" | "STAR" | "SLASH" | "CARET" | "PERCENT"
  | "AMP" | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE" | "EOF";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const ch = s[i];

    // Whitespace
    if (ch === " " || ch === "\t") { i++; continue; }

    // String literal
    if (ch === '"') {
      let str = "";
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length) { str += s[i + 1]; i += 2; }
        else { str += s[i]; i++; }
      }
      i++; // skip closing "
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Number
    if ((ch >= "0" && ch <= "9") || (ch === "." && i + 1 < s.length && s[i + 1] >= "0" && s[i + 1] <= "9")) {
      let num = "";
      while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) { num += s[i]; i++; }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }

    // Identifiers (cell refs, function names, TRUE/FALSE)
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$") {
      let ident = "";
      while (i < s.length && (/[A-Za-z0-9_$]/.test(s[i]))) { ident += s[i]; i++; }
      const upper = ident.toUpperCase();

      if (upper === "TRUE" || upper === "FALSE") {
        tokens.push({ type: "BOOLEAN", value: upper });
      } else if (i < s.length && s[i] === "(") {
        tokens.push({ type: "FUNC", value: upper });
      } else if (i < s.length && s[i] === ":") {
        // Peek ahead for range
        const rest = s.slice(i + 1);
        const rm = rest.match(/^(\$?[A-Za-z]+\$?\d+)/);
        if (rm) {
          tokens.push({ type: "RANGE_REF", value: `${ident.toUpperCase()}:${rm[1].toUpperCase()}` });
          i += 1 + rm[1].length;
        } else {
          tokens.push({ type: "CELL_REF", value: upper });
        }
      } else {
        // Check if it's a cell ref pattern
        if (/^\$?[A-Z]+\$?\d+$/.test(upper.replace(/\$/g, ""))) {
          tokens.push({ type: "CELL_REF", value: upper });
        } else {
          // Treat as a name/function without parens → #NAME? at eval time
          tokens.push({ type: "CELL_REF", value: upper });
        }
      }
      continue;
    }

    // Operators and punctuation
    switch (ch) {
      case "(": tokens.push({ type: "LPAREN", value: ch }); break;
      case ")": tokens.push({ type: "RPAREN", value: ch }); break;
      case ",": tokens.push({ type: "COMMA", value: ch }); break;
      case "+": tokens.push({ type: "PLUS", value: ch }); break;
      case "-": tokens.push({ type: "MINUS", value: ch }); break;
      case "*": tokens.push({ type: "STAR", value: ch }); break;
      case "/": tokens.push({ type: "SLASH", value: ch }); break;
      case "^": tokens.push({ type: "CARET", value: ch }); break;
      case "%": tokens.push({ type: "PERCENT", value: ch }); break;
      case "&": tokens.push({ type: "AMP", value: ch }); break;
      case "=": tokens.push({ type: "EQ", value: ch }); break;
      case "<":
        if (s[i + 1] === "=") { tokens.push({ type: "LTE", value: "<=" }); i++; }
        else if (s[i + 1] === ">") { tokens.push({ type: "NEQ", value: "<>" }); i++; }
        else tokens.push({ type: "LT", value: ch });
        break;
      case ">":
        if (s[i + 1] === "=") { tokens.push({ type: "GTE", value: ">=" }); i++; }
        else tokens.push({ type: "GT", value: ch });
        break;
      default: i++; continue; // skip unknown chars
    }
    i++;
  }
  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

// ── AST Nodes ──

type ASTNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "cell"; ref: string }
  | { type: "range"; ref: string }
  | { type: "unary"; op: string; operand: ASTNode }
  | { type: "binary"; op: string; left: ASTNode; right: ASTNode }
  | { type: "call"; name: string; args: ASTNode[] }
  | { type: "percent"; operand: ASTNode };

// ── Parser (recursive descent) ──

function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  function peek(): Token { return tokens[pos] || { type: "EOF", value: "" }; }
  function advance(): Token { return tokens[pos++]; }
  function expect(type: TokenType): Token {
    const t = advance();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
    return t;
  }

  // expression → comparison
  function expression(): ASTNode { return comparison(); }

  // comparison → concat ((<|>|<=|>=|=|<>) concat)*
  function comparison(): ASTNode {
    let left = concat();
    while (["EQ", "NEQ", "LT", "GT", "LTE", "GTE"].includes(peek().type)) {
      const op = advance().value;
      left = { type: "binary", op, left, right: concat() };
    }
    return left;
  }

  // concat → addition (& addition)*
  function concat(): ASTNode {
    let left = addition();
    while (peek().type === "AMP") {
      advance();
      left = { type: "binary", op: "&", left, right: addition() };
    }
    return left;
  }

  // addition → multiplication ((+|-) multiplication)*
  function addition(): ASTNode {
    let left = multiplication();
    while (peek().type === "PLUS" || peek().type === "MINUS") {
      const op = advance().value;
      left = { type: "binary", op, left, right: multiplication() };
    }
    return left;
  }

  // multiplication → power ((*|/) power)*
  function multiplication(): ASTNode {
    let left = power();
    while (peek().type === "STAR" || peek().type === "SLASH") {
      const op = advance().value;
      left = { type: "binary", op, left, right: power() };
    }
    return left;
  }

  // power → unary (^ unary)*
  function power(): ASTNode {
    let left = unary();
    while (peek().type === "CARET") {
      advance();
      left = { type: "binary", op: "^", left, right: unary() };
    }
    return left;
  }

  // unary → (-) unary | postfix
  function unary(): ASTNode {
    if (peek().type === "MINUS") {
      advance();
      return { type: "unary", op: "-", operand: unary() };
    }
    if (peek().type === "PLUS") { advance(); return unary(); }
    return postfix();
  }

  // postfix → primary (%)?
  function postfix(): ASTNode {
    let node = primary();
    if (peek().type === "PERCENT") {
      advance();
      node = { type: "percent", operand: node };
    }
    return node;
  }

  // primary → NUMBER | STRING | BOOLEAN | CELL_REF | RANGE_REF | FUNC(...) | (expr)
  function primary(): ASTNode {
    const t = peek();

    if (t.type === "NUMBER") {
      advance();
      return { type: "number", value: parseFloat(t.value) };
    }
    if (t.type === "STRING") {
      advance();
      return { type: "string", value: t.value };
    }
    if (t.type === "BOOLEAN") {
      advance();
      return { type: "boolean", value: t.value === "TRUE" };
    }
    if (t.type === "RANGE_REF") {
      advance();
      return { type: "range", ref: t.value };
    }
    if (t.type === "FUNC") {
      const name = advance().value;
      expect("LPAREN");
      const args: ASTNode[] = [];
      if (peek().type !== "RPAREN") {
        args.push(expression());
        while (peek().type === "COMMA") {
          advance();
          args.push(expression());
        }
      }
      expect("RPAREN");
      return { type: "call", name, args };
    }
    if (t.type === "CELL_REF") {
      advance();
      return { type: "cell", ref: t.value.replace(/\$/g, "") };
    }
    if (t.type === "LPAREN") {
      advance();
      const node = expression();
      expect("RPAREN");
      return node;
    }

    advance(); // consume unknown
    return { type: "number", value: 0 };
  }

  const ast = expression();
  return ast;
}

// ── Evaluator ──

type CellGetter = (key: string) => CellValue;

function toNum(v: CellValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function toStr(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Resolve a range ref into an array of cell values */
function resolveRange(ref: string, getCell: CellGetter): CellValue[] {
  const range = parseRange(ref);
  if (!range) return [];
  return expandRange(range).map(getCell);
}

/** Resolve an AST node that might be a range or single value into values array */
function resolveArgs(node: ASTNode, getCell: CellGetter): CellValue[] {
  if (node.type === "range") return resolveRange(node.ref, getCell);
  const val = evalNode(node, getCell);
  return [val];
}

/** Get numeric values from args, flattening ranges */
function numericArgs(args: ASTNode[], getCell: CellGetter): number[] {
  const nums: number[] = [];
  for (const a of args) {
    for (const v of resolveArgs(a, getCell)) {
      if (typeof v === "number") nums.push(v);
      else if (typeof v === "boolean") nums.push(v ? 1 : 0);
      else if (typeof v === "string" && v !== "") {
        const n = parseFloat(v);
        if (!isNaN(n)) nums.push(n);
      }
    }
  }
  return nums;
}

function evalNode(node: ASTNode, getCell: CellGetter): CellValue {
  switch (node.type) {
    case "number": return node.value;
    case "string": return node.value;
    case "boolean": return node.value;
    case "percent": return toNum(evalNode(node.operand, getCell)) / 100;

    case "cell": {
      const ref = parseCellRef(node.ref);
      if (!ref) return "#REF!" as CellValue;
      return getCell(cellKey(ref.col, ref.row));
    }

    case "range": {
      // A bare range in expression context → return first cell
      const vals = resolveRange(node.ref, getCell);
      return vals.length > 0 ? vals[0] : null;
    }

    case "unary":
      if (node.op === "-") return -toNum(evalNode(node.operand, getCell));
      return evalNode(node.operand, getCell);

    case "binary": {
      if (node.op === "&") return toStr(evalNode(node.left, getCell)) + toStr(evalNode(node.right, getCell));
      const l = evalNode(node.left, getCell);
      const r = evalNode(node.right, getCell);
      if (isCellError(l)) return l;
      if (isCellError(r)) return r;
      const ln = toNum(l);
      const rn = toNum(r);
      switch (node.op) {
        case "+": return ln + rn;
        case "-": return ln - rn;
        case "*": return ln * rn;
        case "/": return rn === 0 ? "#DIV/0!" as CellValue : ln / rn;
        case "^": return Math.pow(ln, rn);
        case "=": return l === r;
        case "<>": return l !== r;
        case "<": return ln < rn;
        case ">": return ln > rn;
        case "<=": return ln <= rn;
        case ">=": return ln >= rn;
      }
      return "#VALUE!" as CellValue;
    }

    case "call":
      return evalFunc(node.name, node.args, getCell);
  }
}

// ── Built-in Functions ──

function evalFunc(name: string, args: ASTNode[], getCell: CellGetter): CellValue {
  switch (name) {
    // Math aggregates
    case "SUM": return numericArgs(args, getCell).reduce((a, b) => a + b, 0);
    case "AVERAGE": {
      const nums = numericArgs(args, getCell);
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : "#DIV/0!";
    }
    case "MIN": {
      const nums = numericArgs(args, getCell);
      return nums.length > 0 ? Math.min(...nums) : 0;
    }
    case "MAX": {
      const nums = numericArgs(args, getCell);
      return nums.length > 0 ? Math.max(...nums) : 0;
    }
    case "COUNT": {
      let count = 0;
      for (const a of args) for (const v of resolveArgs(a, getCell)) if (typeof v === "number") count++;
      return count;
    }
    case "COUNTA": {
      let count = 0;
      for (const a of args) for (const v of resolveArgs(a, getCell)) if (v !== null && v !== "") count++;
      return count;
    }
    case "MEDIAN": {
      const nums = numericArgs(args, getCell).sort((a, b) => a - b);
      if (nums.length === 0) return "#NUM!";
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }
    case "STDEV": {
      const nums = numericArgs(args, getCell);
      if (nums.length < 2) return "#DIV/0!";
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }

    // Math single
    case "ABS": return Math.abs(toNum(evalNode(args[0], getCell)));
    case "ROUND": {
      const val = toNum(evalNode(args[0], getCell));
      const digits = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(val * factor) / factor;
    }
    case "CEILING": {
      const val = toNum(evalNode(args[0], getCell));
      const sig = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 1;
      return sig === 0 ? 0 : Math.ceil(val / sig) * sig;
    }
    case "FLOOR": {
      const val = toNum(evalNode(args[0], getCell));
      const sig = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 1;
      return sig === 0 ? 0 : Math.floor(val / sig) * sig;
    }
    case "SQRT": {
      const val = toNum(evalNode(args[0], getCell));
      return val < 0 ? "#NUM!" : Math.sqrt(val);
    }
    case "LOG": {
      const val = toNum(evalNode(args[0], getCell));
      const base = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 10;
      return val <= 0 ? "#NUM!" : Math.log(val) / Math.log(base);
    }
    case "LN": {
      const val = toNum(evalNode(args[0], getCell));
      return val <= 0 ? "#NUM!" : Math.log(val);
    }
    case "MOD": return toNum(evalNode(args[0], getCell)) % toNum(evalNode(args[1], getCell));
    case "POWER": return Math.pow(toNum(evalNode(args[0], getCell)), toNum(evalNode(args[1], getCell)));
    case "INT": return Math.floor(toNum(evalNode(args[0], getCell)));
    case "SIGN": {
      const v = toNum(evalNode(args[0], getCell));
      return v > 0 ? 1 : v < 0 ? -1 : 0;
    }
    case "PI": return Math.PI;
    case "RAND": return Math.random();

    // Logic
    case "IF": {
      const cond = evalNode(args[0], getCell);
      const truthy = Boolean(cond) && cond !== 0 && cond !== "";
      return truthy
        ? (args.length > 1 ? evalNode(args[1], getCell) : true)
        : (args.length > 2 ? evalNode(args[2], getCell) : false);
    }
    case "AND": {
      for (const a of args) {
        const v = evalNode(a, getCell);
        if (!v || v === 0 || v === "") return false;
      }
      return true;
    }
    case "OR": {
      for (const a of args) {
        const v = evalNode(a, getCell);
        if (v && v !== 0 && v !== "") return true;
      }
      return false;
    }
    case "NOT": return !evalNode(args[0], getCell);
    case "IFERROR": {
      const val = evalNode(args[0], getCell);
      return isCellError(val) ? (args.length > 1 ? evalNode(args[1], getCell) : "") : val;
    }
    case "ISBLANK": {
      const val = evalNode(args[0], getCell);
      return val === null || val === "";
    }
    case "ISNUMBER": return typeof evalNode(args[0], getCell) === "number";

    // Text
    case "CONCATENATE": return args.map((a) => toStr(evalNode(a, getCell))).join("");
    case "LEFT": {
      const str = toStr(evalNode(args[0], getCell));
      const n = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 1;
      return str.slice(0, n);
    }
    case "RIGHT": {
      const str = toStr(evalNode(args[0], getCell));
      const n = args.length > 1 ? toNum(evalNode(args[1], getCell)) : 1;
      return str.slice(-n);
    }
    case "MID": {
      const str = toStr(evalNode(args[0], getCell));
      const start = toNum(evalNode(args[1], getCell)) - 1;
      const len = toNum(evalNode(args[2], getCell));
      return str.slice(start, start + len);
    }
    case "LEN": return toStr(evalNode(args[0], getCell)).length;
    case "TRIM": return toStr(evalNode(args[0], getCell)).trim();
    case "UPPER": return toStr(evalNode(args[0], getCell)).toUpperCase();
    case "LOWER": return toStr(evalNode(args[0], getCell)).toLowerCase();
    case "TEXT": {
      const val = toNum(evalNode(args[0], getCell));
      const fmt = toStr(evalNode(args[1], getCell));
      // Basic formatting
      if (fmt === "0.00%") return (val * 100).toFixed(2) + "%";
      if (fmt.includes(".")) {
        const dec = fmt.split(".")[1]?.replace(/[^0#]/g, "").length || 0;
        return val.toFixed(dec);
      }
      return val.toString();
    }
    case "SUBSTITUTE": {
      const text = toStr(evalNode(args[0], getCell));
      const old = toStr(evalNode(args[1], getCell));
      const rep = toStr(evalNode(args[2], getCell));
      return text.split(old).join(rep);
    }
    case "REPT": {
      const text = toStr(evalNode(args[0], getCell));
      const n = toNum(evalNode(args[1], getCell));
      return text.repeat(Math.max(0, Math.floor(n)));
    }

    // Lookup
    case "VLOOKUP": {
      const lookup = evalNode(args[0], getCell);
      if (args[1].type !== "range") return "#VALUE!";
      const range = parseRange(args[1].ref);
      if (!range) return "#REF!";
      const colIdx = toNum(evalNode(args[2], getCell)) - 1;
      const exact = args.length > 3 ? !evalNode(args[3], getCell) : false;

      const minRow = Math.min(range.start.row, range.end.row);
      const maxRow = Math.max(range.start.row, range.end.row);
      const searchCol = Math.min(range.start.col, range.end.col);
      const resultCol = searchCol + colIdx;

      for (let r = minRow; r <= maxRow; r++) {
        const cellVal = getCell(cellKey(searchCol, r));
        if (exact ? cellVal === lookup : toStr(cellVal) === toStr(lookup)) {
          return getCell(cellKey(resultCol, r));
        }
      }
      return "#N/A";
    }
    case "INDEX": {
      if (args[0].type !== "range") return "#VALUE!";
      const range = parseRange(args[0].ref);
      if (!range) return "#REF!";
      const rowIdx = toNum(evalNode(args[1], getCell)) - 1;
      const colIdx = args.length > 2 ? toNum(evalNode(args[2], getCell)) - 1 : 0;
      const r = Math.min(range.start.row, range.end.row) + rowIdx;
      const c = Math.min(range.start.col, range.end.col) + colIdx;
      return getCell(cellKey(c, r));
    }
    case "MATCH": {
      const lookup = evalNode(args[0], getCell);
      if (args[1].type !== "range") return "#VALUE!";
      const vals = resolveRange(args[1].ref, getCell);
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] === lookup || toStr(vals[i]) === toStr(lookup)) return i + 1;
      }
      return "#N/A";
    }

    // Date
    case "NOW": return Date.now();
    case "TODAY": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "DATE": {
      const y = toNum(evalNode(args[0], getCell));
      const m = toNum(evalNode(args[1], getCell)) - 1;
      const d = toNum(evalNode(args[2], getCell));
      return new Date(y, m, d).getTime();
    }
    case "YEAR": return new Date(toNum(evalNode(args[0], getCell))).getFullYear();
    case "MONTH": return new Date(toNum(evalNode(args[0], getCell))).getMonth() + 1;
    case "DAY": return new Date(toNum(evalNode(args[0], getCell))).getDate();

    // Financial
    case "PMT": {
      const rate = toNum(evalNode(args[0], getCell));
      const nper = toNum(evalNode(args[1], getCell));
      const pv = toNum(evalNode(args[2], getCell));
      if (rate === 0) return -pv / nper;
      return -(pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
    }

    default:
      return "#NAME?" as CellValue;
  }
}

// ── Public API ──

/**
 * Evaluate a formula string. If it starts with "=", parse and evaluate.
 * Otherwise return as a literal value (number, boolean, or string).
 */
export function evaluateFormula(
  raw: string,
  getCell: CellGetter,
): CellValue {
  if (!raw || raw.trim() === "") return null;

  const trimmed = raw.trim();

  // Not a formula — return literal
  if (!trimmed.startsWith("=")) {
    // Try number
    if (/^-?\d+\.?\d*$/.test(trimmed)) return parseFloat(trimmed);
    // Try boolean
    if (trimmed.toUpperCase() === "TRUE") return true;
    if (trimmed.toUpperCase() === "FALSE") return false;
    // String literal
    return trimmed;
  }

  // Formula: strip "=" and evaluate
  const expr = trimmed.slice(1);
  try {
    const tokens = tokenize(expr);
    const ast = parse(tokens);
    return evalNode(ast, getCell);
  } catch {
    return "#VALUE!" as CellValue;
  }
}

// ── Dependency Graph + Recalculation ──

/**
 * Build a dependency graph: for each cell, which cells does it depend on?
 */
export function buildDependencyGraph(
  cells: Record<string, Cell>,
): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const [key, cell] of Object.entries(cells)) {
    if (cell.raw.startsWith("=")) {
      deps.set(key, extractRefs(cell.raw.slice(1)));
    }
  }
  return deps;
}

/**
 * Topological sort for recalculation order.
 * Returns cell keys in evaluation order, or marks circular refs.
 */
export function recalcOrder(
  deps: Map<string, string[]>,
): { order: string[]; circular: Set<string> } {
  const order: string[] = [];
  const circular = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(key: string) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      circular.add(key);
      return;
    }
    visiting.add(key);
    for (const dep of deps.get(key) || []) {
      visit(dep);
    }
    visiting.delete(key);
    visited.add(key);
    if (deps.has(key)) order.push(key);
  }

  for (const key of deps.keys()) {
    visit(key);
  }
  return { order, circular };
}

/**
 * Recalculate all formula cells in correct order.
 * Mutates cells in-place.
 */
export function recalculate(cells: Record<string, Cell>): void {
  const deps = buildDependencyGraph(cells);
  const { order, circular } = recalcOrder(deps);

  // Getter that reads computed values
  const getCell = (key: string): CellValue => {
    const cell = cells[key];
    return cell ? cell.value : null;
  };

  for (const key of order) {
    const cell = cells[key];
    if (!cell) continue;
    if (circular.has(key)) {
      cell.value = "#CIRC!" as CellValue;
    } else {
      cell.value = evaluateFormula(cell.raw, getCell);
    }
  }
}
