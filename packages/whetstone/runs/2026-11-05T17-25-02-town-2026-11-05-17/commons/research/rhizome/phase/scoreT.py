# Modulo, 2026-10-14. Scores PREDICTION-logT.md against sweepT-s*.jsonl. python3 -I scoreT.py
import json, glob, os, statistics as st
d = os.path.dirname(os.path.abspath(__file__))
R = [r for f in sorted(glob.glob(d + '/sweepT-s*.jsonl')) for r in map(json.loads, open(f)) if r['seed'] < 5000]
Ts = [c['T'] for c in R[0]['ck']]; i500, i2k, i8k = Ts.index(500), Ts.index(2000), Ts.index(8000)
cells = {}
for r in R: cells.setdefault((r['s'], r['p'], r['h']), []).append(r)
def at(g, k):
    S = sum(r['ck'][k]['S'] for r in g); I = sum(r['ck'][k]['I'] for r in g)
    both = sum(1 for r in g if r['ck'][k]['S'] > 0 and r['ck'][k]['I'] > 0)
    return (S / (S + I) if S + I else None), both
print(f'runs {len(R)}, cells {len(cells)}, checkpoints {Ts}')
for k, T in enumerate(Ts):
    n = sum(1 for g in cells.values() if at(g, k)[1] >= 3); print(f'  T {T:5}: cells with both alive in >=3/5 runs: {n}')
b500 = sum(1 for g in cells.values() if at(g, i500)[1] >= 3); b8k = sum(1 for g in cells.values() if at(g, i8k)[1] >= 3)
print(f'G1 both-alive cells 500 -> 8000: {b500} -> {b8k}; under half? {b8k < b500 / 2}')
up = down = 0
for g in cells.values():
    a, b = at(g, i500)[0], at(g, i8k)[0]
    if a is None or b is None: continue
    if b - a > 0.2: up += 1
    elif a - b > 0.2: down += 1
print(f'G2 cells moving >0.2 in share 500->8000: up (to splitter) {up}, down {down}; >2/3 up? {up > 2 * (up + down) / 3}')
def cross(s, h, k):
    ps = sorted({p for (ss, p, hh) in cells if ss == s and hh == h}); prev = None
    for p in ps:
        v = at(cells[(s, p, h)], k)[0]
        if v is None: continue
        if prev and (prev[1] - 0.5) * (v - 0.5) <= 0 and prev[1] != v: return prev[0] + (0.5 - prev[1]) * (p - prev[0]) / (v - prev[1])
        prev = (p, v)
    return None
for s in (1, 2, 5, 10):
    print(f'  share=0.5 crossing at h 0.9, s {s}: ' + ', '.join(f'{T}:{(lambda c: "—" if c is None else round(c, 3))(cross(s, 0.9, k))}' for k, T in enumerate(Ts)))
c5, c8 = cross(1, 0.9, i500), cross(1, 0.9, i8k)
print(f'G3 s1 h0.9 crossing 500 -> 8000: {c5} -> {c8}; moved >=0.05? {None if None in (c5, c8) else abs(c8 - c5) >= 0.05}')
win = lambda v: None if v is None else ('S' if v > 0.5 else 'I')
fl = by2k = 0
for g in cells.values():
    a, b, m = win(at(g, i500)[0]), win(at(g, i8k)[0]), win(at(g, i2k)[0])
    if a and b and a != b: fl += 1; by2k += (m == b)
print(f'G4 cells whose pooled winner flips 500->8000: {fl}; flipped by 2000: {by2k}; >half? {by2k > fl / 2 if fl else None}')
lost = [min(x for x in (r['tS'], r['tI']) if x is not None) for r in R if r['tS'] is not None or r['tI'] is not None]
cens = sum(1 for r in R if r['tS'] is None and r['tI'] is None)
print(f'first loss: {len(lost)} runs lost a kind by 8000 (median step {st.median(lost)}), {cens} still had both at 8000')
for T in Ts: print(f'  lost by {T}: {sum(1 for x in lost if x <= T)}')
