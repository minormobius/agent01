"""The instrument: a long thin hot wire across the 4D pipe, by strip theory. No flow solves.

A usable hot wire is hundreds of diameters long (anem4.py: a 10-diameter metal wire loses 9/10 of its heat into the
wall). In the same pipe such a wire's own Reynolds number is 1 to 10: below every instability of this study, and the
stream changes along it over hundreds of diameters. So each station loses heat as a sphere does at its local speed
(README section 2), Q = pi Nu(Re U(w)) theta, and the wire's energy balance is anem4.py's with that local loss:
    Lam theta'' + P (1 + theta) - pi Nu(Re U(w)) theta = 0,   theta'(0) = 0, theta(R) = 0
solved by finite differences on the half wire. In 4D this is well posed down to rest: conduction from a wire to a
still fluid has the finite Nusselt number 2 (a 3D wire's has no steady limit), so the strip picture needs no outer
length. Nu(Re) is the sphere's, computed by nu4.py's method on a domain 1000 diameters out (data/nu-table.json).

    python strip4.py table                    build data/nu-table.json (a few minutes)
    python strip4.py check                    strip theory against the tube runs (data/anem.json), R = 5
    python strip4.py [R=100] [Lam=3000] [overheat=0.5]    the instrument's calibration, and the flow-development family
U(w): the developed parabola is n = 2 of  U = Ubar (n + 3)/n (1 - (w/R)^n), which carries the same flow rate for
every n (the mean over the pipe's 3-ball section is Ubar); n -> infinity is plug flow. Re is on the centreline speed
of the developed flow and the wire's diameter, so the mean speed is 2/5 of it.
"""
import sys, json
import numpy as np
from scipy.linalg import solve_banded, eigvalsh_tridiagonal
from scipy.optimize import brentq

def build_table(Pr=0.7):
    import scipy.sparse.linalg as spl
    from wake4 import Wake
    W = Wake(Nr=130, Nt=60, Rup=1000, Rdown=1000, gamma=10); n2 = W.n2; g = None; rows = []
    fix = np.union1d(W.d_sph, W.d_far); free = np.setdiff1d(np.arange(n2), fix)
    for Re in np.concatenate([[0.001, 0.003], np.geomspace(0.01, 250, 45)]):
        g = W.base(Re, g); kap = 1 / (Re * Pr); A = (W.conv(g[0], g[1])[0] + kap * W.K).tocsr()
        th = np.zeros(n2); th[W.d_sph] = 1; th[free] = spl.spsolve(A[free][:, free].tocsc(), -(A[free][:, fix] @ th[fix]))
        rows.append([float(Re), float((A[W.d_sph] @ th).sum() / kap * 2)]); print("Re %9.4f  Nu %.4f" % tuple(rows[-1]), flush=True)
    json.dump(dict(Pr=Pr, mesh="Nr 130, Nt 60, outer boundary 1000 D", rows=rows), open("data/nu-table.json", "w"))

def nusselt():
    t = np.array(json.load(open("data/nu-table.json"))["rows"]); lr, nu = np.log(t[:, 0]), t[:, 1]
    return lambda Re: np.where(Re <= t[0, 0], 2 + (nu[0] - 2) * Re / t[0, 0], np.interp(np.log(np.maximum(Re, 1e-300)), lr, nu))

