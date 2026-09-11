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

/// One face of the exact model, with every name that reaches it.
#[derive(Debug, Clone, Serialize)]
pub struct FaceInfo {
    pub names: Vec<String>,
    pub area: f64,
    pub normal: [f64; 3],
    pub centroid: [f64; 3],
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
