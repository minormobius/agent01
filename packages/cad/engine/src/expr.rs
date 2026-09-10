//! The expression language. Numbers, parameters, + - * / ^, unary minus,
//! parentheses, and a fixed set of functions. No side effects, no strings.
//! `"depth": "t"` is what makes a tree parametric; this is all of it.

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Ident(String),
    Op(char),
    LParen,
    RParen,
    Comma,
}

fn lex(s: &str) -> Result<Vec<Tok>, String> {
    let cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < cs.len() {
        let c = cs[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || (c == '.' && i + 1 < cs.len() && cs[i + 1].is_ascii_digit()) {
            let st = i;
            while i < cs.len() && (cs[i].is_ascii_digit() || cs[i] == '.') {
                i += 1;
            }
            if i < cs.len() && (cs[i] == 'e' || cs[i] == 'E') {
                let save = i;
                i += 1;
                if i < cs.len() && (cs[i] == '+' || cs[i] == '-') {
                    i += 1;
                }
                if i < cs.len() && cs[i].is_ascii_digit() {
                    while i < cs.len() && cs[i].is_ascii_digit() {
                        i += 1;
                    }
                } else {
                    i = save;
                }
            }
            let t: String = cs[st..i].iter().collect();
            out.push(Tok::Num(t.parse().map_err(|_| format!("bad number `{t}`"))?));
        } else if c.is_alphabetic() || c == '_' {
            let st = i;
            while i < cs.len() && (cs[i].is_alphanumeric() || cs[i] == '_' || cs[i] == '.') {
                i += 1;
            }
            out.push(Tok::Ident(cs[st..i].iter().collect()));
        } else {
            match c {
                '+' | '-' | '*' | '/' | '^' => out.push(Tok::Op(c)),
                '(' => out.push(Tok::LParen),
                ')' => out.push(Tok::RParen),
                ',' => out.push(Tok::Comma),
                _ => return Err(format!("unexpected `{c}` in expression `{s}`")),
            }
            i += 1;
        }
    }
    Ok(out)
}

struct P<'a> {
    t: Vec<Tok>,
    i: usize,
    env: &'a BTreeMap<String, f64>,
}

impl<'a> P<'a> {
    fn peek(&self) -> Option<&Tok> { self.t.get(self.i) }
    fn next(&mut self) -> Option<Tok> {
        let x = self.t.get(self.i).cloned();
        self.i += 1;
        x
    }
    fn expr(&mut self) -> Result<f64, String> {
        let mut v = self.term()?;
        while let Some(Tok::Op(c)) = self.peek() {
            let c = *c;
            if c != '+' && c != '-' {
                break;
            }
            self.next();
            let r = self.term()?;
            v = if c == '+' { v + r } else { v - r };
        }
        Ok(v)
    }
    fn term(&mut self) -> Result<f64, String> {
        let mut v = self.unary()?;
        while let Some(Tok::Op(c)) = self.peek() {
            let c = *c;
            if c != '*' && c != '/' {
                break;
            }
            self.next();
            let r = self.unary()?;
            v = if c == '*' { v * r } else { v / r };
        }
        Ok(v)
    }
    fn unary(&mut self) -> Result<f64, String> {
        if let Some(Tok::Op('-')) = self.peek() {
            self.next();
            return Ok(-self.unary()?);
        }
        if let Some(Tok::Op('+')) = self.peek() {
            self.next();
            return self.unary();
        }
        self.pow()
    }
    fn pow(&mut self) -> Result<f64, String> {
        let base = self.atom()?;
        if let Some(Tok::Op('^')) = self.peek() {
            self.next();
            let e = self.unary()?;
            return Ok(base.powf(e));
        }
        Ok(base)
    }
    fn atom(&mut self) -> Result<f64, String> {
        match self.next() {
            Some(Tok::Num(n)) => Ok(n),
            Some(Tok::LParen) => {
                let v = self.expr()?;
                match self.next() {
                    Some(Tok::RParen) => Ok(v),
                    _ => Err("expected `)`".into()),
                }
            }
            Some(Tok::Ident(name)) => {
                if let Some(Tok::LParen) = self.peek() {
                    self.next();
                    let mut args = Vec::new();
                    if let Some(Tok::RParen) = self.peek() {
                        self.next();
                    } else {
                        loop {
                            args.push(self.expr()?);
                            match self.next() {
                                Some(Tok::Comma) => continue,
                                Some(Tok::RParen) => break,
                                _ => return Err(format!("bad argument list for `{name}`")),
                            }
                        }
                    }
                    call(&name, &args)
                } else {
                    match name.as_str() {
                        "pi" => Ok(std::f64::consts::PI),
                        "e" => Ok(std::f64::consts::E),
                        _ => self
                            .env
                            .get(&name)
                            .copied()
                            .ok_or_else(|| format!("unknown parameter `{name}`")),
                    }
                }
            }
            other => Err(format!("unexpected token {other:?}")),
        }
    }
}

