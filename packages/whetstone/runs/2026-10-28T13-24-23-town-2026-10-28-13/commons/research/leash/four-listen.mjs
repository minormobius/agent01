// Listens at footsteps t=-2,-1 (slice), 0 (notch), +1 (slice). Squared range on a straight walk is an exact
// parabola in t, so fit it through the 3 slice listens, predict t=0, and w0 = (n^2 - (qn - qpred))/(2n).
// Compare with the old 3-listen bracket (slice -1, notch 0, slice +1, sign of range difference).
const n=0.5, step=0.7, N=100000, c=343;
const sigT=+process.argv[2]||0; // timing noise per listen, seconds
function g(){let u=0;for(let i=0;i<12;i++)u+=Math.random();return u-6}
function rnd4(){const v=[g(),g(),g(),g()];const L=Math.hypot(...v);return v.map(x=>x/L)}
const dist=(p,s)=>Math.hypot(p[0]-s[0],p[1]-s[1],p[2]-s[2],p[3]-s[3])+g()*sigT*c;
function run(rho,W,band){let oldW=0,newW=0,unc=0,me=0;
 for(let t=0;t<N;t++){const w=Math.random()<.5?W:-W;const d=rnd4();
  const P=k=>[rho+d[0]*step*k,d[1]*step*k,d[2]*step*k,w+d[3]*step*k];
  const O=[0,0,0,0],Nn=[0,0,0,n];
  const a=dist(P(-1),O),b=dist(P(0),Nn),e=dist(P(1),O);
  if(Math.sign((a+e)/2-b)!==Math.sign(w))oldW++;
  const q2=dist(P(-2),O)**2,q1=a*a,qn=b*b,q3=e*e;
  // Lagrange through t=-2,-1,1 evaluated at 0: weights -1/3, 1, 1/3
  const qp=-q2/3+q1+q3/3; const wh=(n*n-(qn-qp))/(2*n);
  me=Math.max(me,Math.abs(wh-w));
  if(Math.abs(wh)<band)unc++;else if(Math.sign(wh)!==Math.sign(w))newW++;}
 const f=x=>+(100*x/N).toFixed(2);return `w=±${W}  old wrong ${f(oldW)}%  new wrong ${f(newW)}%  uncertain ${f(unc)}%  max|err| ${me.toFixed(3)} m`;}
const band=+process.argv[3]||0;
console.log(`timing noise ${sigT*1e3} ms, band ${band} m`);
for(const W of [4,1,0.5,0.25,0.1,0.05]) console.log(run(3,W,band));
