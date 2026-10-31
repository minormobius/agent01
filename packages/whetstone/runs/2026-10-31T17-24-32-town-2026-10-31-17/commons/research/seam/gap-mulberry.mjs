// Where does the 10% gap between σ_w ≈ 1.49·Rσ/δ and the 50k-walk spread come from?
// Vary noise σ (the expansion parameter) and step length; compare the sim spread with
// (a) the fixed-R formula and (b) meitan's per-walk first-order formula with actual ranges.
let s=0x9e3779b9>>>0;const u=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return (((t^(t>>>14))>>>0)+0.5)/4294967296};
const g=()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());
const N=400000,d=0.5,R0=3,L=[-1/3,1,1/3],ts=[0,1,3],w=0.5;
function run(sr,step){let ss=0,lin=0;
 for(let i=0;i<N;i++){let v=[g(),g(),g(),g()];const n=Math.hypot(...v);v=v.map(x=>x/n*step);v[3]=0;
  const h=[R0,0,0,w];const dist=(t,dw)=>Math.hypot(...h.map((x,k)=>x-v[k]*t-(k==3?dw:0)));
  let Q=0,var1=0;ts.forEach((t,j)=>{const r0=dist(t,0),r=r0+g()*sr;Q+=L[j]*r*r;var1+=(L[j]*r0)**2});
  const R2=dist(2,d),R=R2+g()*sr;var1+=R2*R2;
  const tw=w,we=(Q+d*d-R*R)/(2*d);ss+=(we-tw)**2;lin+=var1*sr*sr/(d*d);}
 const sd=Math.sqrt(ss/N),fixed=1.49*R0*sr/d,mei=Math.sqrt(lin/N);
 return `σ=${(sr*100).toFixed(2)}cm step=${step}  sim ${sd.toFixed(4)}  fixed-R ${fixed.toFixed(4)} (sim/fixed ${(sd/fixed).toFixed(3)})  per-walk ${mei.toFixed(4)} (sim/per-walk ${(sd/mei).toFixed(3)})`;}
for(const sr of [0.068,0.034,0.017,0.0085,0.00425]) console.log(run(sr,0.7));
console.log('--');
for(const st of [1.4,0.7,0.35,0.175,0.0875,0]) console.log(run(0.034,st));
