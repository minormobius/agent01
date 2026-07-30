//! MorphoHDL-lite: the source language.
//!
//! A cell is a rewrite rule. Calling one replaces a single node with a set of
//! subcells wired to each other and to the parent's input and output buses.
//! Bus widths are never declared — they are inferred at instantiation, which is
//! what makes a cell size-agnostic and lets the same three lines describe a
//! 4-bit and a 4096-bit structure.
//!
//! Recursion is stopped by *failure*, not by a conditional. `SPLIT` on a
//! one-wire bus fails; an out-of-bounds index fails; a gate instantiated on an
//! empty bus fails. When a cell body fails, the engine unwinds to that cell's
//! `fallback` — either another cell with the same signature, or `%N`, meaning
//! "pass positional argument N straight through". That is the language's only
//! control flow.
//!
//! Syntax, by example:
//!
//! ```text
//! gate NOT 1
//! gate XOR 2
//!
//! cell triangle(x) fallback %0 {
//!     y = XOR(x[1:], x[:-1])   # pair adjacent wires: one row shorter
//!     z = NOT(y)
//!     return triangle(z)       # tail recursion — grows row by row
//! }
//!
//! grow triangle(32)            # entry cell and its input bus widths
//! ```
//!
//! Deliberately absent, and why: there is no boolean evaluation, no constant
//! folding and no dead-code elimination. This crate grows *topology*. Gates are
//! opaque nodes of a given arity, so `gate` declarations carry no truth table —
//! writing one here would be decoration for logic that is never run. See the
//! README for what that rules out.

use std::collections::HashMap;
use std::fmt;

/// Built-in bus operations. Everything else is either a gate or a cell call.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Builtin {
    /// `SPLIT(x) -> lo, hi`. Fails when `len(x) < 2`. Odd widths put the middle
    /// wire in the low half, consistently, so odd-width structures stay legal.
    Split,
    /// `CAT(a, b, ...) -> y`. Concatenation, least-significant first.
    Cat,
    /// `LSLICE(x, ref) -> slice, rest`. Takes `len(ref)` wires off the low end.
    /// Fails when `x` is narrower than `ref`.
    Lslice,
    /// `HSLICE(x, ref) -> rest, slice`. The same from the high end.
    Hslice,
    /// `REPEAT(v, ref) -> y`. `len(ref)` copies of a one-wire bus.
    Repeat,
}

impl Builtin {
    pub fn from_name(name: &str) -> Option<Builtin> {
        Some(match name {
            "SPLIT" => Builtin::Split,
            "CAT" => Builtin::Cat,
            "LSLICE" => Builtin::Lslice,
            "HSLICE" => Builtin::Hslice,
            "REPEAT" => Builtin::Repeat,
            _ => return None,
        })
    }
}

/// A Python-style slice, resolved against a concrete width at evaluation time.
#[derive(Clone, Copy, Debug)]
pub struct SliceSpec {
    pub start: Option<i32>,
    pub end: Option<i32>,
    /// Only `1` and `-1` are meaningful; `-1` reverses bus order.
    pub step: i32,
    /// `x[3]` rather than `x[3:4]` — a single index, which fails out of bounds
    /// instead of yielding an empty bus. This is how a cell says "stop here".
    pub single: bool,
}

#[derive(Clone, Debug)]
pub enum Expr {
    /// A bus-valued name: a cell parameter or an earlier assignment.
    Var(String),
    /// `ZERO` / `ONE` — one-wire constant buses.
    Const(bool),
    Slice(Box<Expr>, SliceSpec),
    /// A gate, a builtin, or another cell. Which one is resolved at link time.
    Call(String, Vec<Expr>),
}

