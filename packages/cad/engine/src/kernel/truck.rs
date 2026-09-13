//! The Truck adapter: pure-Rust B-rep. Sketch loops become wires of lines,
//! arcs and Béziers; regions become planar faces with holes as inner
//! boundaries; extrude is `tsweep`, revolve is `rsweep`, booleans are
//! `truck_shapeops`. Fillet, chamfer and shell are unsupported — that is the
//! gap the bake-off exists to measure.

use super::{sweep_face_names, BuildOpts, Built, FaceInfo, KError, Kernel, TriMesh};
use crate::sketch::{Loop, Region, Seg};
use crate::tree::{Frame, ROp, Resolved};
use std::collections::BTreeMap;
use truck_meshalgo::prelude::*;
use truck_modeling::*;

// truck_modeling exports its own `Result<T>`; ours carries a String.
type Result<T, E = String> = std::result::Result<T, E>;

pub struct Truck;

type Named = Vec<Vec<String>>;
type Geoms = Vec<Option<super::Geom>>;

fn p3(f: &Frame, p: [f64; 2]) -> Point3 {
    let q = f.to3(p);
    Point3::new(q[0], q[1], q[2])
}

fn wire_of(f: &Frame, l: &Loop) -> Result<Wire, String> {
    let mut pts = vec![l.start];
    for s in &l.segs {
        pts.push(s.end());
    }
    let n = l.segs.len();
    let verts: Vec<Vertex> = (0..n).map(|i| builder::vertex(p3(f, pts[i]))).collect();
    let mut edges = Vec::with_capacity(n);
    for (i, s) in l.segs.iter().enumerate() {
        let v0 = &verts[i];
        let v1 = &verts[(i + 1) % n];
        let e = match s {
            Seg::Line { .. } => builder::line(v0, v1),
            Seg::Arc { via, .. } => builder::circle_arc(v0, v1, p3(f, *via)),
            Seg::Bezier { ctrl, .. } => builder::bezier(v0, v1, ctrl.iter().map(|c| p3(f, *c)).collect()),
        };
        edges.push(e);
    }
    let w: Wire = edges.into_iter().collect();
    if !w.is_closed() {
        return Err("wire is not closed".into());
    }
    Ok(w)
}

/// A planar face for one group (outer loop + holes), normal along `dir`.
fn face_of(f: &Frame, group: &[Loop], dir: Vector3) -> Result<Face, String> {
    let wires: Result<Vec<Wire>, String> = group.iter().map(|l| wire_of(f, l)).collect();
    let mut face = builder::try_attach_plane(&wires?).map_err(|e| format!("attach plane: {e:?}"))?;
    let n = face.oriented_surface().normal(0.0, 0.0);
    if n.dot(dir) < 0.0 {
        face.invert();
    }
    Ok(face)
}

fn v3(a: [f64; 3]) -> Vector3 { Vector3::new(a[0], a[1], a[2]) }

/// What to call a group in an error: its outer loop's name (`bore` from
/// `bore[0]`), else its place in the sketch.
fn group_label(groups: &[Vec<Loop>], i: usize) -> String {
    groups
        .get(i)
        .and_then(|g| g.first())
        .and_then(|outer| outer.names.iter().flatten().next())
        .map(|n| n.split('[').next().unwrap_or(n).to_string())
        .unwrap_or_else(|| format!("loop #{}", i + 1))
}

/// A region with several outer loops is several solids unioned. When the
/// union fails it is almost always a design error — two outlines that
/// overlap or touch — so the message names the two loops, which is what
/// the designer needs to see; the kernel's silence is not.
fn union_all(solids: Vec<Solid>, groups: &[Vec<Loop>], tol: f64, op: &str) -> Result<Solid, KError> {
    let mut it = solids.into_iter().enumerate();
    let (_, mut acc) = it.next().ok_or_else(|| KError::fail(op, "region produced no solid"))?;
    let mut acc_i = 0;
    for (i, s) in it {
        acc = truck_shapeops::or(&acc, &s, tol).ok_or_else(|| {
            KError::fail(
                op,
                format!(
                    "union of outer loops `{}` and `{}` failed — do their outlines overlap or touch? Overlapping outlines must be drawn as one path, or the second made a separate op",
                    group_label(groups, acc_i),
                    group_label(groups, i)
                ),
            )
        })?;
        acc_i = i;
    }
    Ok(acc)
}

