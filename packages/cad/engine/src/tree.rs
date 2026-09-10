//! The feature tree: the JSON schema (`serde`) and its resolution into a
//! kernel-neutral op list with every expression evaluated, every sketch
//! turned into a `Region` on a `Frame`, and every gear turned into its loop.
//!
//! Kernels never see the tree. They see `Resolved`.

use crate::expr;
use crate::sketch::{gear_loop, GearSpec, Loop, Region, Seg, P2};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// A number or an expression string.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Num {
    F(f64),
    S(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

impl OneOrMany {
    fn list(&self) -> Vec<String> {
        match self {
            OneOrMany::One(s) => vec![s.clone()],
            OneOrMany::Many(v) => v.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum PlaneRef {
    Named(String),
    Offset { base: String, offset: Num },
}

#[derive(Debug, Clone, Deserialize)]
pub struct CircleSpec {
    pub c: [Num; 2],
    pub r: Num,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RectSpec {
    pub c: [Num; 2],
    pub w: Num,
    pub h: Num,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum SegSpec {
    Line { to: [Num; 2] },
    Arc { arc: ArcSpec },
    Bezier { bezier: BezSpec },
}
#[derive(Debug, Clone, Deserialize)]
pub struct ArcSpec {
    pub to: [Num; 2],
    pub via: [Num; 2],
}
#[derive(Debug, Clone, Deserialize)]
pub struct BezSpec {
    pub to: [Num; 2],
    pub ctrl: Vec<[Num; 2]>,
}
#[derive(Debug, Clone, Deserialize)]
pub struct PathSpec {
    pub from: [Num; 2],
    pub segs: Vec<SegSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoopSpec {
    #[serde(default)]
    pub name: Option<String>,
    pub circle: Option<CircleSpec>,
    pub rect: Option<RectSpec>,
    pub polygon: Option<Vec<[Num; 2]>>,
    pub path: Option<PathSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AxisSpec {
    pub p: [Num; 2],
    pub d: [Num; 2],
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum Feature {
    Sketch { id: String, #[serde(default)] plane: Option<PlaneRef>, loops: Vec<LoopSpec> },
    Gear {
        id: String,
        m: Num,
        z: Num,
        #[serde(default)] alpha: Option<Num>,
        b: Num,
        #[serde(default)] bore: Option<Num>,
        #[serde(default)] plane: Option<PlaneRef>,
    },
    Pattern {
        id: String,
        of: String,
        kind: String,
        #[serde(default)] center: Option<[Num; 2]>,
        count: Num,
        #[serde(default)] step: Option<[Num; 2]>,
        #[serde(default)] angle: Option<Num>,
        #[serde(default)] name: Option<String>,
    },
    Extrude { id: String, profile: OneOrMany, depth: Num, #[serde(default)] mode: Option<String> },
    Revolve { id: String, profile: OneOrMany, axis: AxisSpec, #[serde(default)] angle: Option<Num>, #[serde(default)] mode: Option<String> },
    Boolean { id: String, kind: String, a: String, b: String },
    Fillet { id: String, edges: String, r: Num },
    Chamfer { id: String, edges: String, d: Num },
    Shell { id: String, faces: String, t: Num },
}

impl Feature {
    pub fn id(&self) -> &str {
        match self {
            Feature::Sketch { id, .. } | Feature::Gear { id, .. } | Feature::Pattern { id, .. } | Feature::Extrude { id, .. }
            | Feature::Revolve { id, .. } | Feature::Boolean { id, .. } | Feature::Fillet { id, .. } | Feature::Chamfer { id, .. }
            | Feature::Shell { id, .. } => id,
        }
    }
    pub fn op(&self) -> &'static str {
        match self {
            Feature::Sketch { .. } => "sketch",
            Feature::Gear { .. } => "gear",
            Feature::Pattern { .. } => "pattern",
            Feature::Extrude { .. } => "extrude",
            Feature::Revolve { .. } => "revolve",
            Feature::Boolean { .. } => "boolean",
            Feature::Fillet { .. } => "fillet",
            Feature::Chamfer { .. } => "chamfer",
            Feature::Shell { .. } => "shell",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Tree {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    #[serde(default)]
    pub units: Option<String>,
    #[serde(default)]
    pub params: BTreeMap<String, Value>,
    pub features: Vec<Feature>,
}

// ── resolved ────────────────────────────────────────────────────────────────

pub type P3 = [f64; 3];

#[derive(Debug, Clone, Serialize)]
pub struct Frame {
    pub o: P3,
    pub u: P3,
    pub v: P3,
    pub n: P3,
}

impl Frame {
    pub fn named(name: &str) -> Option<Frame> {
        let f = |o, u, v, n| Some(Frame { o, u, v, n });
        match name {
            "XY" => f([0.0; 3], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]),
            "XZ" => f([0.0; 3], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]),
            "YZ" => f([0.0; 3], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]),
            _ => None,
        }
    }
    pub fn offset(&self, d: f64) -> Frame {
        let mut f = self.clone();
        for i in 0..3 {
            f.o[i] += self.n[i] * d;
        }
        f
    }
    pub fn to3(&self, p: P2) -> P3 {
        let mut out = [0.0; 3];
        for i in 0..3 {
            out[i] = self.o[i] + self.u[i] * p[0] + self.v[i] * p[1];
        }
        out
    }
    pub fn dir3(&self, d: P2) -> P3 {
        let mut out = [0.0; 3];
        for i in 0..3 {
            out[i] = self.u[i] * d[0] + self.v[i] * d[1];
        }
        out
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RSketch {
    pub id: String,
    pub frame: Frame,
    pub region: Region,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum ROp {
    Extrude { id: String, sketches: Vec<String>, frame: Frame, region: Region, depth: f64, mode: String },
    Revolve { id: String, sketches: Vec<String>, frame: Frame, region: Region, axis_p: P2, axis_d: P2, angle_deg: f64, mode: String },
    Boolean { id: String, kind: String, a: String, b: String },
    Fillet { id: String, edges: String, r: f64 },
    Chamfer { id: String, edges: String, d: f64 },
    Shell { id: String, faces: String, t: f64 },
}

impl ROp {
    pub fn id(&self) -> &str {
        match self {
            ROp::Extrude { id, .. } | ROp::Revolve { id, .. } | ROp::Boolean { id, .. } | ROp::Fillet { id, .. } | ROp::Chamfer { id, .. } | ROp::Shell { id, .. } => id,
        }
    }
    pub fn op(&self) -> &'static str {
        match self {
            ROp::Extrude { .. } => "extrude",
            ROp::Revolve { .. } => "revolve",
            ROp::Boolean { .. } => "boolean",
            ROp::Fillet { .. } => "fillet",
            ROp::Chamfer { .. } => "chamfer",
            ROp::Shell { .. } => "shell",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GearMeta {
    pub id: String,
    pub spec: GearSpec,
    pub b: f64,
    pub bore: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Resolved {
    pub units: String,
    pub params: BTreeMap<String, f64>,
    pub sketches: Vec<RSketch>,
    pub ops: Vec<ROp>,
    pub gears: Vec<GearMeta>,
}

struct Ctx<'a> {
    env: &'a BTreeMap<String, f64>,
}

impl<'a> Ctx<'a> {
    fn n(&self, x: &Num) -> Result<f64, String> {
        match x {
            Num::F(f) => Ok(*f),
            Num::S(s) => expr::eval(s, self.env),
        }
    }
    fn p(&self, p: &[Num; 2]) -> Result<P2, String> {
        Ok([self.n(&p[0])?, self.n(&p[1])?])
    }
}

/// Parse a tree from JSON.
pub fn parse(json: &str) -> Result<Tree, String> {
    serde_json::from_str(json).map_err(|e| format!("tree parse error: {e}"))
}

/// Evaluate every expression, build every region, and produce the op list.
pub fn resolve(tree: &Tree) -> Result<Resolved, String> {
    let env = expr::resolve_params(&tree.params)?;
    let cx = Ctx { env: &env };
    let mut sketches: Vec<RSketch> = Vec::new();
    let mut ops: Vec<ROp> = Vec::new();
    let mut gears = Vec::new();
    let mut ids = std::collections::BTreeSet::new();

    let find_sketch = |sk: &Vec<RSketch>, id: &str| -> Result<RSketch, String> {
        sk.iter().find(|s| s.id == id).cloned().ok_or_else(|| format!("unknown sketch `{id}`"))
    };
    let plane = |sk: &Vec<RSketch>, ops: &Vec<ROp>, pr: &Option<PlaneRef>| -> Result<Frame, String> {
        let (base, off) = match pr {
            None => ("XY".to_string(), 0.0),
            Some(PlaneRef::Named(s)) => (s.clone(), 0.0),
            Some(PlaneRef::Offset { base, offset }) => (base.clone(), cx.n(offset)?),
        };
        if let Some(f) = Frame::named(&base) {
            return Ok(f.offset(off));
        }
        // `<extrude>.end` / `<extrude>.start`
        if let Some((fid, face)) = base.rsplit_once('.') {
            for op in ops {
                if let ROp::Extrude { id, frame, depth, .. } = op {
                    if id == fid {
                        return match face {
                            "start" => Ok(frame.offset(off)),
                            "end" => Ok(frame.offset(*depth + off)),
                            _ => Err(format!("plane `{base}`: only `.start` and `.end` of an extrude can carry a sketch")),
                        };
                    }
                }
            }
            let _ = sk;
        }
        Err(format!("unknown plane `{base}`"))
    };
    let region_of = |sk: &Vec<RSketch>, ids: &[String]| -> Result<(Frame, Region), String> {
        let mut region = Region::default();
        let mut frame: Option<Frame> = None;
        for id in ids {
            let s = find_sketch(sk, id)?;
            if let Some(f) = &frame {
                let same = (0..3).all(|i| (f.o[i] - s.frame.o[i]).abs() < 1e-9 && (f.n[i] - s.frame.n[i]).abs() < 1e-9);
                if !same {
                    return Err(format!("profile sketches `{}` and `{id}` are not coplanar", ids[0]));
                }
            } else {
                frame = Some(s.frame.clone());
            }
            region.loops.extend(s.region.loops.iter().cloned());
        }
        Ok((frame.ok_or("empty profile")?, region))
    };

    for f in &tree.features {
        if !ids.insert(f.id().to_string()) {
            return Err(format!("duplicate feature id `{}`", f.id()));
        }
        match f {
            Feature::Sketch { id, plane: pr, loops } => {
                let frame = plane(&sketches, &ops, pr)?;
                let mut region = Region::default();
                for (li, l) in loops.iter().enumerate() {
                    let mut lp = if let Some(c) = &l.circle {
                        Loop::circle(cx.p(&c.c)?, cx.n(&c.r)?)
                    } else if let Some(r) = &l.rect {
                        Loop::rect(cx.p(&r.c)?, cx.n(&r.w)?, cx.n(&r.h)?)
                    } else if let Some(pts) = &l.polygon {
                        let pts: Result<Vec<P2>, String> = pts.iter().map(|p| cx.p(p)).collect();
                        let pts = pts?;
                        if pts.len() < 3 {
                            return Err(format!("sketch `{id}` loop {li}: polygon needs 3 points"));
                        }
                        Loop::polygon(&pts)
                    } else if let Some(path) = &l.path {
                        let start = cx.p(&path.from)?;
                        let mut segs = Vec::new();
                        for s in &path.segs {
                            segs.push(match s {
                                SegSpec::Line { to } => Seg::Line { to: cx.p(to)? },
                                SegSpec::Arc { arc } => Seg::Arc { to: cx.p(&arc.to)?, via: cx.p(&arc.via)? },
                                SegSpec::Bezier { bezier } => {
                                    let ctrl: Result<Vec<P2>, String> = bezier.ctrl.iter().map(|p| cx.p(p)).collect();
                                    Seg::Bezier { to: cx.p(&bezier.to)?, ctrl: ctrl? }
                                }
                            });
                        }
                        let n = segs.len();
                        let lp = Loop { start, segs, names: vec![None; n] };
                        if !lp.is_closed() {
                            return Err(format!("sketch `{id}` loop {li}: path is not closed"));
                        }
                        lp
                    } else {
                        return Err(format!("sketch `{id}` loop {li}: needs circle, rect, polygon or path"));
                    };
                    if let Some(n) = &l.name {
                        lp = lp.named(n);
                    }
                    region.loops.push(lp);
                }
                sketches.push(RSketch { id: id.clone(), frame, region });
            }
            Feature::Gear { id, m, z, alpha, b, bore, plane: pr } => {
                let frame = plane(&sketches, &ops, pr)?;
                let m = cx.n(m)?;
                let zf = cx.n(z)?;
                if zf < 4.0 || (zf - zf.round()).abs() > 1e-9 {
                    return Err(format!("gear `{id}`: z must be an integer ≥ 4"));
                }
                let alpha = match alpha { Some(a) => cx.n(a)?, None => 20.0 };
                let b = cx.n(b)?;
                let bore = match bore { Some(x) => cx.n(x)?, None => 0.0 };
                let spec = GearSpec::new(m, zf as u32, alpha);
                if bore > 0.0 && bore / 2.0 >= spec.r_root {
                    return Err(format!("gear `{id}`: bore {bore} reaches the root circle"));
                }
                let mut region = Region { loops: vec![gear_loop(&spec)] };
                if bore > 0.0 {
                    region.loops.push(Loop::circle([0.0, 0.0], bore / 2.0).named("bore"));
                }
                let sid = format!("{id}.profile");
                sketches.push(RSketch { id: sid.clone(), frame: frame.clone(), region: region.clone() });
                ops.push(ROp::Extrude { id: id.clone(), sketches: vec![sid], frame, region, depth: b, mode: if ops.is_empty() { "new".into() } else { "add".into() } });
                gears.push(GearMeta { id: id.clone(), spec, b, bore });
            }
            Feature::Pattern { id, of, kind, center, count, step, angle, name } => {
                let src = find_sketch(&sketches, of)?;
                let n = cx.n(count)?;
                if n < 1.0 || (n - n.round()).abs() > 1e-9 {
                    return Err(format!("pattern `{id}`: count must be a positive integer"));
                }
                let n = n as usize;
                let mut region = Region::default();
                match kind.as_str() {
                    "circular" => {
                        let c = match center { Some(c) => cx.p(c)?, None => [0.0, 0.0] };
                        let total = match angle { Some(a) => cx.n(a)?.to_radians(), None => 2.0 * std::f64::consts::PI };
                        let full = (total - 2.0 * std::f64::consts::PI).abs() < 1e-9;
                        for i in 0..n {
                            let th = if full { total * i as f64 / n as f64 } else { total * i as f64 / (n.max(2) - 1) as f64 };
                            let (s, co) = th.sin_cos();
                            let r = src.region.transformed(&|p: P2| {
                                let x = p[0] - c[0];
                                let y = p[1] - c[1];
                                [c[0] + x * co - y * s, c[1] + x * s + y * co]
                            });
                            for (li, l) in r.loops.into_iter().enumerate() {
                                let nm = name.clone().unwrap_or_else(|| of.clone());
                                region.loops.push(l.named(&format!("{nm}[{}]", i * src.region.loops.len() + li)));
                            }
                        }
                    }
                    "linear" => {
                        let st = match step { Some(s) => cx.p(s)?, None => return Err(format!("pattern `{id}`: linear needs `step`")) };
                        for i in 0..n {
                            let r = src.region.transformed(&|p: P2| [p[0] + st[0] * i as f64, p[1] + st[1] * i as f64]);
                            for (li, l) in r.loops.into_iter().enumerate() {
                                let nm = name.clone().unwrap_or_else(|| of.clone());
                                region.loops.push(l.named(&format!("{nm}[{}]", i * src.region.loops.len() + li)));
                            }
                        }
                    }
                    k => return Err(format!("pattern `{id}`: unknown kind `{k}`")),
                }
                sketches.push(RSketch { id: id.clone(), frame: src.frame.clone(), region });
            }
            Feature::Extrude { id, profile, depth, mode } => {
                let list = profile.list();
                let (frame, region) = region_of(&sketches, &list)?;
                let depth = cx.n(depth)?;
                if depth.abs() < 1e-12 {
                    return Err(format!("extrude `{id}`: zero depth"));
                }
                let mode = mode.clone().unwrap_or_else(|| if ops.is_empty() { "new".into() } else { "add".into() });
                ops.push(ROp::Extrude { id: id.clone(), sketches: list, frame, region, depth, mode });
            }
            Feature::Revolve { id, profile, axis, angle, mode } => {
                let list = profile.list();
                let (frame, region) = region_of(&sketches, &list)?;
                let axis_p = cx.p(&axis.p)?;
                let axis_d = cx.p(&axis.d)?;
                let angle_deg = match angle { Some(a) => cx.n(a)?, None => 360.0 };
                let mode = mode.clone().unwrap_or_else(|| if ops.is_empty() { "new".into() } else { "add".into() });
                ops.push(ROp::Revolve { id: id.clone(), sketches: list, frame, region, axis_p, axis_d, angle_deg, mode });
            }
            Feature::Boolean { id, kind, a, b } => {
                for x in [a, b] {
                    if !ops.iter().any(|o| o.id() == x) {
                        return Err(format!("boolean `{id}`: unknown solid `{x}`"));
                    }
                }
                ops.push(ROp::Boolean { id: id.clone(), kind: kind.clone(), a: a.clone(), b: b.clone() });
            }
            Feature::Fillet { id, edges, r } => ops.push(ROp::Fillet { id: id.clone(), edges: edges.clone(), r: cx.n(r)? }),
            Feature::Chamfer { id, edges, d } => ops.push(ROp::Chamfer { id: id.clone(), edges: edges.clone(), d: cx.n(d)? }),
            Feature::Shell { id, faces, t } => ops.push(ROp::Shell { id: id.clone(), faces: faces.clone(), t: cx.n(t)? }),
        }
    }
    Ok(Resolved { units: tree.units.clone().unwrap_or_else(|| "mm".into()), params: env, sketches, ops, gears })
}
