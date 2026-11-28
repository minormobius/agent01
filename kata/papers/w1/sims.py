"""W1's pictures of computed fields (fig/sim-*.png), drawn from wire4's saved runs. Needs the study's Python
environment plus matplotlib; the charts (charts.mjs) do not. Run from kata/papers/w1:
    PYTHONPATH=../../wire4 python sims.py          (~1 min)
Colour is the streamwise velocity over the stream's speed (blue forward, red reversed, the black line where it is
zero: the edge of the recirculation), or the temperature excess for the ribbon's station."""
import json, sys, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm
D = "../../wire4/data/"; os.makedirs("fig", exist_ok=True)
plt.rcParams.update({"font.size": 9, "font.family": "DejaVu Sans", "axes.linewidth": 0.6})
norm = TwoSlopeNorm(vmin=-0.35, vcenter=0.0, vmax=1.25); cm = "RdBu"; BODY = "#8a8a8a"

def ripple(tag="200"):
    m = json.load(open(D + f"flow-{tag}.json")); a = np.fromfile(D + f"flow-{tag}.bin", dtype="<f4"); n = m["nx"] * m["nr"]; f = lambda i: a[i * n:(i + 1) * n].reshape(m["nr"], m["nx"])
    x = m["x0"] + m["h"] * np.arange(m["nx"]); r = m["h"] * np.arange(m["nr"]); beta = m["beta"]; lam = 2 * np.pi / beta
    def u_at(w): return f(0) + sum(f(2 + 3 * j) * np.cos(k * beta * w) for j, k in enumerate(m["ks"]))
    fig, ax = plt.subplots(1, 3, figsize=(7.6, 2.75), gridspec_kw=dict(width_ratios=[1, 1, 1.0]), constrained_layout=True)
    for a_, w, name in ((ax[0], 0.0, "across the wire, where the bubble is fattest"), (ax[1], lam / 2, "across the wire, where it is thinnest")):
        u = u_at(w); U = np.vstack([u[::-1], u[1:]]); Y = np.concatenate([-r[::-1], r[1:]]); X2, Y2 = np.meshgrid(x, Y); U = np.ma.masked_where(X2 ** 2 + Y2 ** 2 < 0.25, U)
        a_.pcolormesh(x, Y, U, cmap=cm, norm=norm, shading="auto", rasterized=True); a_.contour(x, Y, U, [0], colors="k", linewidths=0.8); a_.add_patch(plt.Circle((0, 0), 0.5, color=BODY)); a_.set_aspect("equal"); a_.set_xlim(-1.2, 3.3); a_.set_ylim(-1.6, 1.6); a_.set_title(name, fontsize=8); a_.set_xlabel("x (along the stream)"); a_.set_ylabel("y")
    ws = np.linspace(0, 3 * lam, 400); line = np.array([f(0)[0] + sum(f(2 + 3 * j)[0] * np.cos(k * beta * w) for j, k in enumerate(m["ks"])) for w in ws]); X2, W2 = np.meshgrid(x, ws); line = np.ma.masked_where(np.abs(X2) < 0.5, line)
    im = ax[2].pcolormesh(x, ws, line, cmap=cm, norm=norm, shading="auto", rasterized=True); ax[2].contour(x, ws, line, [0], colors="k", linewidths=0.8); ax[2].axvspan(-0.5, 0.5, color=BODY); ax[2].set_aspect("equal"); ax[2].set_xlim(-1.2, 3.3); ax[2].set_ylim(0, 3 * lam)
    ax[2].set_title("along the wire (the grey band)", fontsize=8); ax[2].set_xlabel("x"); ax[2].set_ylabel("w (along the wire)")
    fig.colorbar(im, ax=ax, shrink=0.8, label="streamwise velocity", ticks=[-0.3, 0, 0.5, 1]); fig.savefig("fig/sim-ripple.png", dpi=220); plt.close(fig); print("fig/sim-ripple.png", m["bubble"])