fn combine(body: Option<(Solid, Named, Geoms)>, tool: Solid, tool_names: Named, tool_geoms: Geoms, mode: &str, tol: f64, op: &str) -> Result<(Solid, Named, Geoms), KError> {
    match (body, mode) {
        (None, _) | (_, "new") => Ok((tool, tool_names, tool_geoms)),
        (Some((b, _, _)), "add") => {
            let r = truck_shapeops::or(&b, &tool, tol).ok_or_else(|| KError::fail(op, "boolean union failed"))?;
            Ok((r, Vec::new(), Vec::new()))
        }
        (Some((b, _, _)), "cut") => {
            let mut t = builder::clone(&tool);
            t.not();
            let r = truck_shapeops::and(&b, &t, tol).ok_or_else(|| KError::fail(op, "boolean cut failed"))?;
            Ok((r, Vec::new(), Vec::new()))
        }
        (Some((b, _, _)), "intersect") => {
            let r = truck_shapeops::and(&b, &tool, tol).ok_or_else(|| KError::fail(op, "boolean intersect failed"))?;
            Ok((r, Vec::new(), Vec::new()))
        }
        (_, m) => Err(KError::fail(op, format!("unknown mode `{m}`"))),
    }
}
// Faces after a boolean are not tracked through it yet: they get `face[k]`
// and no geometry.

fn extrude(id: &str, frame: &Frame, region: &Region, depth: f64, tol: f64, cut: bool) -> Result<(Solid, Named, Geoms), KError> {
    let groups = region.oriented().map_err(|e| KError::fail(id, e))?;
    let dir = v3(frame.n) * depth.signum();
    // A cut tool is extended by a hair at both ends so its caps never sit
    // exactly on the body's faces — the coplanar-face case no boolean likes.
    // Every production kernel does this internally ("fuzzy" booleans).
    let eps = if cut { tol * 0.1 } else { 0.0 };
    let frame = if cut { frame.offset(-eps * depth.signum()) } else { frame.clone() };
    let frame = &frame;
    let mut solids = Vec::new();
    let mut names = Vec::new();
    let mut geoms = Vec::new();
    for g in &groups {
        let face = face_of(frame, g, dir).map_err(|e| KError::fail(id, e))?;
        solids.push(builder::tsweep(&face, dir * (depth.abs() + 2.0 * eps)));
        names.extend(sweep_face_names(id, region, std::slice::from_ref(g), true));
        geoms.extend(super::extrude_face_geoms(frame, std::slice::from_ref(g), depth));
    }
    let multi = solids.len() > 1;
    let s = union_all(solids, &groups, tol, id)?;
    Ok((s, if multi { Vec::new() } else { names }, if multi { Vec::new() } else { geoms }))
}

/// Distance of a sketch point from the revolve axis, in the sketch plane.
fn off_axis(p: [f64; 2], axis_p: [f64; 2], axis_d: [f64; 2]) -> f64 {
    let l = (axis_d[0] * axis_d[0] + axis_d[1] * axis_d[1]).sqrt();
    ((p[0] - axis_p[0]) * axis_d[1] - (p[1] - axis_p[1]) * axis_d[0]).abs() / l
}

