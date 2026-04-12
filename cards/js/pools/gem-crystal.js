// ── Crystal Renderer — WebGPU with Canvas 2D fallback ────────
// Generates parametric crystal geometry from crystal system,
// renders with WebGPU when available, falls back to Canvas 2D
// with painter's algorithm flat shading on mobile.

let gpuDevice, gpuContext, gpuPipeline, gpuDepthTex, gpuUBO, gpuBindGroup;
let gpuVB, gpuIB, gpuIdxCount;
let canvas, animId;
let useGpu = false;

// Camera
let rotX = -0.4, rotY = 0.6;
let dragging = false, lastX = 0, lastY = 0;

// ── Geometry builders (shared by both renderers) ────────────

function quad(a, b, c, d) { return [[a, b, c], [a, c, d]]; }

function buildRawGeometry(system) {
  switch (system) {
    case "cubic": return rawCubic();
    case "tetragonal": return rawTetragonal();
    case "orthorhombic": return rawOrthorhombic();
    case "hexagonal": return rawHexagonal();
    case "trigonal": return rawTrigonal();
    case "monoclinic": return rawMonoclinic();
    case "triclinic": return rawTriclinic();
    default: return rawCubic();
  }
}

function rawCubic() {
  const s = 1.0;
  const v = [[0,s,0],[0,-s,0],[s,0,0],[-s,0,0],[0,0,s],[0,0,-s]];
  const t = [[0,4,2],[0,2,5],[0,5,3],[0,3,4],[1,2,4],[1,5,2],[1,3,5],[1,4,3]];
  return { verts: v, tris: t };
}

function rawTetragonal() {
  const s = 0.7, h = 1.3;
  const v = [[0,h,0],[0,-h,0],[s,0,0],[-s,0,0],[0,0,s],[0,0,-s]];
  const t = [[0,4,2],[0,2,5],[0,5,3],[0,3,4],[1,2,4],[1,5,2],[1,3,5],[1,4,3]];
  return { verts: v, tris: t };
}

function rawOrthorhombic() {
  const a=0.6, b=0.9, c=1.2;
  const v = [[-a,-b,-c],[a,-b,-c],[a,b,-c],[-a,b,-c],[-a,-b,c],[a,-b,c],[a,b,c],[-a,b,c]];
  const t = [...quad(0,1,2,3),...quad(4,7,6,5),...quad(0,3,7,4),...quad(1,5,6,2),...quad(3,2,6,7),...quad(0,4,5,1)];
  return { verts: v, tris: t };
}

function rawHexagonal() {
  const r=0.75, h=0.8, tip=1.4;
  const v = [];
  for (let i=0;i<6;i++){const a=Math.PI/3*i;v.push([r*Math.cos(a),-h,r*Math.sin(a)])}
  for (let i=0;i<6;i++){const a=Math.PI/3*i;v.push([r*Math.cos(a),h,r*Math.sin(a)])}
  v.push([0,-tip,0],[0,tip,0]);
  const t = [];
  for (let i=0;i<6;i++){const j=(i+1)%6;t.push([i,j,j+6],[i,j+6,i+6],[12,j,i],[13,i+6,j+6])}
  return { verts: v, tris: t };
}

function rawTrigonal() {
  const r=0.75, h=0.7, tip=1.5;
  const v = [];
  for (let i=0;i<3;i++){const a=Math.PI*2/3*i-Math.PI/6;v.push([r*Math.cos(a),-h,r*Math.sin(a)])}
  for (let i=0;i<3;i++){const a=Math.PI*2/3*i-Math.PI/6+Math.PI/6;v.push([r*0.6*Math.cos(a),h,r*0.6*Math.sin(a)])}
  v.push([0,-tip*0.5,0],[0,tip,0]);
  const t = [];
  for (let i=0;i<3;i++){const j=(i+1)%3;t.push([i,j,j+3],[i,j+3,i+3],[6,j,i],[7,i+3,j+3])}
  return { verts: v, tris: t };
}

function rawMonoclinic() {
  const a=0.6, b=1.0, c=0.7, sk=0.3;
  const v = [[-a+sk,-b,-c],[a+sk,-b,-c],[a+sk,-b,c],[-a+sk,-b,c],[-a-sk,b,-c],[a-sk,b,-c],[a-sk,b,c],[-a-sk,b,c]];
  const t = [...quad(0,1,2,3),...quad(4,7,6,5),...quad(0,3,7,4),...quad(1,5,6,2),...quad(3,2,6,7),...quad(0,4,5,1)];
  return { verts: v, tris: t };
}

