// mappa-engine — the FULL world engine in Rust/WASM.
//
// A line-for-line port of mappa/engine.js (the JS reference): spherical mesh
// (Fibonacci sampling, adaptive density on warped plate boundaries, Delaunay via
// `delaunator`, ghost-pole stitch, spherical Voronoi) → random plates as Euler
// rotors → tectonics → elevation → water-volume sea level → hydraulic erosion →
// climate (temperature/moisture/seasonality) → Whittaker biomes → rivers/lakes.
//
// generate_world(seed, n) returns the world as flat arrays (CSR for the variable
// length cells/adjacency) which the viewer unpacks. The JS engine stays as a
// fallback and the lower-res reference. `triangulate_xy` is kept for the
// triangulation-only path.

use serde::Serialize;
use wasm_bindgen::prelude::*;
use delaunator::{triangulate as delaunay, Point};
use std::collections::BTreeMap; // BTreeMap (not HashMap) → deterministic iteration order

// ---- math -------------------------------------------------------------------
type V3 = [f64; 3];
#[inline] fn sub(a: V3, b: V3) -> V3 { [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
#[inline] fn dot(a: V3, b: V3) -> f64 { a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
#[inline] fn cross(a: V3, b: V3) -> V3 { [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]] }
#[inline] fn norm(a: V3) -> V3 { let l = (a[0]*a[0]+a[1]*a[1]+a[2]*a[2]).sqrt().max(1e-30); [a[0]/l, a[1]/l, a[2]/l] }

