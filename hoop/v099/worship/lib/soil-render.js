// ─────────────────────────────────────────────────────────────────────────────
// soil-render.js — the lit soil-field renderer, shared by every site built on the
// soil engine (soil, geocast, …). WebGPU first (height texture → WGSL Lambert +
// curvature AO + procedural grain + desiccation cracks), with a Canvas2D hillshade
// fallback so it works everywhere.
//
//   const r = await makeRenderer(canvas, { N, zScale, crackFreq, crackMask });
//   r.render(field, props);   // field: a soil.Field; props: soilProps(...)
//   r.resize(wPx, hPx);
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const WGSL = `
struct Uni { res:vec2f, gN:f32, zScale:f32, light:vec4f, color:vec4f, grain:vec4f, extra:vec4f };
@group(0) @binding(0) var<uniform> U: Uni;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) vi:u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1.,-1.), vec2f(3.,-1.), vec2f(-1.,3.));
  return vec4f(p[vi], 0., 1.);
}
fn hsh(p:vec2f)->f32{ return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn hsh2(p:vec2f)->vec2f{ return fract(sin(vec2f(dot(p,vec2f(127.1,311.7)),dot(p,vec2f(269.5,183.3))))*43758.5453); }
fn vnoise(p:vec2f)->f32{ let i=floor(p); let f=fract(p); let u=f*f*(3.-2.*f);
  let a=hsh(i); let b=hsh(i+vec2f(1.,0.)); let c=hsh(i+vec2f(0.,1.)); let d=hsh(i+vec2f(1.,1.));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
fn worleyCrack(uv:vec2f, freq:f32)->f32{
  let p=uv*freq; let ip=floor(p); let fp=fract(p); var f1=9.0; var f2=9.0;
  for(var j=-1;j<=1;j=j+1){ for(var i=-1;i<=1;i=i+1){
    let g=vec2f(f32(i),f32(j)); let o=hsh2(ip+g); let d=length(g+o-fp);
    if(d<f1){ f2=f1; f1=d; } else if(d<f2){ f2=d; } } }
  return 1.0 - smoothstep(0.0, 0.05, f2-f1); }
fn loadH(p:vec2i)->f32{ let n=i32(U.gN); return textureLoad(heightTex, vec2i(clamp(p.x,0,n-1),clamp(p.y,0,n-1)), 0).r; }
@fragment fn fs(@builtin(position) frag:vec4f) -> @location(0) vec4f {
  let uv = frag.xy / U.res;
  let p = vec2i(i32(uv.x*U.gN), i32(uv.y*U.gN));
  let hC = loadH(p);
  let gx = loadH(p+vec2i(1,0)) - loadH(p-vec2i(1,0));
  let gy = loadH(p+vec2i(0,1)) - loadH(p-vec2i(0,1));
  let nrm = normalize(vec3f(-gx*U.zScale, -gy*U.zScale, 2.0));
  let lit = max(dot(nrm, normalize(U.light.xyz)), 0.0);
  let lap = (loadH(p+vec2i(1,0))+loadH(p-vec2i(1,0))+loadH(p+vec2i(0,1))+loadH(p-vec2i(0,1)))*0.25 - hC;
  let ao = clamp(0.5 - lap*0.5, 0.0, 1.0);
  var shade = (U.light.w + (1.0-U.light.w)*lit) * mix(0.82, 1.12, ao);
  let g = (vnoise(uv*U.grain.y*U.gN) - 0.5) * U.grain.x;
  var col = U.color.rgb * shade + vec3f(g);
  let crackI = U.extra.x;
  if(crackI > 0.001){ let cr = worleyCrack(uv, U.extra.y) * crackI; col = col * (1.0 - 0.62*cr); }
  return vec4f(clamp(col, vec3f(0.), vec3f(1.)), 1.0);
}`;