function rawTriclinic() {
  const sx=0.15, sy=0.25, sz=0.1;
  const v = [[-0.5+sx,-1,-0.6+sz],[0.5+sx,-1,-0.5+sz],[0.6,-1,0.5],[-0.6,-1,0.6],
             [-0.4-sx,1+sy,-0.5-sz],[0.6-sx,0.9+sy,-0.6-sz],[0.5,1.1,0.6],[-0.5,1,0.5]];
  const t = [...quad(0,1,2,3),...quad(4,7,6,5),...quad(0,3,7,4),...quad(1,5,6,2),...quad(3,2,6,7),...quad(0,4,5,1)];
  return { verts: v, tris: t };
}

// ── Matrix helpers ──────────────────────────────────────────

function rotXMat(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return [1,0,0, 0,c,-s, 0,s,c];
}
function rotYMat(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return [c,0,s, 0,1,0, -s,0,c];
}
function mul3(m, v) {
  return [
    m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
    m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
    m[6]*v[0]+m[7]*v[1]+m[8]*v[2],
  ];
}
function mul33(a, b) {
  const r = new Array(9);
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
    r[i*3+j] = a[i*3+0]*b[0*3+j] + a[i*3+1]*b[1*3+j] + a[i*3+2]*b[2*3+j];
  }
  return r;
}

// 4x4 for WebGPU path
function mat4Persp(fov, asp, near, far) {
  const f=1/Math.tan(fov/2), r=1/(near-far);
  return new Float32Array([f/asp,0,0,0, 0,f,0,0, 0,0,(far+near)*r,-1, 0,0,2*far*near*r,0]);
}
function mat4RotX(a){const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]}
function mat4RotY(a){const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]}
function mat4Trans(x,y,z){return[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]}
function mat4Mul(a,b){const r=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)r[i*4+j]+=a[i*4+k]*b[k*4+j];return r}

// ── GPU-specific mesh conversion ────────────────────────────

function flatMeshGPU(verts, tris) {
  const pos=[], nrm=[], idx=[];
  for (const [a,b,c] of tris) {
    const va=verts[a], vb=verts[b], vc=verts[c];
    const ux=vb[0]-va[0],uy=vb[1]-va[1],uz=vb[2]-va[2];
    const vx=vc[0]-va[0],vy=vc[1]-va[1],vz=vc[2]-va[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=len;ny/=len;nz/=len;
    const base=pos.length/3;
    pos.push(va[0],va[1],va[2],vb[0],vb[1],vb[2],vc[0],vc[1],vc[2]);
    nrm.push(nx,ny,nz,nx,ny,nz,nx,ny,nz);
    idx.push(base,base+1,base+2);
  }
  const vd=new Float32Array(pos.length*2);
  for (let i=0;i<pos.length/3;i++){
    vd[i*6]=pos[i*3];vd[i*6+1]=pos[i*3+1];vd[i*6+2]=pos[i*3+2];
    vd[i*6+3]=nrm[i*3];vd[i*6+4]=nrm[i*3+1];vd[i*6+5]=nrm[i*3+2];
  }
  return { vertData: vd, indices: new Uint16Array(idx) };
}

// ── Pointer input (shared) ──────────────────────────────────

function bindPointer(cvs) {
  cvs.addEventListener("pointerdown", e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    cvs.setPointerCapture(e.pointerId);
  });
  cvs.addEventListener("pointermove", e => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.008;
    rotX += (e.clientY - lastY) * 0.008;
    rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
    lastX = e.clientX; lastY = e.clientY;
  });
  cvs.addEventListener("pointerup", () => { dragging = false; });
  cvs.style.touchAction = "none";
}

// ── WebGPU Shader ───────────────────────────────────────────

