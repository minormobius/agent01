"""The anemometer: the wire's energy balance on the heat-loss matrices heat4.py saved. No flow solves.

A wire across the tube, cold at the wall (w = +-R), carrying a steady current. With theta = alpha (T - T0), alpha the
temperature coefficient of its resistivity (so theta is the fractional rise in local resistance), per length of wire:
    Lam theta'' + P (1 + theta) - Q[theta] = 0
  Lam = (k_wire / k_fluid) * (pi / 6)     conduction along the wire (its section is a 3-ball of volume pi D^3 / 6)
  P   = alpha I^2 rho0 / (A k_fluid D)    the current squared, made dimensionless (rho0 the cold resistivity, A = pi D^3 / 6)
  Q[theta]                                the loss to the stream, linear in theta: heat4.py's matrix
Lengths in wire diameters. With theta = sum c_j cos((j + 1/2) pi w / R), Galerkin gives
    (Lam kap_j^2 R + H - P R) c = P b,     b_j = 2 R (-1)^j / ((j + 1/2) pi),
and the wire's resistance is R0 (1 + mean theta), mean theta = sum c_j b_j / (2R). The P R term is the resistance
rising with temperature: at constant current the wire runs away when P reaches the smallest eigenvalue of the rest.
Two free material numbers, Lam and alpha (alpha only sets the scale of P and theta); in a metal Lam and rho0 are tied
(Wiedemann-Franz), which again only rescales the current.

python anem4.py [overheat=0.5] [Lam,Lam,...] [tags...]   prints the tables; writes data/anem.json (OUT=file for a subset)
"""
import sys, os, json, glob
import numpy as np
from scipy.optimize import brentq

tau = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
Lams = [float(v) for v in sys.argv[2].split(",")] if len(sys.argv) > 2 else [0.0, 3.0, 30.0, 300.0, 3000.0]
tags = sys.argv[3:] or sorted((f.split("heat-")[1][:-5] for f in glob.glob("data/heat-*.json") if not any(x in f for x in ("slab", "uni", "ribbon", "fine"))), key=lambda t: float(t.split("-")[0]))

def wire(d, Lam, J=None):
    H = np.array(d["H"]); J = J or len(H); H = H[:J, :J]; R = d["R"]; j = np.arange(J); kap = (j + 0.5) * np.pi / R
    b = 2 * R * (-1.0) ** j / ((j + 0.5) * np.pi); K = Lam * np.diag(kap ** 2) * R + H
    st = np.array(d["stations"]); Qt = np.array([2 * np.trapezoid(q, st) for q in np.array(d["Q"])[:J]])      # each shape's whole loss to the stream
    def solve(P):
        c = np.linalg.solve(K - P * R * np.eye(J), P * b); return c, float(c @ b / (2 * R))
    Pmax = float(np.linalg.eigvals(K).real.min() / R)                # runaway at constant current
    def at_overheat(t):
        P = brentq(lambda P: solve(P)[1] - t, 1e-9, Pmax * (1 - 1e-9)); c, _ = solve(P)
        ends = float(2 * Lam * (c * kap * (-1.0) ** j).sum()); stream = float(c @ Qt); joule = P * 2 * R * (1 + t)
        return dict(P=P, c=c.tolist(), axis=float(c.sum()), ends=ends / joule, stream=stream / joule, balance=(ends + stream) / joule)
    return solve, at_overheat, Pmax

out = dict(overheat=tau, rows=[])
print(f"constant temperature: mean overheat {tau:g} (the wire's resistance held at {1 + tau:g} of cold)")
print("  P = dimensionless current squared; ends = share of the Joule heat conducted into the wall; n = d ln P / d ln Re")
for Lam in Lams:
    print(f" Lam {Lam:g}"); prev = None
    for t in tags:
        d = json.load(open(f"data/heat-{t}.json")); solve, at, Pmax = wire(d, Lam); r = at(tau)
        J = len(d["H"]); r4 = wire(d, Lam, J // 2)[1](tau)["P"] if J >= 4 else np.nan
        n = np.log(r["P"] / prev[1]) / np.log(d["Re"] / prev[0]) if prev and d["Re"] != prev[0] else np.nan
        print(f"   Re {d['Re']:5g}  P {r['P']:8.4f}  (half the shapes: {r4:8.4f})  on the axis {r["axis"]:.3f}  to the stream {r['stream']:.3f}  ends {r['ends']:.3f}  sum {r['balance']:.4f}  runaway at P {Pmax:.3f}  n {n:.3f}")
        out["rows"].append(dict(tag=t, Re=d["Re"], R=d["R"], Lam=Lam, n=float(n) if np.isfinite(n) else None, runaway=Pmax, **r)); prev = (d["Re"], r["P"])
print("constant current: P set to give that overheat at the middle Reynolds number; the reading is the resistance")
for Lam in Lams:
    ds = [json.load(open(f"data/heat-{t}.json")) for t in tags]; mid = ds[len(ds) // 2]; P = wire(mid, Lam)[1](tau)["P"]
    line = []
    for d in ds:
        solve, at, Pmax = wire(d, Lam); line.append(f"Re {d['Re']:g}: " + (f"{1 + solve(P)[1]:.4f}" if P < Pmax else "runs away"))
    print(f" Lam {Lam:g}  P {P:.4f}   R/R0  " + "   ".join(line))
json.dump(out, open(os.environ.get("OUT", "data/anem.json"), "w"))
