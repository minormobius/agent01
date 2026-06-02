// WebGPU: explicit finite-difference Fickian diffusion of a species into a
// sphere, with live axis-aligned cross-sectioning. Everything runs on the GPU;
// the only CPU readback is an occasional fill-fraction sample.

const $ = id => document.getElementById(id);
function flash(m){ const f=$('flash'); f.textContent=m; f.classList.add('show'); clearTimeout(f._t); f._t=setTimeout(()=>f.classList.remove('show'),1800); }

const RAD_FRAC = 0.45; // sphere radius as a fraction of grid extent

const COMPUTE_WGSL = `
struct U { N:u32, alpha:f32, kdt:f32, cs:f32, rad:f32, _a:f32, _b:f32, _c:f32 };
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var<storage, read> src:array<f32>;
@group(0) @binding(2) var<storage, read_write> dst:array<f32>;
@group(0) @binding(3) var<storage, read> dmul:array<f32>;   // per-cell diffusivity multiplier ∈ [0,1]

fn idx(x:i32,y:i32,z:i32,N:i32)->i32 { return (z*N + y)*N + x; }

fn samp(x:i32,y:i32,z:i32,N:i32,c:vec3<f32>) -> f32 {
  if (x<0||y<0||z<0||x>=N||y>=N||z>=N) { return u.cs; }          // outside grid = reservoir
  let p = vec3<f32>(f32(x),f32(y),f32(z));
  if (distance(p,c) > u.rad) { return u.cs; }                     // outside sphere = reservoir
  return src[idx(x,y,z,N)];
}

@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let N = i32(u.N);
  let x = i32(gid.x); let y = i32(gid.y); let z = i32(gid.z);
  if (x>=N||y>=N||z>=N) { return; }
  let i = idx(x,y,z,N);
  let c = vec3<f32>(f32(N-1)*0.5);
  let p = vec3<f32>(f32(x),f32(y),f32(z));
  if (distance(p,c) > u.rad) { dst[i] = u.cs; return; }           // hold reservoir cells
  let lap = samp(x-1,y,z,N,c)+samp(x+1,y,z,N,c)
          + samp(x,y-1,z,N,c)+samp(x,y+1,z,N,c)
          + samp(x,y,z-1,N,c)+samp(x,y,z+1,N,c) - 6.0*src[i];
  var v = src[i] + u.alpha*dmul[i]*lap - u.kdt*src[i];
  dst[i] = clamp(v, 0.0, u.cs*4.0);
}`;

const RENDER_WGSL = `
struct R { N:u32, axis:u32, slice:f32, rad:f32, cs:f32, gain:f32, _a:f32, _b:f32 };
@group(0) @binding(0) var<uniform> r:R;
@group(0) @binding(1) var<storage, read> field:array<f32>;

struct VS { @builtin(position) pos:vec4<f32>, @location(0) uv:vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi:u32) -> VS {
  var p = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var o:VS; o.pos = vec4<f32>(p[vi],0.0,1.0); o.uv = p[vi]*0.5+0.5; return o;
}
fn idx(x:i32,y:i32,z:i32,N:i32)->i32 { return (z*N + y)*N + x; }
fn cmap(t:f32)->vec3<f32>{
  let s = clamp(t,0.0,1.0);
  let c0=vec3<f32>(0.05,0.03,0.18); let c1=vec3<f32>(0.20,0.10,0.45);
  let c2=vec3<f32>(0.13,0.40,0.55); let c3=vec3<f32>(0.20,0.72,0.47);
  let c4=vec3<f32>(0.95,0.90,0.15);
  if (s<0.25){return mix(c0,c1,s/0.25);}
  if (s<0.5){return mix(c1,c2,(s-0.25)/0.25);}
  if (s<0.75){return mix(c2,c3,(s-0.5)/0.25);}
  return mix(c3,c4,(s-0.75)/0.25);
}
@fragment fn fs(in:VS) -> @location(0) vec4<f32> {
  let N = i32(r.N);
  let a = in.uv.x*f32(N-1);
  let b = (1.0-in.uv.y)*f32(N-1);
  let s = r.slice;
  var x:i32; var y:i32; var z:i32;
  if (r.axis==2u){ x=i32(a); y=i32(b); z=i32(s); }
  else if (r.axis==1u){ x=i32(a); z=i32(b); y=i32(s); }
  else { y=i32(a); z=i32(b); x=i32(s); }
  if (x<0||y<0||z<0||x>=N||y>=N||z>=N){ return vec4<f32>(0.02,0.03,0.05,1.0); }
  let c = vec3<f32>(f32(N-1)*0.5);
  let p = vec3<f32>(f32(x),f32(y),f32(z));
  let d = distance(p,c);
  if (d > r.rad){ return vec4<f32>(0.02,0.03,0.05,1.0); }         // outside sphere disc
  if (abs(d - r.rad) < 0.9){ return vec4<f32>(0.9,0.92,0.95,1.0); } // boundary ring
  let v = field[idx(x,y,z,N)] / r.cs * r.gain;
  return vec4<f32>(cmap(v),1.0);
}`;

