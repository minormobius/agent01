//! The implicit spike: every op is a signed-distance field, booleans are
//! min/max, and the mesh comes out of naive surface nets on a grid. No faces,
//! no STEP, nothing exact — but it cannot fail on any input, and it is the
//! representation the simulation path wants.

use super::{BuildOpts, Built, KError, Kernel, TriMesh};
use crate::sketch::{point_in_ring, Region, P2};
use crate::tree::{Frame, ROp, Resolved};

pub struct Implicit;

struct Poly2 {
    rings: Vec<Vec<P2>>,
    bbox: [P2; 2],
}

impl Poly2 {
    fn new(region: &Region) -> Poly2 {
        let rings: Vec<Vec<P2>> = region.loops.iter().map(|l| l.sample(2e-3)).collect();
        let mut bbox = [[f64::INFINITY; 2], [f64::NEG_INFINITY; 2]];
        for r in &rings {
            for p in r {
                for i in 0..2 {
                    bbox[0][i] = bbox[0][i].min(p[i]);
                    bbox[1][i] = bbox[1][i].max(p[i]);
                }
            }
        }
        Poly2 { rings, bbox }
    }
    fn sdf(&self, p: P2) -> f64 {
        let mut d2 = f64::INFINITY;
        let mut inside = 0usize;
        for r in &self.rings {
            if point_in_ring(p, r) {
                inside += 1;
            }
            let n = r.len();
            for i in 0..n {
                let a = r[i];
                let b = r[(i + 1) % n];
                let ab = [b[0] - a[0], b[1] - a[1]];
                let ap = [p[0] - a[0], p[1] - a[1]];
                let l2 = ab[0] * ab[0] + ab[1] * ab[1];
                let t = if l2 > 0.0 { ((ap[0] * ab[0] + ap[1] * ab[1]) / l2).clamp(0.0, 1.0) } else { 0.0 };
                let q = [a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1]];
                d2 = d2.min(q[0] * q[0] + q[1] * q[1]);
            }
        }
        let d = d2.sqrt();
        if inside % 2 == 1 { -d } else { d }
    }
}

enum Field {
    Extrude { frame: Frame, poly: Poly2, z0: f64, z1: f64 },
    Revolve { frame: Frame, poly: Poly2, axis_p: P2, axis_d: P2, perp: P2 },
}

fn local(frame: &Frame, p: [f64; 3]) -> [f64; 3] {
    let d = [p[0] - frame.o[0], p[1] - frame.o[1], p[2] - frame.o[2]];
    let dot = |a: [f64; 3]| a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    [dot(frame.u), dot(frame.v), dot(frame.n)]
}

impl Field {
    fn eval(&self, p: [f64; 3]) -> f64 {
        match self {
            Field::Extrude { frame, poly, z0, z1 } => {
                let l = local(frame, p);
                let d2 = poly.sdf([l[0], l[1]]);
                let dz = (l[2] - (z0 + z1) / 2.0).abs() - (z1 - z0) / 2.0;
                let ox = d2.max(0.0);
                let oz = dz.max(0.0);
                (ox * ox + oz * oz).sqrt() + d2.max(dz).min(0.0)
            }
            Field::Revolve { frame, poly, axis_p, axis_d, perp } => {
                let l = local(frame, p);
                // in-plane coords relative to the axis point: h along axis, r off it
                let x = l[0] - axis_p[0];
                let y = l[1] - axis_p[1];
                let h = x * axis_d[0] + y * axis_d[1];
                let r_in = x * perp[0] + y * perp[1];
                let r = (r_in * r_in + l[2] * l[2]).sqrt();
                poly.sdf([axis_p[0] + axis_d[0] * h + perp[0] * r, axis_p[1] + axis_d[1] * h + perp[1] * r])
            }
        }
    }
    fn bbox(&self) -> [[f64; 3]; 2] {
        let mut out = [[f64::INFINITY; 3], [f64::NEG_INFINITY; 3]];
        let mut add = |p: [f64; 3]| {
            for i in 0..3 {
                out[0][i] = out[0][i].min(p[i]);
                out[1][i] = out[1][i].max(p[i]);
            }
        };
        match self {
            Field::Extrude { frame, poly, z0, z1 } => {
                for x in [poly.bbox[0][0], poly.bbox[1][0]] {
                    for y in [poly.bbox[0][1], poly.bbox[1][1]] {
                        for z in [*z0, *z1] {
                            let q = frame.to3([x, y]);
                            add([q[0] + frame.n[0] * z, q[1] + frame.n[1] * z, q[2] + frame.n[2] * z]);
                        }
                    }
                }
            }
            Field::Revolve { frame, poly, axis_p, axis_d, perp } => {
                // extent along axis and max radius → a box around the solid of revolution
                let mut rmax: f64 = 0.0;
                let (mut hmin, mut hmax) = (f64::INFINITY, f64::NEG_INFINITY);
                for r in &poly.rings {
                    for p in r {
                        let x = p[0] - axis_p[0];
                        let y = p[1] - axis_p[1];
                        rmax = rmax.max((x * perp[0] + y * perp[1]).abs());
                        let h = x * axis_d[0] + y * axis_d[1];
                        hmin = hmin.min(h);
                        hmax = hmax.max(h);
                    }
                }
                let a3 = frame.dir3(*axis_d);
                let p3 = frame.dir3(*perp);
                let o = frame.to3(*axis_p);
                for h in [hmin, hmax] {
                    for s in [-1.0, 1.0] {
                        for t in [-1.0, 1.0] {
                            add([
                                o[0] + a3[0] * h + p3[0] * rmax * s + frame.n[0] * rmax * t,
                                o[1] + a3[1] * h + p3[1] * rmax * s + frame.n[1] * rmax * t,
                                o[2] + a3[2] * h + p3[2] * rmax * s + frame.n[2] * rmax * t,
                            ]);
                        }
                    }
                }
            }
        }
        out
    }
}