#[derive(Clone, Debug)]
pub struct Stmt {
    pub targets: Vec<String>,
    pub expr: Expr,
    pub line: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fallback {
    /// No fallback: failure propagates to the caller.
    None,
    /// `%N` — resolve to positional argument N, unchanged.
    Arg(usize),
    /// Another cell, by index into `Program::cells`.
    Cell(usize),
}

#[derive(Clone, Debug)]
pub struct CellDef {
    pub name: String,
    pub params: Vec<String>,
    pub fallback: Fallback,
    pub body: Vec<Stmt>,
    pub ret: Vec<Expr>,
    /// Line of the `return`, so a bad name in it can be pointed at too.
    pub ret_line: u32,
}

#[derive(Clone, Debug)]
pub struct GateDef {
    pub name: String,
    pub arity: usize,
}

#[derive(Clone, Debug)]
pub struct Program {
    pub gates: Vec<GateDef>,
    pub cells: Vec<CellDef>,
    /// Entry cell index and the input bus widths to grow it at.
    pub entry: usize,
    pub entry_widths: Vec<u32>,
    /// Name lookups, built once at parse time.
    pub cell_index: HashMap<String, usize>,
    pub gate_index: HashMap<String, usize>,
}

#[derive(Debug)]
pub struct ParseError {
    pub line: u32,
    pub msg: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Whole-program checks (a name defined twice, an unknown fallback) have
        // no single line to blame; saying "line 0" would just look broken.
        if self.line == 0 {
            write!(f, "{}", self.msg)
        } else {
            write!(f, "line {}: {}", self.line, self.msg)
        }
    }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Ident(String),
    Int(i32),
    Sym(char),
    /// Statement terminator. Blank lines and comments never emit one, so a
    /// statement is exactly one non-empty source line.
    Newline,
    Eof,
}

struct Lexer {
    toks: Vec<(Tok, u32)>,
    pos: usize,
}

fn tokenize(src: &str) -> Result<Vec<(Tok, u32)>, ParseError> {
    let mut out: Vec<(Tok, u32)> = Vec::new();
    for (i, raw) in src.lines().enumerate() {
        let line = i as u32 + 1;
        let text = match raw.find('#') {
            Some(p) => &raw[..p],
            None => raw,
        };
        if text.trim().is_empty() {
            continue;
        }
        let bytes: Vec<char> = text.chars().collect();
        let mut j = 0usize;
        let start_len = out.len();
        while j < bytes.len() {
            let c = bytes[j];
            if c.is_whitespace() {
                j += 1;
            } else if c.is_ascii_alphabetic() || c == '_' {
                let s = j;
                while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == '_') {
                    j += 1;
                }
                out.push((Tok::Ident(bytes[s..j].iter().collect()), line));
            } else if c.is_ascii_digit() {
                let s = j;
                while j < bytes.len() && bytes[j].is_ascii_digit() {
                    j += 1;
                }
                let text: String = bytes[s..j].iter().collect();
                let v = text.parse::<i32>().map_err(|_| ParseError {
                    line,
                    msg: format!("number out of range: {text}"),
                })?;
                out.push((Tok::Int(v), line));
            } else if "(),={}[]:%-".contains(c) {
                out.push((Tok::Sym(c), line));
                j += 1;
            } else {
                return Err(ParseError {
                    line,
                    msg: format!("unexpected character {c:?}"),
                });
            }
        }
        if out.len() > start_len {
            out.push((Tok::Newline, line));
        }
    }
    out.push((Tok::Eof, src.lines().count() as u32 + 1));
    Ok(out)
}