let device, ctx, format, compPipe, rendPipe;
let bufA, bufB, dmulBuf, current, other, compU, rendU, staging;
let compAB, compBA, rendA, rendB;
let N=64, radCells=64*RAD_FRAC, insideCount=1;
let playing=true, simtime=0, frame=0, readBusy=false;

function packCompute(alpha, kdt, cs){
  const ab=new ArrayBuffer(32); const dv=new DataView(ab);
  dv.setUint32(0,N,true); dv.setFloat32(4,alpha,true); dv.setFloat32(8,kdt,true);
  dv.setFloat32(12,cs,true); dv.setFloat32(16,radCells,true);
  return ab;
}
function packRender(axis,slice,cs,gain){
  const ab=new ArrayBuffer(32); const dv=new DataView(ab);
  dv.setUint32(0,N,true); dv.setUint32(4,axis,true); dv.setFloat32(8,slice,true);
  dv.setFloat32(12,radCells,true); dv.setFloat32(16,cs,true); dv.setFloat32(20,gain,true);
  return ab;
}

function build(newN){
  N=newN; radCells=N*RAD_FRAC;
  const cells=N*N*N; const bytes=cells*4;
  for (const b of [bufA,bufB,dmulBuf,staging]) b && b.destroy && b.destroy();
  const SU=GPUBufferUsage;
  bufA=device.createBuffer({size:bytes,usage:SU.STORAGE|SU.COPY_SRC|SU.COPY_DST});
  bufB=device.createBuffer({size:bytes,usage:SU.STORAGE|SU.COPY_SRC|SU.COPY_DST});
  dmulBuf=device.createBuffer({size:bytes,usage:SU.STORAGE|SU.COPY_DST});
  staging=device.createBuffer({size:bytes,usage:SU.COPY_DST|SU.MAP_READ});
  compU=compU||device.createBuffer({size:32,usage:SU.UNIFORM|SU.COPY_DST});
  rendU=rendU||device.createBuffer({size:32,usage:SU.UNIFORM|SU.COPY_DST});

  const cl=compPipe.getBindGroupLayout(0), rl=rendPipe.getBindGroupLayout(0);
  compAB=device.createBindGroup({layout:cl,entries:[{binding:0,resource:{buffer:compU}},{binding:1,resource:{buffer:bufA}},{binding:2,resource:{buffer:bufB}},{binding:3,resource:{buffer:dmulBuf}}]});
  compBA=device.createBindGroup({layout:cl,entries:[{binding:0,resource:{buffer:compU}},{binding:1,resource:{buffer:bufB}},{binding:2,resource:{buffer:bufA}},{binding:3,resource:{buffer:dmulBuf}}]});
  rendA=device.createBindGroup({layout:rl,entries:[{binding:0,resource:{buffer:rendU}},{binding:1,resource:{buffer:bufA}}]});
  rendB=device.createBindGroup({layout:rl,entries:[{binding:0,resource:{buffer:rendU}},{binding:1,resource:{buffer:bufB}}]});
  buildDmul();
  reset();
}