enum Node {
    Leaf(Field),
    Union(Box<Node>, Box<Node>),
    Cut(Box<Node>, Box<Node>),
    Inter(Box<Node>, Box<Node>),
}

impl Node {
    fn eval(&self, p: [f64; 3]) -> f64 {
        match self {
            Node::Leaf(f) => f.eval(p),
            Node::Union(a, b) => a.eval(p).min(b.eval(p)),
            Node::Cut(a, b) => a.eval(p).max(-b.eval(p)),
            Node::Inter(a, b) => a.eval(p).max(b.eval(p)),
        }
    }
    fn bbox(&self) -> [[f64; 3]; 2] {
        match self {
            Node::Leaf(f) => f.bbox(),
            Node::Union(a, b) => {
                let (x, y) = (a.bbox(), b.bbox());
                let mut o = x;
                for i in 0..3 {
                    o[0][i] = o[0][i].min(y[0][i]);
                    o[1][i] = o[1][i].max(y[1][i]);
                }
                o
            }
            Node::Cut(a, _) => a.bbox(),
            Node::Inter(a, b) => {
                let (x, y) = (a.bbox(), b.bbox());
                let mut o = x;
                for i in 0..3 {
                    o[0][i] = o[0][i].max(y[0][i]);
                    o[1][i] = o[1][i].min(y[1][i]);
                }
                o
            }
        }
    }
}

