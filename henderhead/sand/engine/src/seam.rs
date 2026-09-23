//! Finding the curve in the sand.
//!
//! The whole claim of this page is that the sand *draws* a conic. So the curve
//! has to be read off the simulated height field, with the fitter told nothing
//! about where the pour point and the hole are. Anything else is drawing the
//! answer and then admiring it.
//!
//! # How a seam is found
//!
//! Away from the seam the sand is a piece of one feature's cone, and on a cone
//! the surface gradient points straight at (or straight away from) that
//! feature's apex. So each cell can be asked a purely local question: *of the
//! features on this table, which one is my slope actually aimed at?* That
//! labels every cell with the feature currently shaping it, and the seam is
//! the boundary between labels.
//!
//! This is a measurement, not a prediction: it uses the gradient of the
//! simulated field and the positions of the features, and never the constant
//! `(A-h)/k` that the theory says the seam should satisfy. It also works for
//! every case at once — a ridge between a pile and a funnel, a valley between
//! two piles — because both are places where the label changes.
//!
//! The by-product is worth as much as the seam. The labelling *is* a Voronoi
//! diagram: each cell assigned to the feature that governs it. Henderson's
//! ellipse is one edge of a two-site additively-weighted Voronoi diagram, and
//! that is the reason the whole family of curves is conics — Apollonius
//! bisectors always are.

use crate::field::{Feature, Field, Kind, Shape};

/// Label every cell with the index of the feature whose surface is shaping it.
///
/// A cone's contours are circles about its apex and a funnel's are circles
/// about its hole, so the surface gradient points at whichever feature governs.
/// That is the test: take the measured gradient direction and ask which
/// feature it is aimed at — away from a source, toward a sink.
///
/// It has one blind spot, and it is worth naming because it looks like a bug.
/// On the straight line joining a pour point to a hole, the cone and the
/// funnel both fall toward the hole, so the two are locally indistinguishable
/// and the label there is a coin toss. That is not a defect in the
/// measurement; the two surfaces really are parallel along that line, and they
/// differ only in which way their contours curve. Everywhere off that line the
/// test is decisive, which is why the labels are used to *select* a crease
/// rather than to locate one.
pub fn label(field: &Field, feats: &[Feature], flat: f64) -> Vec<i32> {
    let n = field.n;
    let mut out = vec![-1i32; n * n];
    for y in 0..n {
        for x in 0..n {
            let i = field.idx(x, y);
            if field.h[i] <= 1e-9 {
                continue;
            }
            let (gx, gy) = field.gradient(x, y);
            let g = (gx * gx + gy * gy).sqrt();
            if g < flat {
                continue;
            }
            let (ux, uy) = (-gx / g, -gy / g);
            let mut who = -1i32;
            let mut who_dot = -2.0;
            for (fi, f) in feats.iter().enumerate() {
                if !f.enabled {
                    continue;
                }
                let (tx, ty) = match f.shape {
                    Shape::Point { x: fx, y: fy } => {
                        let (dx, dy) = (x as f64 - fx, y as f64 - fy);
                        let d = (dx * dx + dy * dy).sqrt().max(1e-9);
                        (dx / d, dy / d)
                    }
                    Shape::Line { x: lx, y: ly, nx, ny } => {
                        let sgn = if (x as f64 - lx) * nx + (y as f64 - ly) * ny >= 0.0 {
                            1.0
                        } else {
                            -1.0
                        };
                        (nx * sgn, ny * sgn)
                    }
                };
                let (tx, ty) = if f.kind == Kind::Source { (tx, ty) } else { (-tx, -ty) };
                let dot = ux * tx + uy * ty;
                if dot > who_dot {
                    who_dot = dot;
                    who = fi as i32;
                }
            }
            out[i] = who;
        }
    }
    out
}

/// How sharply the sand bends across the step from one cell to its neighbour.
/// Flat or smoothly curving ground reads near zero; a crest or valley where
/// two surfaces meet reads about `k`.
pub(crate) fn fold_across(f: &Field, x: i32, y: i32, nx: i32, ny: i32, dx: i32, dy: i32) -> f64 {
    let n = f.n as i32;
    let at = |cx: i32, cy: i32| -> Option<f64> {
        let (ax, ay) = (cx - dx, cy - dy);
        let (bx, by) = (cx + dx, cy + dy);
        if ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= n || ay >= n || bx >= n || by >= n {
            return None;
        }
        let ha = f.h[f.idx(ax as usize, ay as usize)];
        let hb = f.h[f.idx(bx as usize, by as usize)];
        let hi = f.h[f.idx(cx as usize, cy as usize)];
        if ha <= 1e-9 || hb <= 1e-9 || hi <= 1e-9 {
            return None;
        }
        Some((hi - (ha + hb) * 0.5).abs())
    };
    at(x, y).unwrap_or(0.0).max(at(nx, ny).unwrap_or(0.0))
}

