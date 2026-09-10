//! cad — the headless CLI.
//!
//!   cad build   <tree.json> [--kernel truck|implicit] [--tol T] [--res N] [--stl F] [--step F] [--json F]
//!   cad check   <tree.json>            parse + resolve; list ops and sketches; exit 1 on error
//!   cad measure <tree.json> [...]      build and print invariants only
//!   cad resolve <tree.json> [--tol T]  the resolved op list with sampled polylines (for foreign kernels)
//!   cad diff    <a.json> <b.json>      semantic diff of two trees
//!   cad stepmeasure <file.step>        read a STEP back (native, --features stepin), mesh it, print invariants

use cad_engine::kernel::BuildOpts;
use std::collections::BTreeMap;

fn arg(args: &[String], flag: &str) -> Option<String> {
    args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: cad <build|check|measure|resolve|diff> <tree.json> [options]");
        std::process::exit(2);
    }
    let cmd = args[1].as_str();
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| {
        eprintln!("cannot read {p}: {e}");
        std::process::exit(2)
    });
    let kernel = arg(&args, "--kernel").unwrap_or_else(|| "truck".into());
    let mut opts = BuildOpts::default();
    if let Some(t) = arg(&args, "--tol") {
        opts.tol = t.parse().expect("--tol");
        opts.bool_tol = opts.tol;
    }
    if let Some(t) = arg(&args, "--bool-tol") {
        opts.bool_tol = t.parse().expect("--bool-tol");
    }
    if let Some(r) = arg(&args, "--res") {
        opts.res = r.parse().expect("--res");
    }
    let step_path = arg(&args, "--step");
    opts.want_step = step_path.is_some();

    match cmd {
        "check" => {
            let json = read(&args[2]);
            let tree = match cad_engine::tree::parse(&json) {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("✗ {e}");
                    std::process::exit(1)
                }
            };
            match cad_engine::tree::resolve(&tree) {
                Ok(r) => {
                    println!("✓ {} features → {} sketches, {} ops", tree.features.len(), r.sketches.len(), r.ops.len());
                    for (k, v) in &r.params {
                        println!("  {k} = {v}");
                    }
                    for s in &r.sketches {
                        println!("  sketch {}: {} loops, area {:.4}", s.id, s.region.loops.len(), s.region.area());
                    }
                    for o in &r.ops {
                        println!("  {}:{}", o.op(), o.id());
                    }
                }
                Err(e) => {
                    eprintln!("✗ {e}");
                    std::process::exit(1)
                }
            }
        }
        "build" | "measure" => {
            let json = read(&args[2]);
            let (rep, built) = cad_engine::build(&json, &kernel, &opts);
            if cmd == "measure" {
                println!("{}", serde_json::to_string_pretty(&rep.invariants).unwrap());
            } else {
                println!("{}", serde_json::to_string_pretty(&rep).unwrap());
            }
            if let Some(b) = built {
                if let Some(p) = arg(&args, "--stl") {
                    std::fs::write(&p, cad_engine::invariants::stl(&b.mesh)).expect("write stl");
                }
                if let (Some(p), Some(s)) = (step_path, &b.step) {
                    std::fs::write(&p, s).expect("write step");
                }
            }
            if let Some(p) = arg(&args, "--json") {
                std::fs::write(&p, serde_json::to_string_pretty(&rep).unwrap()).expect("write json");
            }
            if !rep.ok {
                std::process::exit(1);
            }
        }
        "resolve" => {
            let json = read(&args[2]);
            match cad_engine::resolve_json(&json, opts.tol) {
                Ok(s) => println!("{s}"),
                Err(e) => {
                    eprintln!("✗ {e}");
                    std::process::exit(1)
                }
            }
        }
        "stepmeasure" => {
            #[cfg(feature = "stepin")]
            {
                let step = read(&args[2]);
                match cad_engine::step_measure(&step, opts.tol) {
                    Ok((inv, shells)) => {
                        let mut v = serde_json::to_value(&inv).unwrap();
                        v["shells"] = serde_json::json!(shells);
                        println!("{}", serde_json::to_string_pretty(&v).unwrap());
                    }
                    Err(e) => {
                        eprintln!("✗ {e}");
                        std::process::exit(1)
                    }
                }
            }
            #[cfg(not(feature = "stepin"))]
            {
                eprintln!("✗ built without `stepin`; rebuild with --features stepin");
                std::process::exit(2)
            }
        }
        "diff" => {
            if args.len() < 4 {
                eprintln!("usage: cad diff a.json b.json");
                std::process::exit(2);
            }
            let a: serde_json::Value = serde_json::from_str(&read(&args[2])).expect("a");
            let b: serde_json::Value = serde_json::from_str(&read(&args[3])).expect("b");
            let mut changes = 0;
            let pa = a.get("params").and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let pb = b.get("params").and_then(|v| v.as_object()).cloned().unwrap_or_default();
            for (k, v) in &pa {
                match pb.get(k) {
                    None => { println!("- param {k} = {v}"); changes += 1 }
                    Some(w) if w != v => { println!("~ param {k}: {v} → {w}"); changes += 1 }
                    _ => {}
                }
            }
            for (k, v) in &pb {
                if !pa.contains_key(k) { println!("+ param {k} = {v}"); changes += 1 }
            }
            let feats = |v: &serde_json::Value| -> BTreeMap<String, serde_json::Value> {
                v.get("features").and_then(|f| f.as_array()).map(|a| a.iter().filter_map(|f| f.get("id").and_then(|i| i.as_str()).map(|i| (i.to_string(), f.clone()))).collect()).unwrap_or_default()
            };
            let (fa, fb) = (feats(&a), feats(&b));
            for (k, v) in &fa {
                match fb.get(k) {
                    None => { println!("- feature {k} ({})", v.get("op").and_then(|o| o.as_str()).unwrap_or("?")); changes += 1 }
                    Some(w) if w != v => {
                        let (oa, ob) = (v.as_object().unwrap(), w.as_object().unwrap());
                        let keys: std::collections::BTreeSet<&String> = oa.keys().chain(ob.keys()).collect();
                        for key in keys {
                            if oa.get(key) != ob.get(key) {
                                println!("~ feature {k}.{key}: {} → {}", oa.get(key).map(|x| x.to_string()).unwrap_or("∅".into()), ob.get(key).map(|x| x.to_string()).unwrap_or("∅".into()));
                            }
                        }
                        changes += 1
                    }
                    _ => {}
                }
            }
            for (k, v) in &fb {
                if !fa.contains_key(k) { println!("+ feature {k} ({})", v.get("op").and_then(|o| o.as_str()).unwrap_or("?")); changes += 1 }
            }
            if changes == 0 {
                println!("= identical");
            }
        }
        _ => {
            eprintln!("unknown command `{cmd}`");
            std::process::exit(2);
        }
    }
}