// Per-cell diffusivity multiplier ∈ [0,1] — encodes the spatial structure that
// makes each non-Fickian regime. Stays ≤1 so the explicit scheme stays stable.
function buildDmul(){
  if (!dmulBuf) return;
  const cells=N*N*N; const dm=new Float32Array(cells); const c=(N-1)*0.5;
  const regime=$('regime').value;
  const shellFrac=+$('shellFrac').value, shellD=+$('shellD').value, het=+$('het').value;
  let rng=0x9e3779b9>>>0;
  const rnd=()=>{ rng=(rng*1664525+1013904223)>>>0; return rng/4294967296; };
  for (let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const rho=Math.hypot(x-c,y-c,z-c)/radCells; const i=(z*N+y)*N+x;
    let v=1.0;
    if (regime==='coreshell'){ v = (rho > 1-shellFrac) ? shellD : 1.0; }   // slow outer shell
    else if (regime==='hetero'){ v = het + (1-het)*rnd(); }                // quenched disorder
    dm[i]=v;
  }
  device.queue.writeBuffer(dmulBuf,0,dm);
}

function reset(){
  const cells=N*N*N; const init=new Float32Array(cells);
  const cs=+$('cs').value; const c=(N-1)*0.5; insideCount=0;
  for (let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const d=Math.hypot(x-c,y-c,z-c); const i=(z*N+y)*N+x;
    if (d>radCells){ init[i]=cs; } else { init[i]=0; insideCount++; }
  }
  device.queue.writeBuffer(bufA,0,init);
  device.queue.writeBuffer(bufB,0,init);
  current=bufA; other=bufB; simtime=0; frame=0;
  $('simtime').textContent='t = 0 s';
}

function arrhenius(){
  const D0=+$('D0').value, Ea=+$('Ea').value, T=+$('T').value;
  return D0*Math.exp(-Ea*1000/(8.314*T)); // µm²/s
}

function step(){
  const D=arrhenius();
  const Rum=+$('Rum').value; const dx=Rum/radCells; // µm per cell
  const dt=+$('dt').value; const k=+$('k').value; const cs=+$('cs').value;
  const alphaRaw=D*dt/(dx*dx);
  let sub=Math.max(1, Math.ceil(alphaRaw/0.12)); sub=Math.min(sub,80);
  const alpha=alphaRaw/sub; const kdt=k*dt/sub;
  $('Dnow').textContent=D.toExponential(2)+' µm²/s';
  $('stab').textContent=`dx=${dx.toFixed(3)}µm · α=${alpha.toFixed(3)} · ${sub} substep${sub>1?'s':''}/step`
    +(sub>=80?' ⚠ raise dt or grid':'');

  device.queue.writeBuffer(compU,0,packCompute(alpha,kdt,cs));
  const wg=Math.ceil(N/4);
  const enc=device.createCommandEncoder();
  for (let s=0;s<sub;s++){
    const pass=enc.beginComputePass();
    pass.setPipeline(compPipe);
    pass.setBindGroup(0, current===bufA?compAB:compBA);
    pass.dispatchWorkgroups(wg,wg,wg);
    pass.end();
    const t=current; current=other; other=t;
  }
  device.queue.submit([enc.finish()]);
  simtime+=dt;
}

