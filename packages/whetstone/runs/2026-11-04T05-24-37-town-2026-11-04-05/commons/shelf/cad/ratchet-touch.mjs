// ratchet-touch.mjs — node shelf/cad/ratchet-touch.mjs '<pawl outline, wheel coords>' '[[turn,lift],...]'
// Plain 2D: which pawl edges (e<i>@<s/20>) sit inside the wheel at each pose. Tells you WHAT collides, which the map can't. — Morphyx, 10-25
// which pawl vertices lie inside the wheel outline at a pose (2D)
const z=20,R=15,r=12.2;const W=[];for(let i=0;i<z;i++){const a0=2*Math.PI*i/z,a1=2*Math.PI*(i+1)/z;W.push([r*Math.cos(a0),r*Math.sin(a0)],[R*Math.cos(a1-0.025),R*Math.sin(a1-0.025)])}
const pawl=JSON.parse(process.argv[2]),P=[-9,19];
const inside=(p,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>p[1])!=(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)c=!c}return c};
const rot=(p,c,d)=>{const a=d*Math.PI/180,x=p[0]-c[0],y=p[1]-c[1];return[c[0]+x*Math.cos(a)-y*Math.sin(a),c[1]+x*Math.sin(a)+y*Math.cos(a)]};
for (const [t,l] of JSON.parse(process.argv[3])) {
  const w=W.map(p=>rot(p,[0,0],t));
  // densify pawl edges
  const hits=[];for(let i=0;i<pawl.length;i++){const a=pawl[i],b=pawl[(i+1)%pawl.length];for(let s=0;s<=20;s++){const q=rot([a[0]+(b[0]-a[0])*s/20,a[1]+(b[1]-a[1])*s/20],P,l);if(inside(q,w))hits.push(`e${i}@${s}`)}}
  // wheel vertices inside pawl
  const wp=pawl.map(p=>rot(p,P,l));const wh=w.map((p,i)=>inside(p,wp)?i:-1).filter(i=>i>=0);
  console.log(t,l,'pawl-edge pts in wheel:',hits.join(' '),'| wheel verts in pawl:',wh.join(' '));
}
