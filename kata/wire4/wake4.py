"""The wake of a 4D wire: is it stable along the wire?

A wire in four dimensions (a 3-ball cross-section, extruded along w) in a flow perpendicular to it has, as its base
flow, the steady axisymmetric flow past a sphere, the same at every w. This solves that base flow and then the
linear stability of it to disturbances  exp(i m phi + i beta w + sigma t):  m is the azimuthal wavenumber round the
flow axis, beta the wavenumber ALONG THE WIRE. beta = 0 is the classical sphere problem (validation); beta > 0 is new.

Meridional half-plane (x, r), sphere of diameter 1 at the origin, free stream 1 along +x, Re = U D / nu.
Taylor-Hood P2/P1 finite elements (scikit-fem), weak forms weighted by r. Disturbance components: u (along x), v
(radial), a (azimuthal, stored as a/i), b (along the wire, stored as b/i), pressure p: the system is then real.
"""
import sys, time
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from skfem import MeshTri, Basis, ElementTriP2, ElementTriP1, BilinearForm, LinearForm


def mesh(Nr=70, Nt=60, Rup=12.0, Rdown=25.0, gamma=5.5, tpow=1.0):
    s = np.linspace(0, 1, Nr + 1)
    th = np.pi * np.linspace(0, 1, Nt + 1) ** tpow          # theta = 0 is downstream
    Rout = Rup + (Rdown - Rup) * (1 + np.cos(th)) / 2
    f = (np.exp(gamma * s) - 1) / (np.exp(gamma) - 1)
    R = 0.5 + np.outer(f, Rout - 0.5)                         # (Nr+1, Nt+1)
    X, Y = R * np.cos(th)[None, :], R * np.sin(th)[None, :]
    Y[:, 0] = 0; Y[:, -1] = 0
    p = np.vstack([X.ravel(), Y.ravel()])
    idx = lambda i, j: i * (Nt + 1) + j
    t = []
    for i in range(Nr):
        for j in range(Nt):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            t += [[a, b, c], [a, c, d]] if (i + j) % 2 == 0 else [[a, b, d], [b, c, d]]
    return MeshTri(p, np.array(t).T)