function renderFrame(){
  const axis=+$('axis').value; const cs=+$('cs').value; const gain=+$('gain').value;
  const slice=Math.round(+$('slice').value/100*(N-1));
  device.queue.writeBuffer(rendU,0,packRender(axis,slice,cs,gain));
  const enc=device.createCommandEncoder();
  const pass=enc.beginRenderPass({colorAttachments:[{view:ctx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
  pass.setPipeline(rendPipe);
  pass.setBindGroup(0, current===bufA?rendA:rendB);
  pass.draw(3); pass.end();
  device.queue.submit([enc.finish()]);
}

async function sampleFill(){
  if (readBusy) return; readBusy=true;
  const bytes=N*N*N*4;
  const enc=device.createCommandEncoder();
  enc.copyBufferToBuffer(current,0,staging,0,bytes);
  device.queue.submit([enc.finish()]);
  try{
    await staging.mapAsync(GPUMapMode.READ);
    const data=new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    const cs=+$('cs').value; const c=(N-1)*0.5; let sum=0;
    for (let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      if (Math.hypot(x-c,y-c,z-c)<=radCells) sum+=data[(z*N+y)*N+x];
    }
    const frac=sum/(insideCount*cs);
    $('fill').textContent=`filled ${(frac*100).toFixed(1)}%`;
  }catch(e){/* ignore */}
  readBusy=false;
}

function loop(){
  if (playing){
    const spf=+$('spf').value;
    for (let i=0;i<spf;i++) step();
    $('simtime').textContent=`t = ${simtime.toFixed(1)} s`;
    if (frame++ % 30===0) sampleFill();
  }
  renderFrame();
  requestAnimationFrame(loop);
}

async function boot(){
  if (!navigator.gpu){ $('ver').textContent='no webgpu'; $('gpu').style.display='none'; $('nogpu').style.display='block'; return; }
  const adapter=await navigator.gpu.requestAdapter();
  if (!adapter){ $('ver').textContent='no adapter'; $('gpu').style.display='none'; $('nogpu').style.display='block'; return; }
  device=await adapter.requestDevice();
  ctx=$('gpu').getContext('webgpu');
  format=navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({device,format,alphaMode:'opaque'});
  const cMod=device.createShaderModule({code:COMPUTE_WGSL});
  const rMod=device.createShaderModule({code:RENDER_WGSL});
  compPipe=device.createComputePipeline({layout:'auto',compute:{module:cMod,entryPoint:'main'}});
  rendPipe=device.createRenderPipeline({layout:'auto',vertex:{module:rMod,entryPoint:'vs'},fragment:{module:rMod,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
  build(+$('N').value);
  $('ver').textContent='webgpu ready';
  loop();
}

// ---- controls ----
$('play').addEventListener('click',()=>{ playing=!playing; $('play').textContent=playing?'⏸ Pause':'▶ Play'; });
$('reset').addEventListener('click',()=>{ reset(); flash('reset'); });
$('N').addEventListener('change',e=>{ build(+e.target.value); flash('grid '+e.target.value); });
$('cs').addEventListener('input',e=>{ $('csV').textContent=(+e.target.value).toFixed(2); });
$('cs').addEventListener('change',reset);

$('regime').addEventListener('change',()=>{
  const r=$('regime').value;
  if (r==='thiele'){ $('k').value=0.01; $('kV').textContent='0.01'; } else { $('k').value=0; $('kV').textContent='0'; }
  if (r==='coreshell'){ $('shellFrac').value=0.22; $('shellFracV').textContent='0.22'; $('shellD').value=0.12; $('shellDV').textContent='0.12'; }
  if (r==='hetero'){ $('het').value=0.30; $('hetV').textContent='0.30'; }
  buildDmul(); reset(); flash('regime: '+r);
});
for (const [id,vid] of [['shellFrac','shellFracV'],['shellD','shellDV'],['het','hetV']])
  $(id).addEventListener('input',e=>{ $(vid).textContent=(+e.target.value).toFixed(2); buildDmul(); });
for (const [id,vid,f] of [['slice','sliceV',v=>v+'%'],['gain','gainV',v=>(+v).toFixed(1)],['T','TV',v=>v],['k','kV',v=>v],['spf','spfV',v=>v]])
  $(id).addEventListener('input',e=>$(vid).textContent=f(e.target.value));

boot().catch(e=>{ console.error(e); $('ver').textContent='gpu error'; $('gpu').style.display='none'; $('nogpu').style.display='block'; $('nogpu').querySelector('p').textContent=String(e); });