def tube(tag="200-R5"):
    from skfem import MeshTet, Basis, ElementTetP2
    z = np.load(D + f"tube-{tag}.npz"); R = 5.0; b = Basis(MeshTet(z["P"], z["t"]), ElementTetP2(), intorder=2); x = np.arange(-2.0, 7.0001, 0.04); w = np.arange(0.0, R - 0.02, 0.04); X, W = np.meshgrid(x, w); ok = np.abs(X) > 0.5 + 1e-3
    val = np.full(X.shape, np.nan)
    for i in range(len(w)):                 # a row at a time: probing the whole plane at once does not fit in memory
        o = ok[i]; val[i, o] = b.probes(np.vstack([x[o], np.full(o.sum(), 1e-6), np.full(o.sum(), max(w[i], 1e-6))])) @ z["u"][0]
    U = np.ma.masked_invalid(np.vstack([val[::-1], val[1:]])); Wf = np.concatenate([-w[::-1], w[1:]])
    fig, ax = plt.subplots(figsize=(4.4, 4.3), constrained_layout=True); im = ax.pcolormesh(x, Wf, U, cmap=cm, norm=norm, shading="auto", rasterized=True); ax.contour(x, Wf, U, [0], colors="k", linewidths=0.8)
    ax.axvspan(-0.5, 0.5, color=BODY); ax.axhspan(R, R + 0.25, color="#444"); ax.axhspan(-R - 0.25, -R, color="#444"); ax.set_aspect("equal"); ax.set_xlim(-2, 7); ax.set_ylim(-R - 0.25, R + 0.25)
    ax.set_xlabel("x (along the pipe)"); ax.set_ylabel("w (along the wire, wall to wall)"); ax.text(6.8, R - 0.45, "pipe wall", ha="right", va="top", fontsize=8); ax.text(6.8, 0.12, "pipe's axis", ha="right", fontsize=8, color="#333"); ax.axhline(0, color="#333", lw=0.4, ls=":")
    fig.colorbar(im, ax=ax, shrink=0.7, label="streamwise velocity over the centreline speed", ticks=[-0.3, 0, 0.5, 1]); fig.savefig("fig/sim-tube.png", dpi=220); plt.close(fig); print("fig/sim-tube.png")

def station(H=5.0, Re=10.0, Pr=0.7):
    import scipy.sparse.linalg as spl
    from matplotlib.tri import Triangulation
    from ribbon4 import chan
    C = chan(H, 1.0); g = None
    for r in (1.0, 5.0, Re): g = C.base(r, g)
    kap = 1 / (Re * Pr); A = (C.conv(g[0], g[1])[0] + kap * C.K).tocsr(); fix = np.union1d(C.d_body, C.T0); free = np.setdiff1d(np.arange(C.n2), fix); th = np.zeros(C.n2); th[C.d_body] = 1; th[free] = spl.spsolve(A[free][:, free].tocsc(), -(A[free][:, fix] @ th[fix]))
    nd = C.b2.nodal_dofs[0]; p = C.m.p; tri = C.m.t.T
    fig, ax = plt.subplots(1, 2, figsize=(7.6, 3.2), constrained_layout=True)
    for a_, v, lab, kw in ((ax[0], g[0][nd], "streamwise velocity", dict(cmap=cm, norm=norm)), (ax[1], np.clip(th[nd], 1e-3, 1), "temperature excess (lines at 2, 5, 10, 20%)", dict(cmap="inferno", vmin=0, vmax=0.5))):
        for sgn in (1, -1):
            T = Triangulation(p[0], sgn * p[1], tri); im = a_.tripcolor(T, v, shading="gouraud", rasterized=True, **kw)
            if a_ is ax[1]: a_.tricontour(T, th[nd], [0.02, 0.05, 0.1, 0.2], colors="w", linewidths=0.5)
            else: a_.tricontour(T, v, [0], colors="k", linewidths=0.8)
        a_.add_patch(plt.Circle((0, 0), 0.5, color=BODY)); a_.axhspan(H, H + 0.3, color="#444"); a_.axhspan(-H - 0.3, -H, color="#444"); a_.set_aspect("equal"); a_.set_xlim(-4, 12); a_.set_ylim(-H - 0.3, H + 0.3); a_.set_ylabel("y (across the ribbon)"); a_.set_xlabel("x (along the pipe)"); cb = fig.colorbar(im, ax=a_, orientation="horizontal", shrink=0.9, label=lab, pad=0.02, aspect=30)
        if a_ is ax[0]: cb.set_ticks([-0.3, 0, 0.5, 1])
    fig.savefig("fig/sim-station.png", dpi=220); plt.close(fig); print("fig/sim-station.png")

if __name__ == "__main__":
    for f in (ripple, tube, station):
        if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]: f()