const SHADER = `
struct U { mvp:mat4x4f, model:mat4x4f, baseColor:vec4f, lightDir:vec4f, opacity:f32, _p:vec3f }
@group(0)@binding(0) var<uniform> u:U;
struct V { @builtin(position) pos:vec4f, @location(0) n:vec3f, @location(1) wp:vec3f }
@vertex fn vs(@location(0) p:vec3f,@location(1) n:vec3f)->V {
  var o:V; o.pos=u.mvp*vec4f(p,1); o.n=(u.model*vec4f(n,0)).xyz; o.wp=(u.model*vec4f(p,1)).xyz; return o;
}
@fragment fn fs(v:V)->@location(0) vec4f {
  let N=normalize(v.n); let L=normalize(u.lightDir.xyz);
  let d=max(dot(N,L),0.0); let vd=normalize(vec3f(0,0,3)-v.wp);
  let H=normalize(L+vd); let s=pow(max(dot(N,H),0.0),64.0);
  let fr=pow(1.0-max(dot(N,vd),0.0),3.0);
  let c=u.baseColor.rgb*(0.15+d*0.7)+vec3f(1)*s*0.5+vec3f(0.3,0.4,0.5)*fr*0.3;
  return vec4f(c,mix(0.6,1.0,u.opacity));
}`;

// ── Public API ──────────────────────────────────────────────

export async function initCrystalViewer(cvs) {
  canvas = cvs;
  if (animId) { cancelAnimationFrame(animId); animId = null; }

  // Size canvas to CSS display size for crisp rendering
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = (rect.width * dpr) | 0;
  canvas.height = (rect.height * dpr) | 0;

  // Try WebGPU
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        gpuDevice = await adapter.requestDevice();
        gpuContext = canvas.getContext("webgpu");
        const fmt = navigator.gpu.getPreferredCanvasFormat();
        gpuContext.configure({ device: gpuDevice, format: fmt, alphaMode: "premultiplied" });

        const sm = gpuDevice.createShaderModule({ code: SHADER });
        gpuPipeline = gpuDevice.createRenderPipeline({
          layout: "auto",
          vertex: { module: sm, entryPoint: "vs", buffers: [{
            arrayStride: 24,
            attributes: [{ shaderLocation:0, offset:0, format:"float32x3" },{ shaderLocation:1, offset:12, format:"float32x3" }],
          }]},
          fragment: { module: sm, entryPoint: "fs", targets: [{ format: fmt, blend: {
            color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},
            alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"},
          }}]},
          primitive: { topology:"triangle-list", cullMode:"back" },
          depthStencil: { depthWriteEnabled:true, depthCompare:"less", format:"depth24plus" },
        });

        gpuUBO = gpuDevice.createBuffer({ size:256, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
        gpuBindGroup = gpuDevice.createBindGroup({ layout: gpuPipeline.getBindGroupLayout(0), entries:[{binding:0,resource:{buffer:gpuUBO}}] });
        gpuDepthTex = gpuDevice.createTexture({ size:[canvas.width,canvas.height], format:"depth24plus", usage:GPUTextureUsage.RENDER_ATTACHMENT });

        bindPointer(canvas);
        useGpu = true;
        return true;
      }
    } catch(e) { console.warn("WebGPU init failed, using Canvas 2D", e); }
  }

  // Canvas 2D fallback
  useGpu = false;
  bindPointer(canvas);
  return true; // always succeed — Canvas 2D is universal
}

export function renderCrystal(system, props) {
  if (animId) cancelAnimationFrame(animId);
  rotX = -0.4; rotY = 0.6;
  let autoSpin = true;
  canvas.addEventListener("pointerdown", () => { autoSpin = false; }, { once: true });

  const raw = buildRawGeometry(system);

  if (useGpu) {
    renderGPU(raw, props, () => autoSpin);
  } else {
    render2D(raw, props, () => autoSpin);
  }
}

// ── WebGPU render loop ──────────────────────────────────────