/// Naive surface nets. Watertight by construction when the surface does not
/// touch the grid boundary, which the padding guarantees.
fn surface_nets(node: &Node, res: usize) -> TriMesh {
    let bb = node.bbox();
    let ext = [bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]];
    let longest = ext[0].max(ext[1]).max(ext[2]);
    let h = longest / res as f64;
    let pad = 2.0 * h;
    let o = [bb[0][0] - pad, bb[0][1] - pad, bb[0][2] - pad];
    let n = [
        ((ext[0] + 2.0 * pad) / h).ceil() as usize + 1,
        ((ext[1] + 2.0 * pad) / h).ceil() as usize + 1,
        ((ext[2] + 2.0 * pad) / h).ceil() as usize + 1,
    ];
    let idx = |i: usize, j: usize, k: usize| (i * n[1] + j) * n[2] + k;
    let mut f = vec![0.0f64; n[0] * n[1] * n[2]];
    for i in 0..n[0] {
        for j in 0..n[1] {
            for k in 0..n[2] {
                f[idx(i, j, k)] = node.eval([o[0] + i as f64 * h, o[1] + j as f64 * h, o[2] + k as f64 * h]);
            }
        }
    }
    // one vertex per cell with a sign change
    let cn = [n[0] - 1, n[1] - 1, n[2] - 1];
    let cidx = |i: usize, j: usize, k: usize| (i * cn[1] + j) * cn[2] + k;
    let mut cell_vert = vec![u32::MAX; cn[0] * cn[1] * cn[2]];
    let mut pos: Vec<[f64; 3]> = Vec::new();
    let corners: [[usize; 3]; 8] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    let cedges: [[usize; 2]; 12] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for i in 0..cn[0] {
        for j in 0..cn[1] {
            for k in 0..cn[2] {
                let vals: Vec<f64> = corners.iter().map(|c| f[idx(i + c[0], j + c[1], k + c[2])]).collect();
                let mut sum = [0.0; 3];
                let mut cnt = 0;
                for e in &cedges {
                    let (a, b) = (vals[e[0]], vals[e[1]]);
                    if (a < 0.0) != (b < 0.0) {
                        let t = a / (a - b);
                        let ca = corners[e[0]];
                        let cb = corners[e[1]];
                        for d in 0..3 {
                            sum[d] += ca[d] as f64 + (cb[d] as f64 - ca[d] as f64) * t;
                        }
                        cnt += 1;
                    }
                }
                if cnt > 0 {
                    cell_vert[cidx(i, j, k)] = pos.len() as u32;
                    pos.push([o[0] + (i as f64 + sum[0] / cnt as f64) * h, o[1] + (j as f64 + sum[1] / cnt as f64) * h, o[2] + (k as f64 + sum[2] / cnt as f64) * h]);
                }
            }
        }
    }
    // one quad per grid edge with a sign change, between the 4 cells around it
    let mut tris: Vec<[u32; 3]> = Vec::new();
    for i in 0..n[0] {
        for j in 0..n[1] {
            for k in 0..n[2] {
                let a = f[idx(i, j, k)];
                // edge along x
                if i + 1 < n[0] && j >= 1 && k >= 1 && j < cn[1] && k < cn[2] {
                    let b = f[idx(i + 1, j, k)];
                    if (a < 0.0) != (b < 0.0) {
                        let q = [cell_vert[cidx(i, j - 1, k - 1)], cell_vert[cidx(i, j, k - 1)], cell_vert[cidx(i, j, k)], cell_vert[cidx(i, j - 1, k)]];
                        push_quad(&mut tris, q, a < 0.0);
                    }
                }
                if j + 1 < n[1] && i >= 1 && k >= 1 && i < cn[0] && k < cn[2] {
                    let b = f[idx(i, j + 1, k)];
                    if (a < 0.0) != (b < 0.0) {
                        let q = [cell_vert[cidx(i - 1, j, k - 1)], cell_vert[cidx(i - 1, j, k)], cell_vert[cidx(i, j, k)], cell_vert[cidx(i, j, k - 1)]];
                        push_quad(&mut tris, q, a < 0.0);
                    }
                }
                if k + 1 < n[2] && i >= 1 && j >= 1 && i < cn[0] && j < cn[1] {
                    let b = f[idx(i, j, k + 1)];
                    if (a < 0.0) != (b < 0.0) {
                        let q = [cell_vert[cidx(i - 1, j - 1, k)], cell_vert[cidx(i, j - 1, k)], cell_vert[cidx(i, j, k)], cell_vert[cidx(i - 1, j, k)]];
                        push_quad(&mut tris, q, a < 0.0);
                    }
                }
            }
        }
    }
    TriMesh { pos, tris }
}

fn push_quad(tris: &mut Vec<[u32; 3]>, q: [u32; 4], flip: bool) {
    if q.iter().any(|&v| v == u32::MAX) {
        return;
    }
    let q = if flip { q } else { [q[0], q[3], q[2], q[1]] };
    tris.push([q[0], q[1], q[2]]);
    tris.push([q[0], q[2], q[3]]);
}

impl Kernel for Implicit {
    fn id(&self) -> &'static str { "implicit" }