impl Lexer {
    fn peek(&self) -> &Tok {
        &self.toks[self.pos].0
    }
    fn line(&self) -> u32 {
        self.toks[self.pos].1
    }
    fn next(&mut self) -> Tok {
        let t = self.toks[self.pos].0.clone();
        if self.pos + 1 < self.toks.len() {
            self.pos += 1;
        }
        t
    }
    fn err<T>(&self, msg: impl Into<String>) -> Result<T, ParseError> {
        Err(ParseError {
            line: self.line(),
            msg: msg.into(),
        })
    }
    fn eat_sym(&mut self, c: char) -> bool {
        if *self.peek() == Tok::Sym(c) {
            self.next();
            true
        } else {
            false
        }
    }
    fn expect_sym(&mut self, c: char) -> Result<(), ParseError> {
        if self.eat_sym(c) {
            Ok(())
        } else {
            self.err(format!("expected {c:?}, found {:?}", self.peek()))
        }
    }
    fn expect_ident(&mut self) -> Result<String, ParseError> {
        match self.next() {
            Tok::Ident(s) => Ok(s),
            other => Err(ParseError {
                line: self.line(),
                msg: format!("expected a name, found {other:?}"),
            }),
        }
    }
    fn skip_newlines(&mut self) {
        while *self.peek() == Tok::Newline {
            self.next();
        }
    }
    /// A signed integer, for slice bounds like `x[:-1]`.
    fn signed_int(&mut self) -> Result<i32, ParseError> {
        let neg = self.eat_sym('-');
        match self.next() {
            Tok::Int(v) => Ok(if neg { -v } else { v }),
            other => Err(ParseError {
                line: self.line(),
                msg: format!("expected an integer, found {other:?}"),
            }),
        }
    }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Parse a MorphoHDL-lite program.
///
/// Cell bodies are parsed before names are resolved, so cells may refer to each
/// other in any order — including to themselves, which is the whole point.
pub fn parse(src: &str) -> Result<Program, ParseError> {
    let mut lx = Lexer {
        toks: tokenize(src)?,
        pos: 0,
    };

    let mut gates: Vec<GateDef> = Vec::new();
    let mut cells: Vec<CellDef> = Vec::new();
    // Fallback targets are cell names until every cell is known.
    let mut pending_fallback: Vec<Option<String>> = Vec::new();
    let mut entry: Option<(String, Vec<u32>, u32)> = None;

    loop {
        lx.skip_newlines();
        if *lx.peek() == Tok::Eof {
            break;
        }
        let kw = lx.expect_ident()?;
        match kw.as_str() {
            "gate" => {
                let name = lx.expect_ident()?;
                let arity = match lx.next() {
                    Tok::Int(v) if v >= 1 && v <= 8 => v as usize,
                    other => {
                        return lx.err(format!("gate arity must be 1..=8, found {other:?}"));
                    }
                };
                if Builtin::from_name(&name).is_some() {
                    return lx.err(format!("{name} is a builtin and cannot be a gate"));
                }
                gates.push(GateDef { name, arity });
            }
            "cell" => {
                let (def, fb) = parse_cell(&mut lx)?;
                cells.push(def);
                pending_fallback.push(fb);
            }
            "grow" => {
                let name = lx.expect_ident()?;
                lx.expect_sym('(')?;
                let mut widths = Vec::new();
                if !lx.eat_sym(')') {
                    loop {
                        match lx.next() {
                            Tok::Int(v) if v >= 1 => widths.push(v as u32),
                            other => {
                                return lx.err(format!("bus width must be >= 1, found {other:?}"))
                            }
                        }
                        if !lx.eat_sym(',') {
                            break;
                        }
                    }
                    lx.expect_sym(')')?;
                }
                let line = lx.line();
                if entry.is_some() {
                    return lx.err("a program declares exactly one `grow`");
                }
                entry = Some((name, widths, line));
            }
            other => return lx.err(format!("expected `gate`, `cell` or `grow`, found `{other}`")),
        }
    }

    let mut cell_index = HashMap::new();
    for (i, c) in cells.iter().enumerate() {
        if cell_index.insert(c.name.clone(), i).is_some() {
            return Err(ParseError {
                line: 0,
                msg: format!("cell `{}` is defined twice", c.name),
            });
        }
    }
    let mut gate_index = HashMap::new();
    for (i, g) in gates.iter().enumerate() {
        if gate_index.insert(g.name.clone(), i).is_some() {
            return Err(ParseError {
                line: 0,
                msg: format!("gate `{}` is declared twice", g.name),
            });
        }
        if cell_index.contains_key(&g.name) {
            return Err(ParseError {
                line: 0,
                msg: format!("`{}` is both a gate and a cell", g.name),
            });
        }
    }

    for (i, fb) in pending_fallback.into_iter().enumerate() {
        if let Some(name) = fb {
            match cell_index.get(&name) {
                Some(&idx) => cells[i].fallback = Fallback::Cell(idx),
                None => {
                    return Err(ParseError {
                        line: 0,
                        msg: format!("cell `{}`: unknown fallback `{name}`", cells[i].name),
                    })
                }
            }
        }
    }

    let (entry_name, entry_widths, entry_line) = entry.ok_or(ParseError {
        line: 0,
        msg: "no `grow` declaration: nothing to grow".into(),
    })?;
    let entry = *cell_index.get(&entry_name).ok_or(ParseError {
        line: entry_line,
        msg: format!("unknown entry cell `{entry_name}`"),
    })?;
    if cells[entry].params.len() != entry_widths.len() {
        return Err(ParseError {
            line: entry_line,
            msg: format!(
                "`{entry_name}` takes {} bus(es), `grow` supplies {}",
                cells[entry].params.len(),
                entry_widths.len()
            ),
        });
    }

    // Every name used in a body must resolve to a gate, a builtin, or a cell,
    // and gate calls must match their declared arity. Catching this here means
    // the growth engine never has to deal with an unknown name.
    for c in &cells {
        let check = |e: &Expr| -> Result<(), ParseError> { check_names(e, &gate_index, &gates, &cell_index, &c.name) };
        for s in &c.body {
            check(&s.expr).map_err(|mut e| {
                e.line = s.line;
                e
            })?;
        }
        for r in &c.ret {
            check(r).map_err(|mut e| {
                e.line = c.ret_line;
                e
            })?;
        }
    }

    Ok(Program {
        gates,
        cells,
        entry,
        entry_widths,
        cell_index,
        gate_index,
    })
}

fn check_names(
    e: &Expr,
    gate_index: &HashMap<String, usize>,
    gates: &[GateDef],
    cell_index: &HashMap<String, usize>,
    in_cell: &str,
) -> Result<(), ParseError> {
    match e {
        Expr::Var(_) | Expr::Const(_) => Ok(()),
        Expr::Slice(inner, _) => check_names(inner, gate_index, gates, cell_index, in_cell),
        Expr::Call(name, args) => {
            for a in args {
                check_names(a, gate_index, gates, cell_index, in_cell)?;
            }
            if let Some(b) = Builtin::from_name(name) {
                let want = match b {
                    Builtin::Split => 1,
                    Builtin::Cat => return Ok(()), // variadic, >= 1
                    Builtin::Lslice | Builtin::Hslice | Builtin::Repeat => 2,
                };
                if args.len() != want {
                    return Err(ParseError {
                        line: 0,
                        msg: format!("in cell `{in_cell}`: {name} takes {want} argument(s), got {}", args.len()),
                    });
                }
                if b == Builtin::Cat && args.is_empty() {
                    return Err(ParseError {
                        line: 0,
                        msg: format!("in cell `{in_cell}`: CAT needs at least one bus"),
                    });
                }
                return Ok(());
            }
            if let Some(&gi) = gate_index.get(name) {
                if args.len() != gates[gi].arity {
                    return Err(ParseError {
                        line: 0,
                        msg: format!(
                            "in cell `{in_cell}`: gate {name} has arity {}, called with {}",
                            gates[gi].arity,
                            args.len()
                        ),
                    });
                }
                return Ok(());
            }
            if cell_index.contains_key(name) {
                return Ok(());
            }
            Err(ParseError {
                line: 0,
                msg: format!("in cell `{in_cell}`: unknown gate or cell `{name}`"),
            })
        }
    }
}

/// `cell name(a, b) [fallback %0 | fallback other] { ... }`
fn parse_cell(lx: &mut Lexer) -> Result<(CellDef, Option<String>), ParseError> {
    let name = lx.expect_ident()?;
    lx.expect_sym('(')?;
    let mut params = Vec::new();
    if !lx.eat_sym(')') {
        loop {
            params.push(lx.expect_ident()?);
            if !lx.eat_sym(',') {
                break;
            }
        }
        lx.expect_sym(')')?;
    }

    let mut fallback = Fallback::None;
    let mut fallback_name = None;
    if let Tok::Ident(w) = lx.peek().clone() {
        if w == "fallback" {
            lx.next();
            if lx.eat_sym('%') {
                let n = match lx.next() {
                    Tok::Int(v) if v >= 0 => v as usize,
                    other => return lx.err(format!("expected an argument index, found {other:?}")),
                };
                if n >= params.len() {
                    return lx.err(format!(
                        "fallback %{n} but `{name}` only takes {} argument(s)",
                        params.len()
                    ));
                }
                fallback = Fallback::Arg(n);
            } else {
                fallback_name = Some(lx.expect_ident()?);
            }
        }
    }

    lx.expect_sym('{')?;
    let mut body = Vec::new();
    let mut ret = Vec::new();
    let mut ret_line = 0u32;
    let mut seen_return = false;
    loop {
        lx.skip_newlines();
        if lx.eat_sym('}') {
            break;
        }
        if *lx.peek() == Tok::Eof {
            return lx.err(format!("cell `{name}` is missing its closing `}}`"));
        }
        if seen_return {
            return lx.err(format!("cell `{name}`: `return` must be the last statement"));
        }
        let line = lx.line();

        if let Tok::Ident(w) = lx.peek().clone() {
            if w == "return" {
                lx.next();
                ret_line = line;
                loop {
                    ret.push(parse_expr(lx)?);
                    if !lx.eat_sym(',') {
                        break;
                    }
                }
                seen_return = true;
                continue;
            }
        }

        // `a, b = expr`
        let mut targets = vec![lx.expect_ident()?];
        while lx.eat_sym(',') {
            targets.push(lx.expect_ident()?);
        }
        lx.expect_sym('=')?;
        let expr = parse_expr(lx)?;
        body.push(Stmt {
            targets,
            expr,
            line,
        });
    }

    if ret.is_empty() {
        return lx.err(format!("cell `{name}` never returns a bus"));
    }

    Ok((
        CellDef {
            name,
            params,
            fallback,
            body,
            ret,
            ret_line,
        },
        fallback_name,
    ))
}

fn parse_expr(lx: &mut Lexer) -> Result<Expr, ParseError> {
    let mut e = match lx.next() {
        Tok::Ident(name) => {
            if *lx.peek() == Tok::Sym('(') {
                lx.next();
                let mut args = Vec::new();
                if !lx.eat_sym(')') {
                    loop {
                        args.push(parse_expr(lx)?);
                        if !lx.eat_sym(',') {
                            break;
                        }
                    }
                    lx.expect_sym(')')?;
                }
                Expr::Call(name, args)
            } else {
                match name.as_str() {
                    "ZERO" => Expr::Const(false),
                    "ONE" => Expr::Const(true),
                    _ => Expr::Var(name),
                }
            }
        }
        other => {
            return Err(ParseError {
                line: lx.line(),
                msg: format!("expected a bus expression, found {other:?}"),
            })
        }
    };

    // Slice suffixes chain: x[1:][::-1]
    while *lx.peek() == Tok::Sym('[') {
        lx.next();
        e = Expr::Slice(Box::new(e), parse_slice(lx)?);
    }
    Ok(e)
}

fn parse_slice(lx: &mut Lexer) -> Result<SliceSpec, ParseError> {
    let mut spec = SliceSpec {
        start: None,
        end: None,
        step: 1,
        single: false,
    };
    // `[:...]` — no start.
    if !lx.eat_sym(':') {
        spec.start = Some(lx.signed_int()?);
        if lx.eat_sym(']') {
            // `x[i]` — a single wire, which fails rather than clamps.
            spec.single = true;
            return Ok(spec);
        }
        lx.expect_sym(':')?;
    }
    if lx.eat_sym(']') {
        return Ok(spec);
    }
    if !lx.eat_sym(':') {
        spec.end = Some(lx.signed_int()?);
        if lx.eat_sym(']') {
            return Ok(spec);
        }
        lx.expect_sym(':')?;
    }
    // Step. Only ±1 is meaningful for a bus.
    let step = lx.signed_int()?;
    if step != 1 && step != -1 {
        return lx.err(format!("slice step must be 1 or -1, found {step}"));
    }
    spec.step = step;
    lx.expect_sym(']')?;
    Ok(spec)
}

/// Resolve a slice against a concrete width, Python-style.
///
/// Returns the indices to keep, or `None` when the slice fails — which is a
/// signal to unwind to the cell's fallback, not an error to report.
pub fn resolve_slice(spec: &SliceSpec, len: usize) -> Option<Vec<usize>> {
    let n = len as i32;
    if spec.single {
        let i = spec.start.unwrap_or(0);
        let i = if i < 0 { i + n } else { i };
        if i < 0 || i >= n {
            return None; // out of bounds: stop the recursion
        }
        return Some(vec![i as usize]);
    }
    let clamp = |v: i32| -> i32 {
        let v = if v < 0 { v + n } else { v };
        v.clamp(0, n)
    };
    let (start, end) = (
        clamp(spec.start.unwrap_or(0)),
        clamp(spec.end.unwrap_or(n)),
    );
    let mut idx: Vec<usize> = if start < end {
        (start..end).map(|i| i as usize).collect()
    } else {
        Vec::new()
    };
    if spec.step == -1 {
        idx.reverse();
    }
    Some(idx)
}