function renderGPU(raw, props, getAutoSpin) {
  const { vertData, indices } = flatMeshGPU(raw.verts, raw.tris);
  gpuIdxCount = indices.length;
  gpuVB = gpuDevice.createBuffer({ size: vertData.byteLength, usage: GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
  gpuDevice.queue.writeBuffer(gpuVB, 0, vertData);
  gpuIB = gpuDevice.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST });
  gpuDevice.queue.writeBuffer(gpuIB, 0, indices);

  function frame() {
    if (getAutoSpin()) rotY += 0.008;
    const asp = canvas.width/canvas.height;
    const proj = mat4Persp(Math.PI/4, asp, 0.1, 100);
    const view = mat4Trans(0,0,-4);
    const model = mat4Mul(mat4RotX(rotX), mat4RotY(rotY));
    const mvp = mat4Mul(mat4Mul(proj, view), model);

    const f = new Float32Array(64);
    f.set(mvp,0); f.set(model,16); f.set(props.color,32);
    f[36]=0.5;f[37]=0.8;f[38]=0.6;f[39]=0; f[40]=props.opacity;
    gpuDevice.queue.writeBuffer(gpuUBO, 0, f);

    const enc = gpuDevice.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments:[{view:gpuContext.getCurrentTexture().createView(),clearValue:{r:0.06,g:0.06,b:0.08,a:1},loadOp:"clear",storeOp:"store"}],
      depthStencilAttachment:{view:gpuDepthTex.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"},
    });
    pass.setPipeline(gpuPipeline);
    pass.setBindGroup(0,gpuBindGroup);
    pass.setVertexBuffer(0,gpuVB);
    pass.setIndexBuffer(gpuIB,"uint16");
    pass.drawIndexed(gpuIdxCount);
    pass.end();
    gpuDevice.queue.submit([enc.finish()]);
    animId = requestAnimationFrame(frame);
  }
  frame();
}

// ── Canvas 2D render loop (mobile fallback) ─────────────────

function render2D(raw, props, getAutoSpin) {
  const ctx = canvas.getContext("2d");
  const { verts, tris } = raw;
  const [cr, cg, cb] = props.color;
  const lightDir = [0.5, 0.8, 0.6];
  const lLen = Math.sqrt(lightDir[0]**2+lightDir[1]**2+lightDir[2]**2);
  lightDir[0]/=lLen; lightDir[1]/=lLen; lightDir[2]/=lLen;

  function frame() {
    if (getAutoSpin()) rotY += 0.008;

    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f0f14";
    ctx.fillRect(0, 0, w, h);

    const model = mul33(rotXMat(rotX), rotYMat(rotY));

    // Transform vertices
    const tv = verts.map(v => mul3(model, v));

    // Build face list with depth + normal
    const faces = tris.map(([a,b,c]) => {
      const va=tv[a], vb=tv[b], vc=tv[c];
      // Face normal
      const ux=vb[0]-va[0],uy=vb[1]-va[1],uz=vb[2]-va[2];
      const vx=vc[0]-va[0],vy=vc[1]-va[1],vz=vc[2]-va[2];
      let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      nx/=len;ny/=len;nz/=len;
      // Back-face cull (camera at z=+4 looking at -z)
      if (nz < 0) return null;
      // Depth (average z for painter's sort)
      const depth = (va[2]+vb[2]+vc[2])/3;
      // Diffuse lighting
      const diff = Math.max(nx*lightDir[0]+ny*lightDir[1]+nz*lightDir[2], 0);
      const ambient = 0.15;
      const lit = ambient + diff * 0.7;
      // Specular
      const hx=lightDir[0], hy=lightDir[1], hz=lightDir[2]+1;
      const hLen=Math.sqrt(hx*hx+hy*hy+hz*hz)||1;
      const spec = Math.pow(Math.max((nx*hx+ny*hy+nz*hz)/hLen, 0), 64) * 0.5;
      // Fresnel rim
      const fresnel = Math.pow(1 - Math.max(nz, 0), 3) * 0.25;

      const r = Math.min(255, ((cr * lit + spec + 0.3*fresnel) * 255)|0);
      const g = Math.min(255, ((cg * lit + spec + 0.4*fresnel) * 255)|0);
      const b = Math.min(255, ((cb * lit + spec + 0.5*fresnel) * 255)|0);
      const alpha = 0.6 + 0.4 * props.opacity;

      return { va, vb, vc, depth, r, g, b, alpha };
    }).filter(Boolean);

    // Painter's algorithm: draw far faces first
    faces.sort((a, b) => a.depth - b.depth);

    const scale = Math.min(w, h) * 0.28;
    const cx = w / 2, cy = h / 2;
    const px = v => cx + v[0] * scale;
    const py = v => cy - v[1] * scale;

    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(px(f.va), py(f.va));
      ctx.lineTo(px(f.vb), py(f.vb));
      ctx.lineTo(px(f.vc), py(f.vc));
      ctx.closePath();

      ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.alpha})`;
      ctx.fill();
      // Subtle edge highlight
      ctx.strokeStyle = `rgba(${Math.min(255,f.r+40)},${Math.min(255,f.g+40)},${Math.min(255,f.b+40)},${f.alpha*0.4})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    animId = requestAnimationFrame(frame);
  }
  frame();
}