class Wake:
    def __init__(self, **kw):
        self.m = mesh(**kw)
        self.b2 = Basis(self.m, ElementTriP2(), intorder=6)
        self.b1 = Basis(self.m, ElementTriP1(), intorder=6)
        self.n2, self.n1 = self.b2.N, self.b1.N
        m = self.m
        bf = m.boundary_facets()
        mid = m.p[:, m.facets[:, bf]].mean(axis=1)
        rad = np.hypot(mid[0], mid[1])
        axis = bf[mid[1] < 1e-9]
        sph = bf[(rad < 0.5 + 1e-6) & (mid[1] >= 1e-9)]
        outer = bf[(rad > 0.5 + 1e-6) & (mid[1] >= 1e-9)]
        ang = np.arctan2(m.p[1, m.facets[:, outer]].mean(axis=0), m.p[0, m.facets[:, outer]].mean(axis=0))
        self.out_free = outer[ang < np.pi / 3]              # downstream cap: natural (outflow) condition
        self.out_dir = outer[ang >= np.pi / 3]
        d = lambda f: self.b2.get_dofs(f).all()
        self.d_axis, self.d_sph, self.d_far = d(axis), d(sph), d(self.out_dir)
        # forms that do not depend on the base flow
        r = lambda w: w.x[1]
        self.M = BilinearForm(lambda u, v, w: u * v * r(w)).assemble(self.b2)
        self.K = BilinearForm(lambda u, v, w: (u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1]) * r(w)).assemble(self.b2)
        self.M_r2 = BilinearForm(lambda u, v, w: u * v / r(w)).assemble(self.b2)            # mass / r^2, weighted by r
        # pressure/divergence: rows = velocity test, cols = pressure trial   ( - int p D(phi) r )
        self.Gx = BilinearForm(lambda p, v, w: -p * v.grad[0] * r(w)).assemble(self.b1, self.b2)
        self.Gr = BilinearForm(lambda p, v, w: -p * (v.grad[1] * r(w) + v)).assemble(self.b1, self.b2)
        self.G0 = BilinearForm(lambda p, v, w: p * v).assemble(self.b1, self.b2)              # int p phi  (= r * p phi / r)
        self.Gm = BilinearForm(lambda p, v, w: p * v * r(w)).assemble(self.b1, self.b2)       # int p phi r

    # ---- operators depending on the base flow (U, V): L such that  sigma B x + L x = 0
    def conv(self, U, V):
        r = lambda w: w.x[1]
        Ui, Vi = self.b2.interpolate(U), self.b2.interpolate(V)
        kw = dict(U=Ui, V=Vi)
        C = BilinearForm(lambda u, v, w: (w['U'] * u.grad[0] + w['V'] * u.grad[1]) * v * r(w)).assemble(self.b2, **kw)
        Ux = BilinearForm(lambda u, v, w: w['U'].grad[0] * u * v * r(w)).assemble(self.b2, **kw)
        Ur = BilinearForm(lambda u, v, w: w['U'].grad[1] * u * v * r(w)).assemble(self.b2, **kw)
        Vx = BilinearForm(lambda u, v, w: w['V'].grad[0] * u * v * r(w)).assemble(self.b2, **kw)
        Vr = BilinearForm(lambda u, v, w: w['V'].grad[1] * u * v * r(w)).assemble(self.b2, **kw)
        Vor = BilinearForm(lambda u, v, w: w['V'] * u * v).assemble(self.b2, **kw)                # V a / r, weighted by r
        return C, Ux, Ur, Vx, Vr, Vor

    def operator(self, U, V, Re, m=0, beta=0.0, four=True):
        """Blocks for (u, v, a, b, p); with four=False only (u, v, p) (the axisymmetric Jacobian)."""
        nu = 1.0 / Re
        C, Ux, Ur, Vx, Vr, Vor = self.conv(U, V)
        D = nu * (self.K + m * m * self.M_r2 + beta * beta * self.M)        # scalar diffusion
        Auu = C + Ux + D
        Auv = Ur
        Avu = Vx
        Avv = C + Vr + D + nu * self.M_r2
        if not four:
            L = sp.bmat([[Auu, Auv, self.Gx], [Avu, Avv, self.Gr], [self.Gx.T, self.Gr.T, None]], format='csc')
            return L
        Ava = -2 * m * nu * self.M_r2
        Aaa = C + Vor + D + nu * self.M_r2
        Abb = C + D
        Ga = m * self.G0                                                       # + int m p phi_a
        Gb = beta * self.Gm                                                    # + int beta p phi_b r
        Z = None
        L = sp.bmat([[Auu, Auv, Z, Z, self.Gx],
                     [Avu, Avv, Ava, Z, self.Gr],
                     [Z, Ava, Aaa, Z, Ga],
                     [Z, Z, Z, Abb, Gb],
                     [self.Gx.T, self.Gr.T, Ga.T, Gb.T, Z]], format='csc')
        return L

    # ---- base flow by Newton
    def residual(self, U, V, P, Re):
        nu = 1.0 / Re
        r = lambda w: w.x[1]
        kw = dict(U=self.b2.interpolate(U), V=self.b2.interpolate(V), P=self.b1.interpolate(P))
        Ru = LinearForm(lambda v, w: ((w['U'] * w['U'].grad[0] + w['V'] * w['U'].grad[1]) * v
                                      + nu * (w['U'].grad[0] * v.grad[0] + w['U'].grad[1] * v.grad[1]) - w['P'] * v.grad[0]) * r(w)).assemble(self.b2, **kw)
        Rv = LinearForm(lambda v, w: ((w['U'] * w['V'].grad[0] + w['V'] * w['V'].grad[1]) * v
                                      + nu * (w['V'].grad[0] * v.grad[0] + w['V'].grad[1] * v.grad[1]) - w['P'] * v.grad[1]) * r(w)
                                     + nu * w['V'] * v / r(w) - w['P'] * v).assemble(self.b2, **kw)
        Rp = LinearForm(lambda q, w: -q * ((w['U'].grad[0] + w['V'].grad[1]) * r(w) + w['V'])).assemble(self.b1, **kw)
        return np.concatenate([Ru, Rv, Rp])

    def base(self, Re, guess=None, tol=1e-9, verbose=False):
        n2, n1 = self.n2, self.n1
        fixU = np.union1d(self.d_sph, self.d_far)
        fixV = np.union1d(fixU, self.d_axis)
        fixed = np.concatenate([fixU, n2 + fixV])
        free = np.setdiff1d(np.arange(2 * n2 + n1), fixed)
        if guess is None:
            U, V, P = np.zeros(n2), np.zeros(n2), np.zeros(n1)
            U[:] = 1.0; U[self.d_sph] = 0.0
        else:
            U, V, P = [g.copy() for g in guess]
        U[self.d_far] = 1.0; U[self.d_sph] = 0; V[fixV] = 0
        for it in range(30):
            R = self.residual(U, V, P, Re)
            res = np.abs(R[free]).max()
            if verbose: print(f"   newton {it}: {res:.2e}")
            if res < tol: break
            J = self.operator(U, V, Re, four=False)
            dx = np.zeros(2 * n2 + n1)
            dx[free] = spl.spsolve(J[free][:, free].tocsc(), -R[free])
            U += dx[:n2]; V += dx[n2:2 * n2]; P += dx[2 * n2:]
        else:
            raise RuntimeError(f"Newton did not converge at Re {Re}: {res:.2e}")
        return U, V, P

    def bubble(self, U):
        """Length of the recirculation bubble behind the sphere, in diameters from the rear of the sphere."""
        ax = self.d_axis
        x = self.b2.doflocs[0, ax]; o = np.argsort(x); x, u = x[o], U[ax][o]
        k = np.where((x > 0.5 + 1e-9) & (u < 0))[0]
        if not len(k): return 0.0
        i = k.max(); x0, x1, u0, u1 = x[i], x[i + 1], u[i], u[i + 1]
        return x0 + (x1 - x0) * (-u0) / (u1 - u0) - 0.5

    def drag(self, U, V, P, Re):
        """C_D from the weak residual: the reaction on the sphere's no-slip nodes, tested with phi_u = 1 there."""
        R = self.residual(U, V, P, Re)[:self.n2]
        F = -R[self.d_sph].sum() * 2 * np.pi       # force of the fluid on the sphere along x
        return F / (0.5 * np.pi * 0.25)

    # ---- eigenvalues
    def eig(self, U, V, Re, m, beta, shift=0.05, k=6):
        n2, n1 = self.n2, self.n1
        wall = np.union1d(self.d_sph, self.d_far)
        ax = self.d_axis
        if m == 0: fu, fv, fa, fb = wall, np.union1d(wall, ax), np.union1d(wall, ax), wall
        elif m == 1: fu, fv, fa, fb = np.union1d(wall, ax), wall, wall, np.union1d(wall, ax)
        else: fu = fv = fa = fb = np.union1d(wall, ax)
        fixed = np.concatenate([fu, n2 + fv, 2 * n2 + fa, 3 * n2 + fb])
        N = 4 * n2 + n1
        if beta == 0 and m == 0:                    # b decouples and the a block too; keep them, harmless
            pass
        free = np.setdiff1d(np.arange(N), fixed)
        L = self.operator(U, V, Re, m, beta)[free][:, free].tocsc()
        B = sp.block_diag([self.M] * 4 + [sp.csc_matrix((n1, n1))], format='csc')[free][:, free].tocsc()
        # sigma B x = -L x
        lu = spl.splu((-L - shift * B).tocsc())
        op = spl.LinearOperator(L.shape, matvec=lambda x: lu.solve(B @ x), dtype=complex if np.iscomplexobj(shift) else float)
        vals = spl.eigs(op, k=k, which='LM', return_eigenvectors=False, tol=1e-8)
        return np.sort_complex(shift + 1.0 / vals)[::-1]


if __name__ == "__main__":
    t0 = time.time()
    W = Wake(Nr=int(sys.argv[1]) if len(sys.argv) > 1 else 70, Nt=int(sys.argv[2]) if len(sys.argv) > 2 else 60)
    print("dofs per component", W.n2, "pressure", W.n1, f"{time.time() - t0:.1f}s")
    g = None
    for Re in [1, 10, 40, 100, 150, 200, 212, 250, 280]:
        g = W.base(Re, g)
        line = f"Re {Re:4d}  C_D {W.drag(*g, Re):.4f}  bubble {W.bubble(g[0]):.3f}"
        if Re >= 200:
            e1 = W.eig(g[0], g[1], Re, 1, 0.0, shift=0.05)
            e2 = W.eig(g[0], g[1], Re, 1, 0.0, shift=0.02 + 0.7j)
            line += f"  m=1 beta=0: steady {e1[0].real:+.4f}{e1[0].imag:+.3f}i  osc {e2[0].real:+.4f}{e2[0].imag:+.3f}i"
        print(line, f"{time.time() - t0:.0f}s", flush=True)
