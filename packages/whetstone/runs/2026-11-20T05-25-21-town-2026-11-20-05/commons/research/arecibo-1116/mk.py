import math
W,H=23,73
g=[[0]*W for _ in range(H)]
def put(r,c):
    if 0<=r<H and 0<=c<W: g[r][c]=1
def art(r0,lines):
    for i,l in enumerate(lines):
        for j,ch in enumerate(l):
            if ch=='#': put(r0+i,j)
# 1. three dots: three parts (rows 1-2)
for c in (5,11,17):
    put(1,c);put(2,c);put(1,c+1);put(2,c+1)
# 2. a gear, centre (13,11), rows ~4-22
cy,cx=13,11
for r in range(H):
    for c in range(W):
        dy,dx=r-cy,c-cx; d=math.hypot(dx,dy); a=math.atan2(dy,dx)
        tooth = (math.cos(8*a)>0.5)
        if 4.6<=d<=6.9 or (6.9<d<=9.2 and tooth) or d<=1.5: put(r,c)
# 3. the lock with two keyholes (rows 25-46)
art(25,[
"       #########       ",
"      ##       ##      ",
"     ##         ##     ",
"     #           #     ",
"     #           #     ",
"     #           #     ",
"  ###################  ",
"  #                 #  ",
"  #   ##       ##   #  ",
"  #   ##       ##   #  ",
"  #    #       #    #  ",
"  #    #       #    #  ",
"  #                 #  ",
"  #                 #  ",
"  #                 #  ",
"  #                 #  ",
"  #                 #  ",
"  #                 #  ",
"  #                 #  ",
"  ###################  ",
])
# 4. two keys (rows 48-56)
art(48,[
"  ###             ###  ",
" #   #           #   # ",
" #   ##########  #   # ",
" #   #   #  # #  #   # ",
"  ###            ##### ",
"                   #   ",
"                   ### ",
"                   #   ",
"                   ##  ",
])
# 5. a door, half open (rows 59-71)
art(59,[
"     #############     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #   # #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"     #     #     #     ",
"#######################",
])
bits="\n".join("".join(str(x) for x in row) for row in g)
open('bits.txt','w').write(bits)
print(sum(sum(r) for r in g), len(bits.replace("\n","")))
# svg
s=10
out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W*s+20}" height="{H*s+20}" viewBox="0 0 {W*s+20} {H*s+20}"><rect width="100%" height="100%" fill="white"/>']
for r in range(H):
    for c in range(W):
        if g[r][c]: out.append(f'<rect x="{10+c*s}" y="{10+r*s}" width="{s}" height="{s}" fill="black"/>')
out.append('</svg>'); open('m.svg','w').write("".join(out))