/// The seam between two features: a boundary between their basins that the
/// sand actually folds along.
///
/// **Both halves are needed, and each fixes the other's blind spot.** That is
/// not obvious, and it cost several wrong turns to establish, so:
///
/// *Labels alone* ask each cell which feature its slope is aimed at. Decisive
/// almost everywhere, and blind exactly where it matters — along the line
/// joining a pour point to a hole the cone and the funnel fall the **same**
/// way, and far out beyond two drains both drains lie in nearly the same
/// direction. In those places the winner is settled by rounding and the
/// labelling lays down a stripe or a wedge of the wrong basin. One run
/// produced 44 spurious "seam" points out of 83, every one at `r1 + r2`
/// exactly equal to the focal separation; another let a wedge at x = 88
/// outvote the true bisector at x = 56.
///
/// *Folds alone* ask the sand where it is bent, which is a fact about the
/// surface rather than an inference about its cause. But a grid leaves a cone
/// faintly faceted, and a facet is a fold too, so this returns a streak down
/// the middle of an untroubled funnel. How faint those facets are depends
/// entirely on the stencil: at eight neighbours they needed a threshold of
/// 0.30 k to reject, and widening to twenty-four weakened them enough to drop
/// it to 0.25 k, which keeps a third more of the real curve.
///
/// Together they are clean: the stripe runs across smooth funnel and has no
/// fold, and the facets lie deep inside one basin and have no boundary. What
/// survives is the curve.
///
/// Two fixes that look equivalent are not. Filling each basin's interior
/// removes the stripe but not the wedges, which touch the outside. Refusing to
/// label near-ties removes both and destroys the two-drain case outright,
/// because for equal drains the tie **is** the answer — their seam is the
/// perpendicular bisector, on which by symmetry neither drain can win.
pub fn trace_between(
    field: &Field,
    labels: &[i32],
    feats: &[Feature],
    a: i32,
    b: i32,
    exclude_r: f64,
) -> Vec<(f64, f64)> {
    let n = field.n as i32;
    let mut pts = Vec::new();
    for y in 0..n {
        for x in 0..n {
            let i = field.idx(x as usize, y as usize);
            if labels[i] != a {
                continue;
            }
            for (dx, dy) in [(1i32, 0i32), (0, 1), (-1, 0), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= n || ny >= n {
                    continue;
                }
                if labels[field.idx(nx as usize, ny as usize)] != b {
                    continue;
                }
                if fold_across(field, x, y, nx, ny, dx, dy) < field.k * field.fold_floor {
                    continue;
                }
                let (mxp, myp) = ((x + nx) as f64 * 0.5, (y + ny) as f64 * 0.5);
                // a drain's own cells are pinned rather than settled, so the
                // lip right at the hole is an artefact of that pinning
                if feats.iter().any(|f| {
                    f.enabled
                        && f.kind == Kind::Sink
                        && matches!(f.shape, Shape::Point { .. })
                        && f.shape.distance(mxp, myp) < exclude_r
                }) {
                    continue;
                }
                pts.push((mxp, myp));
            }
        }
    }
    pts.sort_by(|p, q| p.partial_cmp(q).unwrap());
    pts.dedup_by(|p, q| (p.0 - q.0).abs() < 1e-9 && (p.1 - q.1).abs() < 1e-9);
    largest_component(pts)
}

/// Keep only the biggest connected run of boundary points.
///
/// Out at the rim, where a crater meets the flat plateau it has not reached
/// yet, the surface turns over and the gradient briefly points somewhere
/// unhelpful; the labelling puts down small wedges of the wrong basin. They
/// are nowhere near the seam — in one run they stretched the traced curve from
/// its true width of a few cells to spanning x = 12 to x = 99 on a
/// 113-cell plate — but they are attached to the outside world, so filling the
/// basin's interior does not touch them.
///
/// What separates them from the seam is not their position or their shape but
/// their *size*: the seam is one long connected curve and each wedge is a
/// short detached fleck. So the components are counted and the largest kept.
fn largest_component(pts: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    let n = pts.len();
    if n < 3 {
        return pts;
    }
    let mut comp = vec![usize::MAX; n];
    let mut ncomp = 0usize;
    let mut stack: Vec<usize> = Vec::new();
    for i in 0..n {
        if comp[i] != usize::MAX {
            continue;
        }
        comp[i] = ncomp;
        stack.push(i);
        while let Some(k) = stack.pop() {
            for j in 0..n {
                if comp[j] != usize::MAX {
                    continue;
                }
                let dx = pts[k].0 - pts[j].0;
                let dy = pts[k].1 - pts[j].1;
                // A boundary steps a whole cell at a time; two and a half
                // cells bridges the gap where the curve passes close to a
                // drain and its pinned lip is cut out. Widening it further is
                // a bad trade and was measured to be one: at three and a half
                // cells the parabola's two halves join into one run of 113
                // points instead of 55, and the extra reach also bridges out
                // to a wedge, which moves the fitted eccentricity from 1.001
                // to 1.42. Half a curve measured well beats a whole one
                // measured badly.
                if dx * dx + dy * dy <= 6.25 {
                    comp[j] = ncomp;
                    stack.push(j);
                }
            }
        }
        ncomp += 1;
    }
    let mut counts = vec![0usize; ncomp];
    for &c in &comp {
        counts[c] += 1;
    }
    let best = (0..ncomp).max_by_key(|&c| counts[c]).unwrap_or(0);
    pts.into_iter()
        .zip(comp)
        .filter(|&(_, c)| c == best)
        .map(|(p, _)| p)
        .collect()
}

/// How well the simulated sand obeys its own repose angle, as the fraction of
/// sanded cells standing steeper than it should. A settled table is ~0; a
/// number that stays high means the relaxation has not converged and every
/// curve measured off it is suspect.
pub fn oversteep_fraction(field: &Field) -> f64 {
    let n = field.n as i32;
    let mut over = 0usize;
    let mut total = 0usize;
    for y in 1..n - 1 {
        for x in 1..n - 1 {
            let i = field.idx(x as usize, y as usize);
            if field.h[i] <= 1e-6 {
                continue;
            }
            total += 1;
            let (gx, gy) = field.gradient(x as usize, y as usize);
            if (gx * gx + gy * gy).sqrt() > field.k * 1.15 {
                over += 1;
            }
        }
    }
    if total == 0 {
        0.0
    } else {
        over as f64 / total as f64
    }
}