fn revolve(id: &str, frame: &Frame, region: &Region, axis_p: [f64; 2], axis_d: [f64; 2], angle_deg: f64, tol: f64) -> Result<(Solid, Named, Geoms), KError> {
    let groups = region.oriented().map_err(|e| KError::fail(id, e))?;
    let origin = p3(frame, axis_p);
    let d3 = frame.dir3(axis_d);
    let axis = v3(d3).normalize();
    let full = (angle_deg - 360.0).abs() < 1e-9;
    let mut solids = Vec::new();
    let mut names = Vec::new();
    let mut geoms: Geoms = Vec::new();
    for g in &groups {
        // orient from the profile point farthest off the axis (a point on
        // the axis has no sweep direction)
        let sample = g[0]
            .sample(1e-3)
            .into_iter()
            .map(|p| p3(frame, p))
            .max_by(|a, b| axis.cross(*a - origin).magnitude().partial_cmp(&axis.cross(*b - origin).magnitude()).unwrap())
            .unwrap();
        let sweep_dir = axis.cross(sample - origin);
        let dir = if sweep_dir.dot(v3(frame.n)) >= 0.0 { v3(frame.n) } else { -v3(frame.n) };
        // the profile must not cross the axis
        for l in g {
            for p in l.sample(1e-3) {
                let q = p3(frame, p) - origin;
                let side = axis.cross(q).dot(dir);
                if side < -1e-9 {
                    return Err(KError::fail(id, "revolve profile crosses its axis"));
                }
            }
        }
        // Segments lying on the axis sweep to degenerate faces. If the outer
        // loop has any, drop them and revolve the open wire with
        // `builder::cone`, which knows about poles. (Holes in such a profile
        // would be cavities; not supported here.)
        let outer = &g[0];
        let mut ends = vec![outer.start];
        for sg in &outer.segs {
            ends.push(sg.end());
        }
        let on_axis: Vec<bool> = (0..outer.segs.len())
            .map(|i| off_axis(ends[i], axis_p, axis_d) < 1e-9 && off_axis(ends[i + 1], axis_p, axis_d) < 1e-9)
            .collect();
        let n_on = on_axis.iter().filter(|&&b| b).count();
        if n_on > 0 {
            if !full {
                return Err(KError::unsupported(id, "partial revolve of a profile touching the axis"));
            }
            if g.len() > 1 {
                return Err(KError::unsupported(id, "holes in a profile touching the axis"));
            }
            // rotate so the wire starts right after the last on-axis segment
            let n = outer.segs.len();
            let first = (0..n).find(|&i| on_axis[(i + n - 1) % n] && !on_axis[i]).ok_or_else(|| KError::fail(id, "profile is entirely on the axis"))?;
            let order: Vec<usize> = (0..n).map(|k| (first + k) % n).filter(|&i| !on_axis[i]).collect();
            // the CCW loop keeps the region on its left; for a wire running
            // from the axis out and back, the outward normal at each edge is
            // the right-hand normal in the sketch plane
            let mut verts: Vec<Vertex> = Vec::new();
            verts.push(builder::vertex(p3(frame, ends[order[0]])));
            for &i in &order {
                verts.push(builder::vertex(p3(frame, ends[i + 1])));
            }
            let mut edges = Vec::new();
            for (k, &i) in order.iter().enumerate() {
                let (v0, v1) = (&verts[k], &verts[k + 1]);
                edges.push(match &outer.segs[i] {
                    Seg::Line { .. } => builder::line(v0, v1),
                    Seg::Arc { via, .. } => builder::circle_arc(v0, v1, p3(frame, *via)),
                    Seg::Bezier { ctrl, .. } => builder::bezier(v0, v1, ctrl.iter().map(|c| p3(frame, *c)).collect()),
                });
            }
            let wire: Wire = edges.into_iter().collect();
            let shell = builder::cone(&wire, axis, Rad(2.0 * std::f64::consts::PI));
            let mut solid = Solid::new(vec![shell]);
            // outward check on the first face: the right-hand normal of edge order[0]
            let a = ends[order[0]];
            let b = ends[order[0] + 1];
            let e2 = [b[0] - a[0], b[1] - a[1]];
            let out2 = [e2[1], -e2[0]];
            let out3 = v3(frame.dir3(out2));
            let face0 = solid.boundaries()[0][0].clone();
            let surf = face0.oriented_surface();
            let (u, v) = {
                let (ur, vr) = surf.try_range_tuple();
                let ur = ur.unwrap_or((0.0, 1.0));
                let vr = vr.unwrap_or((0.0, 1.0));
                ((ur.0 + ur.1) / 2.0, (vr.0 + vr.1) / 2.0)
            };
            if surf.normal(u, v).dot(out3) < 0.0 {
                solid.not();
            }
            let seg_geoms = super::revolve_seg_geoms(frame, outer, axis_p, axis_d);
            let mut nm: Named = Vec::new();
            for fi in 0..solid.boundaries()[0].len() {
                let seg_i = order[fi % order.len()];
                let mut v = vec![format!("{id}.side[{seg_i}]")];
                if let Some(n) = &outer.names[seg_i] {
                    v.push(format!("{id}.{n}"));
                }
                nm.push(v);
                geoms.push(seg_geoms[seg_i].clone());
            }
            solids.push(solid);
            names.extend(nm);
            continue;
        }
        let face = face_of(frame, g, dir).map_err(|e| KError::fail(id, e))?;
        let ang = Rad(angle_deg.to_radians());
        let solid = builder::rsweep(&face, origin, axis, ang);
        // faces per profile edge (a full revolve splits each into several)
        let n_edges: usize = g.iter().map(|l| l.segs.len()).sum();
        let base = sweep_face_names(id, region, std::slice::from_ref(g), !full);
        let n_faces = solid.boundaries()[0].len();
        let seg_geoms: Geoms = g.iter().flat_map(|l| super::revolve_seg_geoms(frame, l, axis_p, axis_d)).collect();
        let mut nm: Named = Vec::new();
        if full && n_edges > 0 {
            for fi in 0..n_faces {
                nm.push(base[fi % n_edges].clone());
                geoms.push(seg_geoms[fi % n_edges].clone());
            }
        } else {
            nm = base;
            geoms.extend(std::iter::repeat(None).take(n_faces));
        }
        solids.push(solid);
        names.extend(nm);
    }
    let multi = solids.len() > 1;
    let s = union_all(solids, &groups, tol, id)?;
    Ok((s, if multi { Vec::new() } else { names }, if multi { Vec::new() } else { geoms }))
}

