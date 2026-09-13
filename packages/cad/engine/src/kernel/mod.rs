//! The seam. Everything above it (tree, expressions, naming, cache, lexicons)
//! is ours and kernel-agnostic; everything below it is replaceable.

use crate::tree::Resolved;
use serde::Serialize;

pub mod implicit;
pub mod truck;

#[derive(Debug, Clone, Default, Serialize)]
pub struct TriMesh {
    pub pos: Vec<[f64; 3]>,
    pub tris: Vec<[u32; 3]>,
}

/// The exact geometry of a face, when the sweep that made it is simple
/// enough to say: a plane, or a cylinder (a circle is four exact arcs, so a
/// bore *is* a cylinder). This is what a measure tool reads — diameters and
/// plane-to-plane distances come from here, never from the mesh.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Geom {
    Plane { normal: [f64; 3], point: [f64; 3] },
    Cylinder { axis: [f64; 3], center: [f64; 3], radius: f64 },
}

impl Geom {
    /// How well this geometry matches a face the kernel actually made, from
    /// the face's own measured normal and centroid; `None` when it does not.
    ///
    /// The op that made a face hands over one geometry per profile segment,
    /// matched to faces by index — and the kernel is free to split, merge and
    /// reorder them. On a revolve it does: a flanged nut came back with its
    /// flat annuli labelled as cylinders and its real bore labelled as
    /// nothing, so a drawing called the bore a boss and dimensioned neither
    /// (measured 2026-09-13). Scored instead of trusted, and re-matched when
    /// the index is wrong.
    pub fn fits(&self, n: [f64; 3], c: [f64; 3]) -> Option<f64> {
        let dot = |a: [f64; 3], b: [f64; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        match self {
            Geom::Plane { normal, .. } => {
                let d = dot(n, *normal).abs();
                if d > 0.99 { Some(d) } else { None }
            }
            Geom::Cylinder { axis, center, radius } => {
                if *radius <= 1e-9 || dot(n, *axis).abs() > 0.2 { return None; }
                let rel = [c[0] - center[0], c[1] - center[1], c[2] - center[2]];
                let along = dot(rel, *axis);
                let rad = [rel[0] - axis[0] * along, rel[1] - axis[1] * along, rel[2] - axis[2] * along];
                let len = (rad[0] * rad[0] + rad[1] * rad[1] + rad[2] * rad[2]).sqrt();
                // a tessellated wedge's centroid sits inside its own radius —
                // by 2/pi for a half cylinder, less for a quarter
                if len < 0.55 * radius || len > 1.05 * radius { return None; }
                Some(1.0 - (len - radius).abs() / radius)
            }
        }
    }
}

/// The geometry for face `i`: the one its op assigned if it fits the face the
/// kernel made, else the best-fitting one on offer, else none.
pub fn geom_for(geoms: &[Option<Geom>], i: usize, normal: [f64; 3], centroid: [f64; 3]) -> Option<Geom> {
    if let Some(Some(g)) = geoms.get(i) {
        if g.fits(normal, centroid).is_some() { return Some(g.clone()); }
    }
    let mut best: Option<(f64, &Geom)> = None;
    for g in geoms.iter().flatten() {
        if let Some(score) = g.fits(normal, centroid) {
            if best.map_or(true, |(b, _)| score > b) { best = Some((score, g)); }
        }
    }
    best.map(|(_, g)| g.clone())
}

/// One face of the exact model, with every name that reaches it.
#[derive(Debug, Clone, Serialize)]
pub struct FaceInfo {
    pub names: Vec<String>,
    pub area: f64,
    pub normal: [f64; 3],
    pub centroid: [f64; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geom: Option<Geom>,
}

#[derive(Debug, Clone, Default)]
pub struct Built {
    pub mesh: TriMesh,
    pub faces: Vec<FaceInfo>,
    pub step: Option<String>,
    /// index into `faces` for every triangle of `mesh` (empty when the
    /// kernel has no faces, e.g. implicit)
    pub face_of_tri: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KError {
    pub op: String,
    pub msg: String,
    /// true when the kernel cannot do this op at all (as opposed to failing
    /// on this input) — the bake-off scores the two differently.
    pub unsupported: bool,
}

impl KError {
    pub fn fail(op: &str, msg: impl Into<String>) -> KError { KError { op: op.into(), msg: msg.into(), unsupported: false } }
    pub fn unsupported(op: &str, what: &str) -> KError { KError { op: op.into(), msg: format!("{what} is not supported by this kernel"), unsupported: true } }
}

#[derive(Debug, Clone)]
pub struct BuildOpts {
    /// chord tolerance for tessellation, model units
    pub tol: f64,
    /// boolean tolerance, model units
    pub bool_tol: f64,
    pub want_step: bool,
    /// implicit only: cells along the longest bbox axis
    pub res: usize,
}

impl Default for BuildOpts {
    fn default() -> Self { BuildOpts { tol: 0.01, bool_tol: 0.01, want_step: false, res: 64 } }
}

pub trait Kernel {
    fn id(&self) -> &'static str;
    fn build(&self, r: &Resolved, o: &BuildOpts) -> Result<Built, KError>;
}

pub fn by_name(name: &str) -> Option<Box<dyn Kernel>> {
    match name {
        "truck" => Some(Box::new(truck::Truck)),
        "implicit" => Some(Box::new(implicit::Implicit)),
        _ => None,
    }
}

fn v3n(a: [f64; 3]) -> [f64; 3] { let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt().max(1e-300); [a[0] / l, a[1] / l, a[2] / l] }
fn cross3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }

/// Geometry for the faces of an extrude, in sweep order (see `sweep_face_names`).
pub fn extrude_face_geoms(frame: &crate::tree::Frame, groups: &[Vec<crate::sketch::Loop>], depth: f64) -> Vec<Option<Geom>> {
    use crate::sketch::Seg;
    let n = frame.n;
    let sgn = depth.signum();
    let mut out = vec![Some(Geom::Plane { normal: [-n[0] * sgn, -n[1] * sgn, -n[2] * sgn], point: frame.o })];
    for g in groups {
        for l in g {
            let mut cur = l.start;
            for s in &l.segs {
                out.push(match s {
                    Seg::Line { to } => {
                        let d = frame.dir3([to[0] - cur[0], to[1] - cur[1]]);
                        Some(Geom::Plane { normal: v3n(cross3(d, n)), point: frame.to3(cur) })
                    }
                    Seg::Arc { to, via } => crate::sketch::circle_through(cur, *via, *to).map(|(c, r)| Geom::Cylinder { axis: v3n(n), center: frame.to3(c), radius: r }),
                    Seg::Bezier { .. } => None,
                });
                cur = s.end();
            }
        }
    }
    let end = [frame.o[0] + n[0] * depth, frame.o[1] + n[1] * depth, frame.o[2] + n[2] * depth];
    out.push(Some(Geom::Plane { normal: [n[0] * sgn, n[1] * sgn, n[2] * sgn], point: end }));
    out
}

/// Geometry for the faces a full revolve makes from a loop's segments, one
/// per segment (the kernel may split each into several faces; index modulo).
pub fn revolve_seg_geoms(frame: &crate::tree::Frame, l: &crate::sketch::Loop, axis_p: [f64; 2], axis_d: [f64; 2]) -> Vec<Option<Geom>> {
    use crate::sketch::Seg;
    let al = (axis_d[0] * axis_d[0] + axis_d[1] * axis_d[1]).sqrt().max(1e-300);
    let ad = [axis_d[0] / al, axis_d[1] / al];
    let axis3 = v3n(frame.dir3(ad));
    let origin = frame.to3(axis_p);
    let off = |p: [f64; 2]| ((p[0] - axis_p[0]) * ad[1] - (p[1] - axis_p[1]) * ad[0]).abs();
    let mut out = Vec::new();
    let mut cur = l.start;
    for s in &l.segs {
        out.push(match s {
            Seg::Line { to } => {
                let d = [to[0] - cur[0], to[1] - cur[1]];
                let dl = (d[0] * d[0] + d[1] * d[1]).sqrt().max(1e-300);
                let along = (d[0] * ad[0] + d[1] * ad[1]).abs() / dl;
                if along > 1.0 - 1e-9 {
                    Some(Geom::Cylinder { axis: axis3, center: origin, radius: off(cur) })
                } else if along < 1e-9 {
                    let h = (cur[0] - axis_p[0]) * ad[0] + (cur[1] - axis_p[1]) * ad[1];
                    let pt = [origin[0] + axis3[0] * h, origin[1] + axis3[1] * h, origin[2] + axis3[2] * h];
                    Some(Geom::Plane { normal: axis3, point: pt })
                } else {
                    None // a cone
                }
            }
            _ => None, // torus / spline of revolution
        });
        cur = s.end();
    }
    out
}

/// Names for the faces of a swept region, in the order a sweep emits them:
/// `[start, side[k] for each (loop, seg) in wire order, end]` for an extrude;
/// `[side[k]...]` for a full revolve. Per-segment loop names become aliases.
pub fn sweep_face_names(id: &str, region: &crate::sketch::Region, groups: &[Vec<crate::sketch::Loop>], capped: bool) -> Vec<Vec<String>> {
    let _ = region;
    let mut out = Vec::new();
    if capped {
        out.push(vec![format!("{id}.start")]);
    }
    let mut k = 0;
    for g in groups {
        for l in g {
            for (si, _) in l.segs.iter().enumerate() {
                let mut names = vec![format!("{id}.side[{k}]")];
                if let Some(n) = &l.names[si] {
                    names.push(format!("{id}.{n}"));
                }
                out.push(names);
                k += 1;
            }
        }
    }
    if capped {
        out.push(vec![format!("{id}.end")]);
    }
    out
}