async function makeWebGPU(canvas, opts){
  const { N, zScale, crackFreq } = opts;
  if(!navigator.gpu) return null;
  let device;
  try{ const ad=await navigator.gpu.requestAdapter(); if(!ad) return null; device=await ad.requestDevice(); }
  catch(e){ return null; }
  const ctx=canvas.getContext('webgpu'); if(!ctx) return null;
  const format=navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({device,format,alphaMode:'opaque'});
  const module=device.createShaderModule({code:WGSL});
  const pipeline=device.createRenderPipeline({layout:'auto',
    vertex:{module,entryPoint:'vs'}, fragment:{module,entryPoint:'fs',targets:[{format}]},
    primitive:{topology:'triangle-list'}});
  const uni=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const tex=device.createTexture({size:[N,N],format:'r32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),
    entries:[{binding:0,resource:{buffer:uni}},{binding:1,resource:tex.createView()}]});
  const ubuf=new Float32Array(20);
  return { kind:'webgpu',
    render(field, props){
      device.queue.writeTexture({texture:tex}, field.h, {bytesPerRow:N*4,rowsPerImage:N}, {width:N,height:N});
      ubuf[0]=canvas.width; ubuf[1]=canvas.height; ubuf[2]=N; ubuf[3]=zScale;
      ubuf[4]=-0.55; ubuf[5]=-0.5; ubuf[6]=0.66; ubuf[7]=0.34;
      ubuf[8]=props.color.r; ubuf[9]=props.color.g; ubuf[10]=props.color.b; ubuf[11]=props.sand;
      ubuf[12]=props.grain.amp; ubuf[13]=props.grain.scale; ubuf[14]=props.grain.roughness; ubuf[15]=0;
      ubuf[16]=props.crack; ubuf[17]=crackFreq; ubuf[18]=props.wet; ubuf[19]=0;
      device.queue.writeBuffer(uni,0,ubuf);
      const enc=device.createCommandEncoder();
      const pass=enc.beginRenderPass({colorAttachments:[{view:ctx.getCurrentTexture().createView(),
        clearValue:{r:0.05,g:0.04,b:0.03,a:1},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(pipeline); pass.setBindGroup(0,bind); pass.draw(3); pass.end();
      device.queue.submit([enc.finish()]);
    },
    resize(w,h){ canvas.width=w; canvas.height=h; } };
}

function makeCanvas2D(canvas, opts){
  const { N, zScale, crackMask } = opts;
  const ctx=canvas.getContext('2d');
  const off=document.createElement('canvas'); off.width=N; off.height=N;
  const octx=off.getContext('2d'); const img=octx.createImageData(N,N);
  let grain=new Float32Array(N*N), grainKey='';
  function buildGrain(props){ const key=props.grain.amp.toFixed(3)+'/'+props.grain.scale.toFixed(2);
    if(key===grainKey) return; grainKey=key;
    const hash=(x,y)=>{ let h=Math.imul(x*374761393 ^ y*668265263, 1274126177); h^=h>>>13; return ((h>>>0)/4294967296); };
    const sc=props.grain.scale;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const fx=x/N*sc*N/24, fy=y/N*sc*N/24;
      const ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
      const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
      const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
      const v=a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy; grain[y*N+x]=(v-0.5)*props.grain.amp; } }
  const L=[-0.55,-0.5,0.66]; { const m=Math.hypot(...L); L[0]/=m;L[1]/=m;L[2]/=m; }
  return { kind:'canvas2d',
    render(field, props){
      buildGrain(props);
      const h=field.h, d=img.data, col=props.color, amb=0.34, crackI=props.crack;
      for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const i=y*N+x;
        const xr=x<N-1?i+1:i, xl=x>0?i-1:i, yd=y<N-1?i+N:i, yu=y>0?i-N:i;
        const gx=h[xr]-h[xl], gy=h[yd]-h[yu];
        const nx=-gx*zScale, ny=-gy*zScale, il=1/Math.hypot(nx,ny,2);
        const lit=Math.max(0,(nx*il)*L[0]+(ny*il)*L[1]+(2*il)*L[2]);
        const lap=(h[xr]+h[xl]+h[yd]+h[yu])*0.25 - h[i];
        const ao=Math.max(0,Math.min(1,0.5-lap*0.5));
        let shade=(amb+(1-amb)*lit)*(0.82+0.30*ao);
        const g=grain[i];
        let r=col.r*shade+g, gg=col.g*shade+g, b=col.b*shade+g;
        if(crackI>0.001 && crackMask){ const cr=crackMask[i]*crackI*0.62; r*=(1-cr); gg*=(1-cr); b*=(1-cr); }
        const j=i*4;
        d[j]=Math.max(0,Math.min(255,r*255)); d[j+1]=Math.max(0,Math.min(255,gg*255));
        d[j+2]=Math.max(0,Math.min(255,b*255)); d[j+3]=255;
      }
      octx.putImageData(img,0,0);
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(off,0,0,canvas.width,canvas.height);
    },
    resize(w,h){ canvas.width=w; canvas.height=h; } };
}

// WebGPU if available, else Canvas2D. opts = { N, zScale, crackFreq=9, crackMask }
export async function makeRenderer(canvas, opts){
  const o = Object.assign({ crackFreq:9 }, opts);
  return (await makeWebGPU(canvas, o)) || makeCanvas2D(canvas, o);
}