fn tessellate(solid: &Solid, tol: f64) -> (TriMesh, Vec<u32>, Vec<(f64, [f64; 3], [f64; 3], Vec<[f64; 3]>)>) {
    let meshed = solid.triangulation(tol);
    // One polygon mesh per face, concatenated, with the face index kept per
    // triangle — the viewer picks a triangle and gets a *name*. Vertices are
    // welded later (invariants::weld), so per-face duplication costs nothing.
    let mut per_face = Vec::new();
    let mut mesh = TriMesh::default();
    let mut face_of_tri: Vec<u32> = Vec::new();
    for (fi, face) in meshed.face_iter().enumerate() {
        let mut area = 0.0;
        let mut nsum = Vector3::zero();
        let mut csum = Vector3::zero();
        let mut sample: Vec<[f64; 3]> = Vec::new();
        if let Some(pm) = face.surface() {
            let pos = pm.positions();
            // a sample of this face's own points: the geometry an op assigned
            // is checked against them, which is the only thing that tells two
            // nearby radii apart (a wedge's centroid cannot)
            let step = (pos.len() / 48).max(1);
            sample.extend(pos.iter().step_by(step).map(|p| [p.x, p.y, p.z]));
            let base = mesh.pos.len() as u32;
            mesh.pos.extend(pos.iter().map(|p| [p.x, p.y, p.z]));
            let flip = !face.orientation();
            let mut push = |a: usize, b: usize, c: usize| {
                let (a, b, c) = if flip { (a, c, b) } else { (a, b, c) };
                let (pa, pb, pc) = (pos[a], pos[b], pos[c]);
                let n = (pb - pa).cross(pc - pa);
                let ta = n.magnitude() / 2.0;
                area += ta;
                nsum += n;
                csum += (pa.to_vec() + pb.to_vec() + pc.to_vec()) / 3.0 * ta;
                mesh.tris.push([base + a as u32, base + b as u32, base + c as u32]);
                face_of_tri.push(fi as u32);
            };
            for t in pm.tri_faces() {
                push(t[0].pos, t[1].pos, t[2].pos);
            }
            for q in pm.quad_faces() {
                push(q[0].pos, q[1].pos, q[2].pos);
                push(q[0].pos, q[2].pos, q[3].pos);
            }
            for f in pm.faces().other_faces() {
                for i in 1..f.len() - 1 {
                    push(f[0].pos, f[i].pos, f[i + 1].pos);
                }
            }
        }
        let n = if nsum.magnitude() > 0.0 { nsum.normalize() } else { nsum };
        let c = if area > 0.0 { csum / area } else { csum };
        per_face.push((area, [n.x, n.y, n.z], [c.x, c.y, c.z], sample));
    }
    (mesh, face_of_tri, per_face)
}