fn call(name: &str, a: &[f64]) -> Result<f64, String> {
    let one = |f: fn(f64) -> f64| -> Result<f64, String> {
        if a.len() == 1 { Ok(f(a[0])) } else { Err(format!("`{name}` takes 1 argument")) }
    };
    match name {
        "sin" => one(f64::sin),
        "cos" => one(f64::cos),
        "tan" => one(f64::tan),
        "asin" => one(f64::asin),
        "acos" => one(f64::acos),
        "atan" => one(f64::atan),
        "sqrt" => one(f64::sqrt),
        "abs" => one(f64::abs),
        "floor" => one(f64::floor),
        "ceil" => one(f64::ceil),
        "round" => one(f64::round),
        "deg" => one(f64::to_radians),   // deg(30) → radians, for sin/cos
        "rad2deg" => one(f64::to_degrees),
        "atan2" => if a.len() == 2 { Ok(a[0].atan2(a[1])) } else { Err("`atan2` takes 2".into()) },
        "min" => if a.is_empty() { Err("`min` needs arguments".into()) } else { Ok(a.iter().cloned().fold(f64::INFINITY, f64::min)) },
        "max" => if a.is_empty() { Err("`max` needs arguments".into()) } else { Ok(a.iter().cloned().fold(f64::NEG_INFINITY, f64::max)) },
        _ => Err(format!("unknown function `{name}`")),
    }
}

/// Evaluate `src` against `env`. Whitespace-tolerant; errors name the problem.
pub fn eval(src: &str, env: &BTreeMap<String, f64>) -> Result<f64, String> {
    let t = lex(src)?;
    if t.is_empty() {
        return Err("empty expression".into());
    }
    let mut p = P { t, i: 0, env };
    let v = p.expr()?;
    if p.i != p.t.len() {
        return Err(format!("trailing input in `{src}`"));
    }
    if !v.is_finite() {
        return Err(format!("`{src}` is not finite"));
    }
    Ok(v)
}

/// Resolve `params` in dependency order. A parameter may reference an earlier
/// one (or a later one — iteration continues until a pass makes no progress).
pub fn resolve_params(
    raw: &BTreeMap<String, serde_json::Value>,
) -> Result<BTreeMap<String, f64>, String> {
    let mut env = BTreeMap::new();
    let mut pending: Vec<(String, String)> = Vec::new();
    for (k, v) in raw {
        match v {
            serde_json::Value::Number(n) => {
                env.insert(k.clone(), n.as_f64().ok_or("bad number")?);
            }
            serde_json::Value::String(s) => pending.push((k.clone(), s.clone())),
            _ => return Err(format!("param `{k}` must be a number or expression")),
        }
    }
    loop {
        let before = pending.len();
        let mut still = Vec::new();
        let mut last_err = String::new();
        for (k, s) in pending {
            match eval(&s, &env) {
                Ok(v) => {
                    env.insert(k, v);
                }
                Err(e) => {
                    last_err = format!("param `{k}`: {e}");
                    still.push((k, s));
                }
            }
        }
        pending = still;
        if pending.is_empty() {
            return Ok(env);
        }
        if pending.len() == before {
            return Err(last_err);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn arithmetic() {
        let mut env = BTreeMap::new();
        env.insert("t".into(), 3.0);
        assert_eq!(eval("1 + 2 * 3", &env).unwrap(), 7.0);
        assert_eq!(eval("-t^2", &env).unwrap(), -9.0);
        assert_eq!(eval("(1+2)*3", &env).unwrap(), 9.0);
        assert!((eval("sin(deg(30))", &env).unwrap() - 0.5).abs() < 1e-12);
        assert_eq!(eval("max(t, 10, 2)", &env).unwrap(), 10.0);
        assert!(eval("q", &env).is_err());
    }
}