    fn build(&self, r: &Resolved, o: &BuildOpts) -> Result<Built, KError> {
        let mut body: Option<Node> = None;
        let mut named: std::collections::BTreeMap<String, usize> = Default::default();
        let mut leaves: Vec<Node> = Vec::new(); // rebuilt clones are avoided by re-deriving from ops
        let _ = &mut leaves;
        let mk = |op: &ROp| -> Result<Node, KError> {
            match op {
                ROp::Extrude { frame, region, depth, .. } => {
                    let (z0, z1) = if *depth >= 0.0 { (0.0, *depth) } else { (*depth, 0.0) };
                    Ok(Node::Leaf(Field::Extrude { frame: frame.clone(), poly: Poly2::new(region), z0, z1 }))
                }
                ROp::Revolve { id, frame, region, axis_p, axis_d, angle_deg, .. } => {
                    if (angle_deg - 360.0).abs() > 1e-9 {
                        return Err(KError::unsupported(id, "partial revolve"));
                    }
                    let l = (axis_d[0] * axis_d[0] + axis_d[1] * axis_d[1]).sqrt();
                    let d = [axis_d[0] / l, axis_d[1] / l];
                    let mut perp = [-d[1], d[0]];
                    // perp must point toward the profile: test the point farthest
                    // off the axis (a point on the axis says nothing)
                    let far = region.loops[0]
                        .sample(1e-3)
                        .into_iter()
                        .max_by(|a, b| {
                            let da = ((a[0] - axis_p[0]) * perp[0] + (a[1] - axis_p[1]) * perp[1]).abs();
                            let db = ((b[0] - axis_p[0]) * perp[0] + (b[1] - axis_p[1]) * perp[1]).abs();
                            da.partial_cmp(&db).unwrap()
                        })
                        .unwrap();
                    if (far[0] - axis_p[0]) * perp[0] + (far[1] - axis_p[1]) * perp[1] < 0.0 {
                        perp = [-perp[0], -perp[1]];
                    }
                    Ok(Node::Leaf(Field::Revolve { frame: frame.clone(), poly: Poly2::new(region), axis_p: *axis_p, axis_d: d, perp }))
                }
                _ => unreachable!(),
            }
        };
        let mut solids: Vec<Node> = Vec::new();
        for op in &r.ops {
            match op {
                ROp::Extrude { id, mode, .. } | ROp::Revolve { id, mode, .. } => {
                    let node = mk(op)?;
                    named.insert(id.clone(), solids.len());
                    // keep an evaluable copy for later booleans by rebuilding from the op
                    solids.push(mk(op)?);
                    body = Some(match (body, mode.as_str()) {
                        (None, _) | (_, "new") => node,
                        (Some(b), "add") => Node::Union(Box::new(b), Box::new(node)),
                        (Some(b), "cut") => Node::Cut(Box::new(b), Box::new(node)),
                        (Some(b), "intersect") => Node::Inter(Box::new(b), Box::new(node)),
                        (_, m) => return Err(KError::fail(id, format!("unknown mode `{m}`"))),
                    });
                }
                ROp::Boolean { id, kind, a, b } => {
                    let ia = *named.get(a).ok_or_else(|| KError::fail(id, format!("unknown solid `{a}`")))?;
                    let ib = *named.get(b).ok_or_else(|| KError::fail(id, format!("unknown solid `{b}`")))?;
                    let ra = r.ops.iter().find(|o| o.id() == a).unwrap();
                    let rb = r.ops.iter().find(|o| o.id() == b).unwrap();
                    let _ = (ia, ib);
                    let (na, nb) = (mk(ra)?, mk(rb)?);
                    let node = match kind.as_str() {
                        "union" => Node::Union(Box::new(na), Box::new(nb)),
                        "cut" => Node::Cut(Box::new(na), Box::new(nb)),
                        "intersect" => Node::Inter(Box::new(na), Box::new(nb)),
                        k => return Err(KError::fail(id, format!("unknown boolean `{k}`"))),
                    };
                    named.insert(id.clone(), solids.len());
                    solids.push(mk(ra)?);
                    body = Some(node);
                }
                ROp::Fillet { id, .. } => return Err(KError::unsupported(id, "fillet (planned: smooth-min)")),
                ROp::Chamfer { id, .. } => return Err(KError::unsupported(id, "chamfer")),
                ROp::Shell { id, .. } => return Err(KError::unsupported(id, "shell (planned: |d| - t)")),
            }
        }
        let body = body.ok_or_else(|| KError::fail("tree", "no solid-producing feature"))?;
        let mesh = surface_nets(&body, o.res.max(8));
        Ok(Built { mesh, faces: Vec::new(), step: None })
    }
}
