import math, itertools
s=math.sqrt
V=[(1,1,1),(1,-1,-1),(-1,1,-1),(-1,-1,1)]
def mid(a,b): return tuple((x+y)/2 for x,y in zip(a,b))
def sub(t,n):
    if n==0: return [t]
    out=[]
    for i in range(4):
        out+=sub([mid(t[i],t[j]) if j!=i else t[i] for j in range(4)],n-1)
    return out
tets=sub(V,2)
# rotate: around z then x for a view
def rot(p):
    import sys
    az=math.radians(float(sys.argv[2])); el=math.radians(float(sys.argv[3]))
    up=(1/s(3),1/s(3),1/s(3)); e1=(1/s(2),-1/s(2),0); e2=(1/s(6),1/s(6),-2/s(6))
    X=sum(a*b for a,b in zip(p,e1)); Y=sum(a*b for a,b in zip(p,up)); Z=sum(a*b for a,b in zip(p,e2))
    X,Z=X*math.cos(az)-Z*math.sin(az), X*math.sin(az)+Z*math.cos(az)
    Y,Z=Y*math.cos(el)-Z*math.sin(el), Y*math.sin(el)+Z*math.cos(el)
    return (X,Y,Z)
L=(0.3,0.5,0.8); ln=s(sum(c*c for c in L)); L=tuple(c/ln for c in L)
faces=[]
for t in tets:
    r=[rot(p) for p in t]
    c=tuple(sum(p[k] for p in r)/4 for k in range(3))
    for f in itertools.combinations(range(4),3):
        P=[r[i] for i in f]
        u=[P[1][k]-P[0][k] for k in range(3)]; v=[P[2][k]-P[0][k] for k in range(3)]
        n=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
        fc=tuple(sum(p[k] for p in P)/3 for k in range(3))
        if sum(n[k]*(fc[k]-c[k]) for k in range(3))<0: n=tuple(-x for x in n)
        if n[2]<=0: continue
        nn=s(sum(x*x for x in n)); d=max(0,sum(n[k]*L[k] for k in range(3))/nn)
        faces.append((fc[2],P,d))
faces.sort(key=lambda f:f[0])
W=800;S=230
out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}"><rect width="100%" height="100%" fill="white"/>']
for _,P,d in faces:
    g=int(105+130*d); col=f'rgb({g},{int(g*0.9)},{int(g*0.6)})'
    pts=' '.join(f'{W/2+80+p[0]*S:.1f},{W/2+60-p[1]*S:.1f}' for p in P)
    out.append(f'<polygon points="{pts}" fill="{col}" stroke="#222" stroke-width="1.2" stroke-linejoin="round"/>')
out.append('</svg>')
open(__import__('sys').argv[1],'w').write('\n'.join(out))
print(len(tets),'tetrahedra')
