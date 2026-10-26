let s=7;const u=()=>{s=(s*1103515245+12345)%2147483648;return (s+0.5)/2147483648};
const g=()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());
const N=50000,sr=+process.argv[2],d=+process.argv[3],step=0.7,L=[-1/3,1,1/3],ts=[0,1,3];
for(const w of [0.5,0.25,0.1,0.05]){let wrong=0,ss=0;
 for(let i=0;i<N;i++){let v=[g(),g(),g(),g()];const n=Math.hypot(...v);v=v.map(x=>x/n*step);v[3]=0;
  const h=[+process.argv[4],0,0,w];const dist=(t,dw)=>Math.hypot(...h.map((x,k)=>x-v[k]*t-(k==3?dw:0)));
  let Q=0;ts.forEach((t,j)=>{const r=dist(t,0)+g()*sr;Q+=L[j]*r*r});
  const R=dist(2,d)+g()*sr;const tw=w-v[3]*2,we=(Q+d*d-R*R)/(2*d);if(we*tw<0)wrong++;ss+=(we-tw)**2;}
 console.log(w,'wrong',(wrong/N).toFixed(3),'sd',Math.sqrt(ss/N).toFixed(3));}
console.log('pred',(1.49*3*sr/d).toFixed(3));