// ---- prng (mulberry32, u32 arithmetic mirrors JS) ---------------------------
struct Rng { a: u32 }
impl Rng {
    fn new(seed: u32) -> Self { Rng { a: seed } }
    fn next(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6D2B79F5);
        let mut t = (self.a ^ (self.a >> 15)).wrapping_mul(1 | self.a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

// ---- 3D value noise ---------------------------------------------------------
fn h3(i: i32, j: i32, k: i32, s: i32) -> f64 {
    let mut n = i.wrapping_mul(374761393)
        .wrapping_add(j.wrapping_mul(668265263))
        .wrapping_add(k.wrapping_mul(1610612741))
        .wrapping_add(s.wrapping_mul(69069));
    n = (n ^ ((n as u32 >> 13) as i32)).wrapping_mul(1274126177);
    n = n ^ ((n as u32 >> 16) as i32);
    (n as u32) as f64 / 4294967296.0
}
#[inline] fn smooth(t: f64) -> f64 { t*t*(3.0-2.0*t) }
fn vn3(x: f64, y: f64, z: f64, s: i32) -> f64 {
    let (x0, y0, z0) = (x.floor() as i32, y.floor() as i32, z.floor() as i32);
    let (fx, fy, fz) = (smooth(x-x0 as f64), smooth(y-y0 as f64), smooth(z-z0 as f64));
    let l = |a: f64, b: f64, t: f64| a*(1.0-t)+b*t;
    let c000=h3(x0,y0,z0,s); let c100=h3(x0+1,y0,z0,s);
    let c010=h3(x0,y0+1,z0,s); let c110=h3(x0+1,y0+1,z0,s);
    let c001=h3(x0,y0,z0+1,s); let c101=h3(x0+1,y0,z0+1,s);
    let c011=h3(x0,y0+1,z0+1,s); let c111=h3(x0+1,y0+1,z0+1,s);
    l(l(l(c000,c100,fx), l(c010,c110,fx), fy), l(l(c001,c101,fx), l(c011,c111,fx), fy), fz)
}
fn fbm3(x: f64, y: f64, z: f64, s: i32) -> f64 {
    let mut v=0.0; let mut a=0.5; let mut f=1.0;
    for o in 0..5 { v += a*vn3(x*f, y*f, z*f, s + o*131); f*=2.0; a*=0.5; }
    v
}

// ---- min-heap for priority-flood / dijkstra ---------------------------------
struct MinHeap { a: Vec<(f64, u32)> }
impl MinHeap {
    fn new() -> Self { MinHeap { a: Vec::new() } }
    fn len(&self) -> usize { self.a.len() }
    fn push(&mut self, k: f64, v: u32) {
        self.a.push((k, v));
        let mut i = self.a.len() - 1;
        while i > 0 { let p = (i-1)/2; if self.a[p].0 <= self.a[i].0 { break } self.a.swap(p, i); i = p; }
    }
    fn pop(&mut self) -> (f64, u32) {
        let top = self.a[0];
        let last = self.a.pop().unwrap();
        if !self.a.is_empty() {
            self.a[0] = last;
            let mut i = 0;
            loop {
                let (l, r) = (2*i+1, 2*i+2);
                let mut s = i;
                if l < self.a.len() && self.a[l].0 < self.a[s].0 { s = l; }
                if r < self.a.len() && self.a[r].0 < self.a[s].0 { s = r; }
                if s == i { break }
                self.a.swap(s, i); i = s;
            }
        }
        top
    }
}

// ---- biome classification (Whittaker) ---------------------------------------
// indices match engine.js BIOMES order
const B_OCEAN_DEEP: u8=0; const B_OCEAN_SHELF: u8=1; const B_LAKE: u8=2;
const B_ICE: u8=3; const B_TUNDRA: u8=4; const B_TAIGA: u8=5; const B_COLD_DESERT: u8=6;
const B_STEPPE: u8=7; const B_TEMP_FOR: u8=8; const B_TEMP_RAIN: u8=9; const B_DESERT: u8=10;
const B_SAVANNA: u8=11; const B_TROP_SEAS: u8=12; const B_TROP_RAIN: u8=13; const B_ALPINE: u8=14; const B_SNOW: u8=15;
fn classify(t: f64, m: f64, e_above: f64) -> u8 {
    if e_above > 0.72 { return if t < 1.0 { B_SNOW } else { B_ALPINE }; }
    if t < -12.0 { return B_ICE; }
    if t < 0.0 { return if m < 0.30 { B_COLD_DESERT } else { B_TUNDRA }; }
    if t < 7.0 { return if m < 0.25 { B_COLD_DESERT } else if m < 0.5 { B_STEPPE } else { B_TAIGA }; }
    if t < 20.0 { return if m < 0.2 { B_DESERT } else if m < 0.42 { B_STEPPE } else if m < 0.7 { B_TEMP_FOR } else { B_TEMP_RAIN }; }
    if m < 0.2 { B_DESERT } else if m < 0.42 { B_SAVANNA } else if m < 0.65 { B_TROP_SEAS } else { B_TROP_RAIN }
}

#[derive(Serialize)]
struct Meta { seed: u32, n: usize, plate_count: usize, ocean_fraction: f64,
    water_frac: f64, sea_coverage: f64, axial_tilt: f64, axial_tilt_deg: i32 }

#[derive(Serialize)]
struct World {
    n: usize,
    meta: Meta,
    positions: Vec<f32>,      // n*3
    cell_verts: Vec<f32>,     // flat vec3 of all cell polygon vertices
    cell_offsets: Vec<u32>,   // n+1 (CSR, in vec3 units)
    adj: Vec<u32>,            // flat neighbour indices
    adj_offsets: Vec<u32>,    // n+1
    elev: Vec<f32>,
    water: Vec<u8>,
    plate: Vec<u32>,
    plate_type: Vec<u8>,
    temperature: Vec<f32>,
    moisture: Vec<f32>,
    seasonality: Vec<f32>,
    biome: Vec<u8>,
    rivers: Vec<f32>,         // 8 per: ax,ay,az,bx,by,bz,w,flow
    bounds: Vec<f32>,         // 7 per: ax,ay,az,bx,by,bz,conv
    plates_out: Vec<f32>,     // 8 per: cx,cy,cz,ax,ay,az,speed,oceanic
}

struct Plate { center: V3, oceanic: bool, axis: V3, speed: f64, buoy: f64 }

fn build(seed: u32, target_n: usize) -> World {
    let mut rng = Rng::new(seed);
    let ga = std::f64::consts::PI * (3.0 - 5.0_f64.sqrt());
    let ocean_fraction = 0.58 + rng.next()*0.12;
    let axial_tilt = 0.12 + rng.next()*0.47;

    // plates first
    let plate_count = 12 + (rng.next()*10.0).floor() as usize; // 12..21
    let mut plates: Vec<Plate> = Vec::with_capacity(plate_count);
    for _ in 0..plate_count {
        let c = norm([rng.next()*2.0-1.0, rng.next()*2.0-1.0, rng.next()*2.0-1.0]);
        plates.push(Plate {
            center: c,
            oceanic: rng.next() < ocean_fraction,
            axis: norm([rng.next()-0.5, rng.next()-0.5, rng.next()-0.5]),
            speed: 0.4 + rng.next()*1.0,
            buoy: 0.12 + rng.next()*0.30,
        });
    }
    let top2 = |p: V3, plates: &Vec<Plate>| -> (f64, f64, usize) {
        let (mut d1, mut d2, mut k1) = (-2.0, -2.0, 0usize);
        for (s, pl) in plates.iter().enumerate() {
            let d = p[0]*pl.center[0] + p[1]*pl.center[1] + p[2]*pl.center[2];
            if d > d1 { d2 = d1; d1 = d; k1 = s; } else if d > d2 { d2 = d; }
        }
        (d1, d2, k1)
    };
    let warp = |p: V3| -> V3 {
        let (f, g, ampa, ampb) = (2.6, 6.3, 0.34, 0.14);
        let x = p[0] + (fbm3(p[0]*f,p[1]*f,p[2]*f, seed as i32+201)-0.5)*ampa + (fbm3(p[0]*g,p[1]*g,p[2]*g, seed as i32+204)-0.5)*ampb;
        let y = p[1] + (fbm3(p[0]*f,p[1]*f,p[2]*f, seed as i32+202)-0.5)*ampa + (fbm3(p[0]*g,p[1]*g,p[2]*g, seed as i32+205)-0.5)*ampb;
        let z = p[2] + (fbm3(p[0]*f,p[1]*f,p[2]*f, seed as i32+203)-0.5)*ampa + (fbm3(p[0]*g,p[1]*g,p[2]*g, seed as i32+206)-0.5)*ampb;
        norm([x, y, z])
    };

    // adaptive sampling
    let rot_a = rng.next()*6.283;
    let m = (target_n as f64 * 2.1).round() as usize;
    let mut vv: Vec<V3> = Vec::new();
    let mut plate_raw: Vec<u32> = Vec::new();
    for i in 0..m {
        let z = 1.0 - (2.0*i as f64 + 1.0)/m as f64;
        let r = (1.0 - z*z).max(0.0).sqrt();
        let th = ga*i as f64 + rot_a;
        let p = [r*th.cos(), r*th.sin(), z];
        let t = top2(warp(p), &plates);
        let bp = (-(t.0 - t.1)/0.035).exp();
        let base = if plates[t.2].oceanic { 0.12 } else { 0.52 };
        if rng.next() < (base + bp*0.78).min(1.0) {
            vv.push(p);
            plate_raw.push(t.2 as u32);
        }
    }
    let n = vv.len();

    // spherical Delaunay/Voronoi
    let pts: Vec<Point> = vv.iter().map(|p| Point { x: p[0]/(1.0-p[2]), y: p[1]/(1.0-p[2]) }).collect();
    let tri = delaunay(&pts);
    let tri_r = &tri.triangles; // flat, 3 per
    let mut ecount: BTreeMap<(u32,u32), u32> = BTreeMap::new();
    let ek = |a: u32, b: u32| if a < b { (a, b) } else { (b, a) };
    let nt = tri_r.len()/3;
    for t in 0..nt {
        let (a, b, c) = (tri_r[3*t] as u32, tri_r[3*t+1] as u32, tri_r[3*t+2] as u32);
        for &(u, w) in &[(a,b),(b,c),(c,a)] { *ecount.entry(ek(u,w)).or_insert(0) += 1; }
    }
    // tris (incl ghost pole = index n)
    let gh = n as u32;
    let mut tris: Vec<[u32;3]> = Vec::with_capacity(nt + 64);
    for t in 0..nt { tris.push([tri_r[3*t] as u32, tri_r[3*t+1] as u32, tri_r[3*t+2] as u32]); }
    for (&(a,b), &c) in &ecount { if c == 1 { tris.push([a, b, gh]); } }
    // points incl ghost
    let mut pv: Vec<V3> = vv.clone();
    pv.push([0.0, 0.0, 1.0]);
    // circumcentres
    let cc: Vec<V3> = tris.iter().map(|t| {
        let mut c = norm(cross(sub(pv[t[1] as usize], pv[t[0] as usize]), sub(pv[t[2] as usize], pv[t[0] as usize])));
        let cen = [pv[t[0] as usize][0]+pv[t[1] as usize][0]+pv[t[2] as usize][0],
                   pv[t[0] as usize][1]+pv[t[1] as usize][1]+pv[t[2] as usize][1],
                   pv[t[0] as usize][2]+pv[t[1] as usize][2]+pv[t[2] as usize][2]];
        if dot(c, cen) < 0.0 { c = [-c[0], -c[1], -c[2]]; }
        c
    }).collect();
    // incidence, adjacency, edge→tris
    let mut inc: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut adj_set: Vec<Vec<u32>> = vec![Vec::new(); n];
    let mut e2t: BTreeMap<(u32,u32), Vec<usize>> = BTreeMap::new();
    for (ti, t) in tris.iter().enumerate() {
        for &v in t.iter() { if (v as usize) < n { inc[v as usize].push(ti); } }
        for a in 0..3 {
            let u = t[a]; let w = t[(a+1)%3];
            if (u as usize) < n && (w as usize) < n {
                if !adj_set[u as usize].contains(&w) { adj_set[u as usize].push(w); }
                if !adj_set[w as usize].contains(&u) { adj_set[w as usize].push(u); }
                e2t.entry(ek(u,w)).or_insert_with(Vec::new).push(ti);
            }
        }
    }
    // cells (ordered circumcentres)
    let mut cells: Vec<Vec<V3>> = vec![Vec::new(); n];
    for i in 0..n {
        let p = vv[i];
        let e1 = norm(cross(p, if p[2].abs() < 0.9 { [0.0,0.0,1.0] } else { [1.0,0.0,0.0] }));
        let e2 = cross(p, e1);
        let mut cs: Vec<(f64, V3)> = inc[i].iter().map(|&ti| {
            let c = cc[ti];
            ((dot(c, e2)).atan2(dot(c, e1)), c)
        }).collect();
        cs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        cells[i] = cs.into_iter().map(|x| x.1).collect();
    }

    // plate assignment
    let plate: Vec<u32> = plate_raw;
    let ptype = |i: usize| plates[plate[i] as usize].oceanic;
    let vel = |i: usize| {
        let pl = &plates[plate[i] as usize];
        let c = cross(pl.axis, vv[i]);
        [c[0]*pl.speed, c[1]*pl.speed, c[2]*pl.speed]
    };

    // tectonics
    let mut conv = vec![0.0f64; n];
    let mut mount_src = vec![0.0f64; n];
    let mut local_f = vec![0.0f64; n];
    for i in 0..n {
        let (mut cs, mut nn, mut mt, mut lf) = (0.0, 0u32, 0.0, 0.0);
        let oi = ptype(i); let vi = vel(i);
        for &jj in &adj_set[i] {
            let j = jj as usize;
            if plate[j] == plate[i] { continue; }
            let oj = ptype(j);
            let dir = norm(sub(vv[j], [vv[i][0]*dot(vv[i],vv[j]), vv[i][1]*dot(vv[i],vv[j]), vv[i][2]*dot(vv[i],vv[j])]));
            let vj = vel(j);
            let rel = dot([vi[0]-vj[0], vi[1]-vj[1], vi[2]-vj[2]], dir);
            cs += rel; nn += 1;
            if rel > 0.0 {
                if !oi && !oj { mt += rel*1.0; }
                else if !oi && oj { mt += rel*0.7; }
                else if oi && !oj { lf -= rel*1.15; }
                else { let volc = fbm3(vv[i][0]*9.3, vv[i][1]*9.3, vv[i][2]*9.3, seed as i32+71); lf += rel*(if volc>0.64 {0.55} else {0.04}); }
            } else {
                let dv = -rel;
                if oi { lf += dv*0.35; } else { lf -= dv*0.45; }
            }
        }
        if nn > 0 { conv[i] = cs/nn as f64; if !oi && mt > 0.0 { mount_src[i] = mt; } local_f[i] = lf; }
    }
    // diffuse mountains over continental cells
    let mut mf = mount_src.clone();
    for _ in 0..3 {
        let mut nf = mf.clone();
        for i in 0..n {
            if ptype(i) { continue; }
            let mut mx = mf[i];
            for &jj in &adj_set[i] { let j = jj as usize; if !ptype(j) { mx = mx.max(mf[j]*0.66); } }
            nf[i] = mx;
        }
        mf = nf;
    }

    // elevation
    let mut elev_raw = vec![0.0f64; n];
    for i in 0..n {
        let p = vv[i]; let oi = ptype(i); let pl = &plates[plate[i] as usize];
        let gd = dot(p, pl.center).clamp(-1.0, 1.0).acos();
        let noise = (fbm3(p[0]*2.0, p[1]*2.0, p[2]*2.0, seed as i32)-0.5)*(if oi {0.30} else {0.22});
        if !oi {
            let craton = pl.buoy*(-(gd*gd)/(2.0*0.5*0.5)).exp();
            elev_raw[i] = 0.10 + craton + mf[i]*0.6 + local_f[i]*0.5 + noise;
        } else {
            elev_raw[i] = -0.55 + mf[i]*0.55 + local_f[i]*0.6 + noise;
        }
    }

    // cell areas (spherical Voronoi)
    let tri_area = |a: V3, b: V3, c: V3| -> f64 {
        let bc = cross(b, c);
        2.0*(dot(a, bc).abs()).atan2(1.0 + dot(a,b) + dot(b,c) + dot(c,a))
    };
    let mut area = vec![0.0f64; n];
    for i in 0..n {
        let c = &cells[i]; let mut s = 0.0;
        let k = c.len();
        for j in 0..k { s += tri_area(vv[i], c[j], c[(j+1)%k]); }
        area[i] = s;
    }

    // sea level by water volume
    let water_frac = 0.10 + rng.next()*0.10;
    let sea_level_by_volume = |elev_raw: &Vec<f64>, area: &Vec<f64>| -> f64 {
        let mut e_min = 1e9; let mut e_max = -1e9;
        for i in 0..n { if elev_raw[i] < e_min { e_min = elev_raw[i]; } if elev_raw[i] > e_max { e_max = elev_raw[i]; } }
        let wv = |h: f64| -> f64 { let mut v=0.0; for i in 0..n { let d=h-elev_raw[i]; if d>0.0 { v += area[i]*d; } } v };
        let vt = wv(e_max)*water_frac;
        let (mut lo, mut hi) = (e_min, e_max);
        for _ in 0..40 { let mid=(lo+hi)/2.0; if wv(mid) < vt { lo=mid; } else { hi=mid; } }
        (lo+hi)/2.0
    };
    let mut sl = sea_level_by_volume(&elev_raw, &area);

    // hydraulic erosion
    {
        let (carve, diff, iter) = (0.16, 0.10, 4);
        for _ in 0..iter {
            let mut fl = elev_raw.clone();
            let mut iq = vec![false; n];
            let mut hp = MinHeap::new();
            for i in 0..n { if elev_raw[i] <= sl { iq[i]=true; hp.push(fl[i], i as u32); } }
            while hp.len() > 0 {
                let (e, iu) = hp.pop(); let i = iu as usize;
                for &jj in &adj_set[i] { let j = jj as usize; if iq[j] { continue; } fl[j] = elev_raw[j].max(e + 1e-5); iq[j]=true; hp.push(fl[j], jj); }
            }
            let mut dn = vec![-1i64; n];
            for i in 0..n { if elev_raw[i] <= sl { continue; } let mut lo_e = fl[i]; let mut bj=-1i64; for &jj in &adj_set[i] { let j=jj as usize; if fl[j]<lo_e { lo_e=fl[j]; bj=jj as i64; } } dn[i]=bj; }
            let mut ord: Vec<usize> = (0..n).filter(|&i| elev_raw[i] > sl).collect();
            ord.sort_by(|&a, &b| fl[b].partial_cmp(&fl[a]).unwrap_or(std::cmp::Ordering::Equal));
            let mut drain = area.clone();
            for &i in &ord { let j = dn[i]; if j >= 0 { drain[j as usize] += drain[i]; } }
            let mut max_d = 1e-9; for i in 0..n { if drain[i] > max_d { max_d = drain[i]; } }
            let mut ne = elev_raw.clone();
            for &i in &ord { ne[i] = elev_raw[i] - carve*(drain[i]/max_d).powf(0.35); }
            for i in 0..n {
                if elev_raw[i] <= sl { continue; }
                let mut s=0.0; let mut c=0.0;
                for &jj in &adj_set[i] { s += ne[jj as usize]; c += 1.0; }
                if c > 0.0 { ne[i] += diff*(s/c - ne[i]); }
            }
            elev_raw = ne;
        }
        sl = sea_level_by_volume(&elev_raw, &area);
    }

    // elevation relative to shore + mild hypsometry
    let mut elev = vec![0.0f64; n];
    for i in 0..n { elev[i] = elev_raw[i] - sl; }
    let mut land_max = 1e-6; for i in 0..n { if elev[i] > land_max { land_max = elev[i]; } }
    for i in 0..n { if elev[i] > 0.0 { elev[i] = (elev[i]/land_max).powf(1.5)*0.95; } }
    let mut water = vec![0u8; n];
    for i in 0..n { water[i] = if elev[i] > 0.0 { 0 } else { 1 }; }

    // rivers + lakes
    let mut rivers8: Vec<[f32; 8]> = Vec::new();
    {
        let mut fl = elev.clone();
        let mut iq = vec![false; n];
        let mut hp = MinHeap::new();
        for i in 0..n { if water[i] != 0 { iq[i]=true; hp.push(fl[i], i as u32); } }
        while hp.len() > 0 {
            let (e, iu) = hp.pop(); let i = iu as usize;
            for &jj in &adj_set[i] { let j = jj as usize; if iq[j] { continue; } fl[j] = elev[j].max(e + 1e-4); iq[j]=true; hp.push(fl[j], jj); }
        }
        for i in 0..n { if water[i]==0 && fl[i]-elev[i] > 0.02 { water[i]=2; } }
        let mut dn = vec![-1i64; n];
        for i in 0..n { if water[i]==1 { continue; } let mut lo_e=fl[i]; let mut bj=-1i64; for &jj in &adj_set[i] { let j=jj as usize; if fl[j]<lo_e { lo_e=fl[j]; bj=jj as i64; } } dn[i]=bj; }
        let mut ord: Vec<usize> = (0..n).filter(|&i| water[i] != 1).collect();
        ord.sort_by(|&a, &b| fl[b].partial_cmp(&fl[a]).unwrap_or(std::cmp::Ordering::Equal));
        let mut flow = vec![0.0f64; n];
        for i in 0..n { if water[i] != 1 { flow[i]=1.0; } }
        for &i in &ord { let j = dn[i]; if j >= 0 && water[j as usize] != 1 { flow[j as usize] += flow[i]; } }
        for &i in &ord {
            if water[i] != 0 { continue; }
            let j = dn[i];
            if j >= 0 && flow[i] > 18.0 {
                let a = vv[i]; let b = vv[j as usize];
                let w = (0.6 + flow[i].sqrt()/6.0).min(5.0);
                rivers8.push([a[0] as f32, a[1] as f32, a[2] as f32, b[0] as f32, b[1] as f32, b[2] as f32, w as f32, flow[i] as f32]);
            }
        }
    }

    // climate
    let mut dist_sea = vec![-1i32; n];
    let mut q: Vec<usize> = Vec::new();
    for i in 0..n { if water[i]==1 { dist_sea[i]=0; q.push(i); } }
    let mut head = 0;
    while head < q.len() {
        let i = q[head]; head += 1;
        for &jj in &adj_set[i] { let j = jj as usize; if dist_sea[j] < 0 { dist_sea[j] = dist_sea[i]+1; q.push(j); } }
    }
    let mut max_d = 1; for i in 0..n { if dist_sea[i] > max_d { max_d = dist_sea[i]; } }
    let mut temperature = vec![0.0f64; n];
    let mut moisture = vec![0.0f64; n];
    let mut seasonality = vec![0.0f64; n];
    let mut biome = vec![0u8; n];
    for i in 0..n {
        let la = vv[i][2].clamp(-1.0,1.0).asin();
        let alat = la.abs()/(std::f64::consts::PI/2.0);
        let mut t = 28.0 - 45.0*alat.powf(1.25);
        if water[i]==0 { t -= elev[i].max(0.0)*42.0; }
        t += (fbm3(vv[i][0]*3.0+9.0, vv[i][1]*3.0, vv[i][2]*3.0, seed as i32+5)-0.5)*5.0;
        temperature[i] = t;
        let coast = (-(dist_sea[i] as f64/(3.0_f64).max(max_d as f64*0.5))).exp();
        let band = 0.5 + 0.5*(la*3.0).cos();
        let mm = (coast*0.6 + band*0.45 - elev[i].max(0.0)*0.25
            + (fbm3(vv[i][0]*2.0-4.0, vv[i][1]*2.0, vv[i][2]*2.0, seed as i32+11)-0.5)*0.3).clamp(0.0, 1.0);
        moisture[i] = mm;
        let contl = if water[i]==1 { 0.0 } else { (dist_sea[i] as f64/(3.0_f64).max(max_d as f64*0.5)).min(1.0) };
        let seas = (axial_tilt/0.41) * (8.0 + 34.0*alat.powf(1.1)) * (0.55 + 0.75*contl);
        seasonality[i] = seas;
        let teff = t - 0.32*seas;
        biome[i] = if water[i]==1 { if elev[i] > -0.12 { B_OCEAN_SHELF } else { B_OCEAN_DEEP } }
                   else if water[i]==2 { B_LAKE }
                   else { classify(teff, mm, elev[i]) };
    }

    // bounds (plate-boundary segments)
    let mut bounds: Vec<f32> = Vec::new();
    for (&(a, b), ts) in &e2t {
        if ts.len() != 2 { continue; }
        if plate[a as usize] == plate[b as usize] { continue; }
        let c0 = cc[ts[0]]; let c1 = cc[ts[1]];
        let cv = (conv[a as usize] + conv[b as usize])/2.0;
        bounds.extend_from_slice(&[c0[0] as f32, c0[1] as f32, c0[2] as f32, c1[0] as f32, c1[1] as f32, c1[2] as f32, cv as f32]);
    }

    // ---- pack outputs --------------------------------------------------------
    let mut positions = Vec::with_capacity(n*3);
    for i in 0..n { positions.push(vv[i][0] as f32); positions.push(vv[i][1] as f32); positions.push(vv[i][2] as f32); }
    let mut cell_verts: Vec<f32> = Vec::new();
    let mut cell_offsets: Vec<u32> = Vec::with_capacity(n+1);
    cell_offsets.push(0);
    for i in 0..n { for v in &cells[i] { cell_verts.push(v[0] as f32); cell_verts.push(v[1] as f32); cell_verts.push(v[2] as f32); } cell_offsets.push((cell_verts.len()/3) as u32); }
    let mut adj_flat: Vec<u32> = Vec::new();
    let mut adj_offsets: Vec<u32> = Vec::with_capacity(n+1);
    adj_offsets.push(0);
    for i in 0..n { for &j in &adj_set[i] { adj_flat.push(j); } adj_offsets.push(adj_flat.len() as u32); }
    let elev_f: Vec<f32> = elev.iter().map(|&x| x as f32).collect();
    let temp_f: Vec<f32> = temperature.iter().map(|&x| x as f32).collect();
    let moist_f: Vec<f32> = moisture.iter().map(|&x| x as f32).collect();
    let seas_f: Vec<f32> = seasonality.iter().map(|&x| x as f32).collect();
    let plate_type: Vec<u8> = (0..n).map(|i| if ptype(i) {1} else {0}).collect();
    let mut plates_out: Vec<f32> = Vec::new();
    for pl in &plates {
        plates_out.extend_from_slice(&[pl.center[0] as f32, pl.center[1] as f32, pl.center[2] as f32,
            pl.axis[0] as f32, pl.axis[1] as f32, pl.axis[2] as f32, pl.speed as f32, if pl.oceanic {1.0} else {0.0}]);
    }
    let rivers: Vec<f32> = rivers8.iter().flat_map(|r| r.iter().copied()).collect();

    let mut ocean_a = 0.0; let mut tot_a = 0.0;
    for i in 0..n { tot_a += area[i]; if water[i] != 0 { ocean_a += area[i]; } }

    World {
        n,
        meta: Meta {
            seed, n, plate_count,
            ocean_fraction: (ocean_fraction*1000.0).round()/1000.0,
            water_frac: (water_frac*1000.0).round()/1000.0,
            sea_coverage: (ocean_a/tot_a*1000.0).round()/1000.0,
            axial_tilt: (axial_tilt*1000.0).round()/1000.0,
            axial_tilt_deg: (axial_tilt*180.0/std::f64::consts::PI).round() as i32,
        },
        positions, cell_verts, cell_offsets, adj: adj_flat, adj_offsets,
        elev: elev_f, water, plate, plate_type,
        temperature: temp_f, moisture: moist_f, seasonality: seas_f, biome,
        rivers, bounds, plates_out,
    }
}

// ---- wasm API ---------------------------------------------------------------
#[wasm_bindgen]
pub fn generate_world(seed: u32, n: u32) -> Result<JsValue, JsValue> {
    let w = build(seed, (n as usize).clamp(500, 60000));
    serde_wasm_bindgen::to_value(&w).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn triangulate_xy(coords: &[f64]) -> Vec<u32> {
    let pts: Vec<Point> = coords.chunks_exact(2).map(|c| Point { x: c[0], y: c[1] }).collect();
    if pts.len() < 3 { return Vec::new(); }
    delaunay(&pts).triangles.iter().map(|&i| i as u32).collect()
}

#[wasm_bindgen]
pub fn engine_version() -> u32 { 2 }