def wire(R, Lam, h, N=4000):
    """h(w) = pi Nu at the N+1 nodes w = 0 .. R. Returns solve(P) -> (theta, mean), and the runaway P."""
    w = np.linspace(0, R, N + 1); dw = w[1] - w[0]; n = N                      # unknowns: nodes 0 .. N-1 (theta_N = 0)
    lo = np.full(n, -Lam / dw ** 2); up = lo.copy(); di = 2 * Lam / dw ** 2 + h[:n]
    up[0] = -2 * Lam / dw ** 2                                                  # mirror at the axis
    def solve(P):
        ab = np.zeros((3, n)); ab[0, 1:] = up[:-1]; ab[1] = di - P; ab[2, :-1] = lo[1:]
        th = np.append(solve_banded((1, 1), ab, np.full(n, P)), 0.0); return th, float(np.trapezoid(th, w) / R)
    if Lam > 0:
        d = di.copy(); e = np.full(n - 1, -Lam / dw ** 2); e[0] *= np.sqrt(2)   # symmetrised
        Pmax = float(eigvalsh_tridiagonal(d, e, select="i", select_range=(0, 0))[0])
    else: Pmax = float(h[:n].min())
    def at(tau):
        P = brentq(lambda P: solve(P)[1] - tau, 1e-12, Pmax * (1 - 1e-7)); th, _ = solve(P)
        joule = P * R * (1 + tau); stream = float(np.trapezoid(h * th, w))
        return dict(P=P, axis=float(th[0]), peak=float(th.max()), stream=stream / joule, ends=1 - stream / joule)
    return solve, at, Pmax, w

def profile(w, R, n=2.0):                       # speed along the wire over the DEVELOPED flow's centreline speed
    ubar = 0.4
    return np.full_like(w, ubar) if np.isinf(n) else ubar * (n + 3) / n * (1 - (w / R) ** n)

if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "table": build_table(); sys.exit()
    Nu = nusselt()
    if a and a[0] == "check":
        J = json.load(open("data/anem.json")); tau = J["overheat"]
        print(f"strip theory against the tube runs, R = 5, overheat {tau:g}:  P (strip) / P (tube run)   and the share of heat to the stream")
        for r in J["rows"]:
            w = np.linspace(0, r["R"], 4001); s = wire(r["R"], r["Lam"], np.pi * Nu(r["Re"] * profile(w, r["R"])))[1](tau)
            print(f"  Lam {r['Lam']:6g}  Re {r['Re']:5g}   {s['P']:9.4f} / {r['P']:9.4f} = {s['P'] / r['P']:.4f}     stream {s['stream']:.3f} / {r['stream']:.3f}")
        sys.exit()
    R = float(a[0]) if a else 100.0; Lam = float(a[1]) if len(a) > 1 else 3000.0; tau = float(a[2]) if len(a) > 2 else 0.5
    w = np.linspace(0, R, 4001); out = dict(R=R, Lam=Lam, overheat=tau, rows=[], dev=[])
    print(f"wire {2 * R:g} diameters long, Lam {Lam:g}, constant temperature (resistance {1 + tau:g} of cold); cold length sqrt(Lam / (pi Nu)) at Nu = 3: {np.sqrt(Lam / (3 * np.pi)):.1f} D")
    print("  Re wire   Re pipe     P       n      to the stream   hottest/mean    runaway P")
    prev = None
    for Re in [0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 25]:
        s, at, Pmax, _ = wire(R, Lam, np.pi * Nu(Re * profile(w, R))); r = at(tau); n = np.log(r["P"] / prev[1]) / np.log(Re / prev[0]) if prev else np.nan
        print(f"  {Re:6g}  {Re * 2 * R:8g}  {r['P']:8.4f}  {n:6.3f}      {r['stream']:.3f}          {r['peak'] / tau:.3f}       {Pmax:.3f}")
        out["rows"].append(dict(Re=Re, n=None if prev is None else float(n), runaway=Pmax, **r)); prev = (Re, r["P"])
    print("flow development at one flow rate: the reading P for U = Ubar (n+3)/n (1 - (w/R)^n), over the developed flow's (n = 2)")
    for Re in [1, 3, 10]:
        base = wire(R, Lam, np.pi * Nu(Re * profile(w, R)))[1](tau)["P"]; line = []
        for n in [2, 3, 4, 8, 16, np.inf]:
            P = wire(R, Lam, np.pi * Nu(Re * profile(w, R, n)))[1](tau)["P"]; line.append(f"n {n:g}: {P / base:.4f}"); out["dev"].append(dict(Re=Re, n=None if np.isinf(n) else n, ratio=P / base))
        print(f"  Re {Re:g}:  " + "   ".join(line))
    json.dump(out, open(f"data/strip-R{R:g}-L{Lam:g}.json", "w"))
