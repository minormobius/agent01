"""A circular cylinder in our world, which is a ribbon in four dimensions (README section 13).

A body long in two of 4D's directions and round in the other two is, at each place on it, a cylinder in a plane
flow. This solves that flow and its heat loss: steady, symmetric about the stream's axis (so no vortex street: past
Re 47 this is the unstable symmetric branch), Taylor-Hood P2/P1 on wake4.py's mesh with the radial weight removed.
Unbounded stream: outer boundary Rout diameters away (the plane problem feels it far more than the sphere's does).
    python cyl4.py [Pr=0.7] [Rout=200] [Nr=120] [Nt=60] [Re,Re,...]   ->  prints Re, C_D, bubble, Nu;  data/nu-cyl.json
Nu = h D / k with h = (heat per length) / (pi D dT).
"""
import sys, json
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from skfem import Basis, ElementTriP2, ElementTriP1, BilinearForm, LinearForm
from wake4 import mesh

class Cyl:
    def __init__(self, Nr=120, Nt=60, Rout=200.0, gamma=None):
        self.m = m = mesh(Nr=Nr, Nt=Nt, Rup=Rout, Rdown=Rout, gamma=gamma or 5.5 + np.log(Rout / 12.0) * 1.1)
        self.b2 = Basis(m, ElementTriP2(), intorder=6); self.b1 = Basis(m, ElementTriP1(), intorder=6); self.n2, self.n1 = self.b2.N, self.b1.N
        bf = m.boundary_facets(); mid = m.p[:, m.facets[:, bf]].mean(axis=1); rad = np.hypot(mid[0], mid[1])
        axis = bf[mid[1] < 1e-9]; body = bf[(rad < 0.5 + 1e-6) & (mid[1] >= 1e-9)]; outer = bf[(rad > 0.5 + 1e-6) & (mid[1] >= 1e-9)]
        ang = np.arctan2(mid[1][(rad > 0.5 + 1e-6) & (mid[1] >= 1e-9)], mid[0][(rad > 0.5 + 1e-6) & (mid[1] >= 1e-9)])
        d = lambda f: self.b2.get_dofs(f).all()
        self.d_axis, self.d_body, self.d_far = d(axis), d(body), d(outer[ang >= np.pi / 3])          # downstream cap: outflow
        self.K = BilinearForm(lambda u, v, w: u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1]).assemble(self.b2)
        self.Gx = BilinearForm(lambda p, v, w: -p * v.grad[0]).assemble(self.b1, self.b2); self.Gy = BilinearForm(lambda p, v, w: -p * v.grad[1]).assemble(self.b1, self.b2)
    def conv(self, U, V):
        kw = dict(U=self.b2.interpolate(U), V=self.b2.interpolate(V)); B = lambda f: BilinearForm(f).assemble(self.b2, **kw)
        return (B(lambda u, v, w: (w['U'] * u.grad[0] + w['V'] * u.grad[1]) * v), B(lambda u, v, w: w['U'].grad[0] * u * v), B(lambda u, v, w: w['U'].grad[1] * u * v),
                B(lambda u, v, w: w['V'].grad[0] * u * v), B(lambda u, v, w: w['V'].grad[1] * u * v))
    def residual(self, U, V, P, Re):
        nu = 1.0 / Re; kw = dict(U=self.b2.interpolate(U), V=self.b2.interpolate(V), P=self.b1.interpolate(P))
        Ru = LinearForm(lambda v, w: (w['U'] * w['U'].grad[0] + w['V'] * w['U'].grad[1]) * v + nu * (w['U'].grad[0] * v.grad[0] + w['U'].grad[1] * v.grad[1]) - w['P'] * v.grad[0]).assemble(self.b2, **kw)
        Rv = LinearForm(lambda v, w: (w['U'] * w['V'].grad[0] + w['V'] * w['V'].grad[1]) * v + nu * (w['V'].grad[0] * v.grad[0] + w['V'].grad[1] * v.grad[1]) - w['P'] * v.grad[1]).assemble(self.b2, **kw)
        Rp = LinearForm(lambda q, w: -q * (w['U'].grad[0] + w['V'].grad[1])).assemble(self.b1, **kw)
        return np.concatenate([Ru, Rv, Rp])
    def base(self, Re, guess=None, tol=1e-9):
        n2, n1 = self.n2, self.n1; fixU = np.union1d(self.d_body, self.d_far); fixV = np.union1d(fixU, self.d_axis)
        free = np.setdiff1d(np.arange(2 * n2 + n1), np.concatenate([fixU, n2 + fixV]))
        U, V, P = (np.ones(n2), np.zeros(n2), np.zeros(n1)) if guess is None else [g.copy() for g in guess]
        U[self.d_far] = getattr(self, 'uin', 1.0); U[self.d_body] = 0; V[fixV] = 0     # uin: a profile on the fixed boundary (ribbon4.py)
        for it in range(40):
            R = self.residual(U, V, P, Re); res = np.abs(R[free]).max()
            if res < tol: break
            C, Ux, Uy, Vx, Vy = self.conv(U, V); D = self.K / Re
            J = sp.bmat([[C + Ux + D, Uy, self.Gx], [Vx, C + Vy + D, self.Gy], [self.Gx.T, self.Gy.T, None]], format='csc')
            dx = np.zeros(2 * n2 + n1); dx[free] = spl.spsolve(J[free][:, free].tocsc(), -R[free]); U += dx[:n2]; V += dx[n2:2 * n2]; P += dx[2 * n2:]
        else: raise RuntimeError(f"Newton did not converge at Re {Re}: {res:.2e}")
        return U, V, P
    def drag(self, U, V, P, Re): return float(-self.residual(U, V, P, Re)[:self.n2][self.d_body].sum() * 2 / 0.5)       # both halves; per length, over rho U^2 D / 2
    def bubble(self, U):
        ax = self.d_axis; x = self.b2.doflocs[0, ax]; o = np.argsort(x); x, u = x[o], U[ax][o]; k = np.where((x > 0.5 + 1e-9) & (u < 0))[0]
        if not len(k): return 0.0
        i = k.max(); return float(x[i] + (x[i + 1] - x[i]) * (-u[i]) / (u[i + 1] - u[i]) - 0.5)
    def nusselt(self, U, V, Re, Pr=0.7):
        kap = 1.0 / (Re * Pr); A = (self.conv(U, V)[0] + kap * self.K).tocsr(); fix = np.union1d(self.d_body, self.d_far); free = np.setdiff1d(np.arange(self.n2), fix)
        th = np.zeros(self.n2); th[self.d_body] = 1.0; th[free] = spl.spsolve(A[free][:, free].tocsc(), -(A[free][:, fix] @ th[fix]))
        return float((A[self.d_body] @ th).sum() / kap * 2 / np.pi)

if __name__ == "__main__":
    a = sys.argv[1:]; Pr = float(a[0]) if a else 0.7; Rout = float(a[1]) if len(a) > 1 else 200.0; Nr = int(a[2]) if len(a) > 2 else 120; Nt = int(a[3]) if len(a) > 3 else 60
    Res = [float(v) for v in a[4].split(",")] if len(a) > 4 else [0.1, 0.15, 0.25, 0.4, 0.6, 1, 1.5, 2.5, 4, 6, 10, 15, 25, 40]
    W = Cyl(Nr=Nr, Nt=Nt, Rout=Rout); g = None; rows = []
    for Re in Res:
        g = W.base(Re, g); rows.append(dict(Re=Re, cd=W.drag(*g, Re), bubble=W.bubble(g[0]), Nu=W.nusselt(g[0], g[1], Re, Pr)))
        print(f"Re {Re:6g}  C_D {rows[-1]['cd']:8.4f}  bubble {rows[-1]['bubble']:.3f}  Nu {rows[-1]['Nu']:.4f}", flush=True)
    if len(a) <= 1: json.dump(dict(Pr=Pr, Rout=Rout, Nr=Nr, Nt=Nt, rows=rows), open("data/nu-cyl.json", "w"))