fn step_of(solid: &Solid) -> String {
    use truck_stepio::out;
    let compressed = solid.compress();
    out::CompleteStepDisplay::new(
        out::StepModel::from(&compressed),
        // every field explicit: the Default impl stamps the time via chrono,
        // which on wasm32 needs a JS Date the raw-ABI build does not provide
        out::StepHeaderDescriptor {
            file_name: "part.step".to_owned(),
            time_stamp: "2026-01-01T00:00:00".to_owned(),
            authors: vec!["cad.mino.mobi".to_owned()],
            organization: vec!["minomobi".to_owned()],
            organization_system: "cad-engine".to_owned(),
            authorization: String::new(),
        },
    )
    .to_string()
}

impl Kernel for Truck {
    fn id(&self) -> &'static str { "truck" }

    fn build(&self, r: &Resolved, o: &BuildOpts) -> Result<Built, KError> {
        let mut body: Option<(Solid, Named, Geoms)> = None;
        let mut solids: BTreeMap<String, Solid> = BTreeMap::new();
        for op in &r.ops {
            match op {
                ROp::Extrude { id, frame, region, depth, mode, .. } => {
                    let (s, n, g) = extrude(id, frame, region, *depth, o.bool_tol, mode == "cut")?;
                    solids.insert(id.clone(), builder::clone(&s));
                    body = Some(combine(body, s, n, g, mode, o.bool_tol, id)?);
                }
                ROp::Revolve { id, frame, region, axis_p, axis_d, angle_deg, mode, .. } => {
                    let (s, n, g) = revolve(id, frame, region, *axis_p, *axis_d, *angle_deg, o.bool_tol)?;
                    solids.insert(id.clone(), builder::clone(&s));
                    body = Some(combine(body, s, n, g, mode, o.bool_tol, id)?);
                }
                ROp::Boolean { id, kind, a, b } => {
                    let sa = solids.get(a).ok_or_else(|| KError::fail(id, format!("unknown solid `{a}`")))?;
                    let sb = solids.get(b).ok_or_else(|| KError::fail(id, format!("unknown solid `{b}`")))?;
                    let mode = match kind.as_str() { "union" => "add", "cut" => "cut", "intersect" => "intersect", k => return Err(KError::fail(id, format!("unknown boolean `{k}`"))) };
                    let (s, n, g) = combine(Some((builder::clone(sa), Vec::new(), Vec::new())), builder::clone(sb), Vec::new(), Vec::new(), mode, o.bool_tol, id)?;
                    solids.insert(id.clone(), builder::clone(&s));
                    body = Some((s, n, g));
                }
                ROp::Fillet { id, .. } => return Err(KError::unsupported(id, "fillet")),
                ROp::Chamfer { id, .. } => return Err(KError::unsupported(id, "chamfer")),
                ROp::Shell { id, .. } => return Err(KError::unsupported(id, "shell")),
            }
        }
        let (solid, names, geoms) = body.ok_or_else(|| KError::fail("tree", "no solid-producing feature"))?;
        let (mesh, face_of_tri, per_face) = tessellate(&solid, o.tol);
        let faces = per_face
            .into_iter()
            .enumerate()
            .map(|(i, (area, normal, centroid, sample))| FaceInfo {
                names: names.get(i).cloned().unwrap_or_else(|| vec![format!("face[{i}]")]),
                area,
                normal,
                centroid,
                geom: super::geom_for(&geoms, i, normal, centroid, &sample),
            })
            .collect();
        let step = if o.want_step { Some(step_of(&solid)) } else { None };
        Ok(Built { mesh, faces, step, face_of_tri })
    }
}
