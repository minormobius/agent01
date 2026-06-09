// ── AR Crystal — two-phone Laue diffraction ──────────────────
// One phone is the CRYSTAL (computes the diffraction from its own tilt,
// streams the dot cloud, knows the secret mineral). The other is the
// DETECTOR (catches the dots in space with a magic-window AR view and
// guesses the crystal system). iOS-first: no WebXR, just DeviceOrientation
// + camera passthrough, all behind a user-gesture permission prompt.

import {
  computeSpots, detectSymmetry, buildHabit, quatToMat3,
  ROSTER, SYSTEMS, SYS_LABEL, SYS_AXES, prepSpecimen,
} from './laue.js';

// ── quaternion helpers ([x,y,z,w]) ───────────────────────────
const qMul=(a,b)=>{const[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;return[
  aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx,
  aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz];};
const qConj=q=>[-q[0],-q[1],-q[2],q[3]];
const qAxisAngle=(ax,ang)=>{const h=ang/2,s=Math.sin(h);return[ax[0]*s,ax[1]*s,ax[2]*s,Math.cos(h)];};
function qFromEulerYXZ(x,y,z){ // three.js 'YXZ'
  const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2);
  const s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);
  return [
    s1*c2*c3 + c1*s2*s3,
    c1*s2*c3 - s1*c2*s3,
    c1*c2*s3 - s1*s2*c3,
    c1*c2*c3 + s1*s2*s3,
  ];
}
function vRot(v,q){ // rotate vector v by quaternion q
  const [x,y,z,w]=q;
  const tx=2*(y*v[2]-z*v[1]), ty=2*(z*v[0]-x*v[2]), tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+(y*tz-z*ty), v[1]+w*ty+(z*tx-x*tz), v[2]+w*tz+(x*ty-y*tx)];
}
// device-orientation Euler → quaternion (device frame → world)
function quatFromDevice(alpha,beta,gamma,orient){
  const q = qFromEulerYXZ(beta, alpha, -gamma);
  return qMul(q, qAxisAngle([0,0,1], -orient));   // screen rotation
}
// embedding: at calibration, beam (+z lab) maps to camera-forward (device -z)
const E = qAxisAngle([1,0,0], Math.PI);  // 180° about x: z→-z, y→-y

// ── DOM ──────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const screens={landing:$('landing'),emitter:$('emitter'),detector:$('detector')};
function show(name){ for(const k in screens) screens[k].classList.toggle('on', k===name); }

// ── shared state ─────────────────────────────────────────────
let ws=null, role=null, roomCode=null, peers=[];
let q0=null;                 // calibration quaternion
let qNow=[0,0,0,1];          // live device quaternion
let orient=0;
let haveOrientation=false;

function setStatus(t){ const e=$(role==='emitter'?'eStatus':'dStatus'); if(e) e.textContent=t; }

// ── sensors (iOS permission-gated) ───────────────────────────
async function requestSensors(){
  const D=window.DeviceOrientationEvent, M=window.DeviceMotionEvent;
  try{
    if(D && typeof D.requestPermission==='function'){ const r=await D.requestPermission(); if(r!=='granted') return false; }
    if(M && typeof M.requestPermission==='function'){ try{ await M.requestPermission(); }catch{} }
  }catch(e){ return false; }
  window.addEventListener('deviceorientation', onOrient, true);
  return true;
}
function onOrient(e){
  if(e.alpha==null && e.beta==null && e.gamma==null) return;
  orient = (screen.orientation && screen.orientation.angle || window.orientation || 0) * Math.PI/180;
  const a=(e.alpha||0)*Math.PI/180, b=(e.beta||0)*Math.PI/180, g=(e.gamma||0)*Math.PI/180;
  qNow = quatFromDevice(a,b,g,orient);
  haveOrientation=true;
  if(!q0) q0=qNow.slice();
}
function calibrate(){ q0=qNow.slice(); }
// device's rotation relative to its calibration pose
function relQuat(){ return qMul(qConj(q0||[0,0,0,1]), qNow); }

// ── networking ───────────────────────────────────────────────
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/api/room/${roomCode}`);
  ws.onopen=()=>{ ws.send(JSON.stringify({type:'hello',role})); setStatus('connected · waiting for partner…'); };
  ws.onclose=()=>{ setStatus('disconnected — retrying…'); setTimeout(()=>{ if(role) connect(); },1500); };
  ws.onerror=()=>{ setStatus('connection error'); };
  ws.onmessage=ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;} onMessage(m); };
}
function send(o){ if(ws && ws.readyState===1) ws.send(JSON.stringify(o)); }

function onMessage(m){
  if(m.type==='peers'){
    peers=m.roles; const partner=peers.filter(r=>r!==role);
    const paired = peers.length>=2;
    setStatus(paired? '● paired — live' : 'waiting for partner…');
    if(role==='emitter' && paired && !currentSpec) newRound();
    return;
  }
  if(role==='emitter'){
    if(m.type==='guess') resolveGuess(m.system);
    else if(m.type==='next') newRound();
  } else if(role==='detector'){
    if(m.type==='spots') ingestSpots(m);
    else if(m.type==='round') startDetectRound();
    else if(m.type==='result') showResult(m);
  }
}

function randomCode(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=A[(Math.random()*A.length)|0]; return s; }

// ── camera passthrough (detector) ────────────────────────────
// camStream: null = not yet tried, false = tried & unavailable, else MediaStream
let camStream=null;
async function getCam(){
  if(camStream!==null) return camStream;
  try{ camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); }
  catch(e){ camStream=false; }
  return camStream;
}
function attachCam(){
  const v=$('cam');
  if(camStream){ v.srcObject=camStream; v.setAttribute('playsinline',''); v.muted=true; v.play().catch(()=>{}); }
  else { v.style.display='none'; }   // no camera → dots on black, still playable
}
function stopCam(){ if(camStream){ try{ camStream.getTracks().forEach(t=>t.stop()); }catch{} } camStream=null; }

// ── enter a role into a room (permissions/camera already handled) ──
function enter(r, code){
  role=r; roomCode=code;
  show(r);
  if(r==='emitter'){ $('eCode').textContent=code; initEmitter(); }
  else { $('dCode').textContent=code; attachCam(); initDetector(); }
  connect();
  requestAnimationFrame(loop);
}

// ── manual: pick a side + room code ──────────────────────────
async function startRole(r){
  const ok=await requestSensors();
  if(!ok){ alert('Motion & orientation access is required. On iOS, allow it when prompted (Settings ▸ Safari ▸ Motion & Orientation Access must be on).'); return; }
  const code=($('room').value||'').trim().toUpperCase() || randomCode();
  $('room').value=code;
  if(r==='detector') await getCam();
  enter(r, code);
}

// ── quick match: role assigned by the lobby ──────────────────
let qws=null;
function setMatchUI(searching,text){
  $('matchStatus').textContent=text||''; $('matchStatus').style.display=(searching&&text)?'block':'none';
  $('matchCancel').style.display=searching?'inline-block':'none';
}
async function startMatch(){
  const ok=await requestSensors();
  if(!ok){ alert('Motion & orientation access is required. On iOS, allow it when prompted (Settings ▸ Safari ▸ Motion & Orientation Access must be on).'); return; }
  await getCam();                          // acquire in the gesture; crystal releases it on match
  setMatchUI(true,'searching for a partner…');
  const proto=location.protocol==='https:'?'wss':'ws';
  qws=new WebSocket(`${proto}://${location.host}/api/queue`);
  qws.onopen=()=>qws.send(JSON.stringify({type:'join'}));
  qws.onmessage=ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;}
    if(m.type==='queue'){ setMatchUI(true, m.waiting>1?`matching… ${m.waiting} in queue`:'searching for a partner…'); }
    else if(m.type==='matched'){ const w=qws; qws=null; try{w.close();}catch{} onMatched(m.room,m.role); }
  };
  qws.onclose=()=>{ if(qws){ qws=null; setMatchUI(false,''); } };
  qws.onerror=()=>setMatchUI(true,'queue error — tap Quick match to retry');
}
function onMatched(room, role){
  setMatchUI(false,'');
  if(role==='emitter') stopCam();          // crystal doesn't need the camera
  enter(role, room);
}
function cancelMatch(){ if(qws){ try{qws.send(JSON.stringify({type:'leave'}));qws.close();}catch{} qws=null; } setMatchUI(false,''); }

// ════════════════════════════════════════════════════════════
//  EMITTER  (the crystal)
// ════════════════════════════════════════════════════════════
let currentSpec=null, eCanvas, eCtx, lastSend=0;
function initEmitter(){
  eCanvas=$('eCanvas'); eCtx=eCanvas.getContext('2d'); fitCanvas(eCanvas);
  addEventListener('resize',()=>fitCanvas(eCanvas));
  $('eCal').onclick=calibrate;
  $('eNext').onclick=()=>newRound();
}
function newRound(){
  currentSpec=prepSpecimen(ROSTER[(Math.random()*ROSTER.length)|0]);
  currentSpec._habit=buildHabit(currentSpec.sys);
  $('eName').textContent=currentSpec.name;
  $('eMeta').textContent=`${SYS_LABEL[currentSpec.sys]} · ${currentSpec.center}-centred · the detector must guess this`;
  $('eVerdict').textContent='';
  send({type:'round'});
}
function resolveGuess(system){
  if(!currentSpec) return;
  const correct = system===currentSpec.sys;
  $('eVerdict').textContent = (correct?'✓ they got it: ':'✗ they guessed '+SYS_LABEL[system]+': ')+SYS_LABEL[currentSpec.sys];
  $('eVerdict').style.color = correct?'#5fcf7a':'#e0635a';
  send({type:'result', correct, system:currentSpec.sys,
    name:currentSpec.name, sysLabel:SYS_LABEL[currentSpec.sys], sysAxes:SYS_AXES[currentSpec.sys],
    center:currentSpec.center, cell:`a=${currentSpec.a} b=${currentSpec.b} c=${currentSpec.c} Å · α=${currentSpec.al}° β=${currentSpec.be}° γ=${currentSpec.ga}°`});
}
function emitterFrame(now){
  if(!currentSpec) return;
  const O=quatToMat3(relQuat());
  // stream the dot cloud (throttled ~15 Hz)
  if(now-lastSend>66){
    lastSend=now;
    const {spots}=computeSpots(currentSpec,O,{cap:120});
    const d=[]; for(const s of spots){ d.push(Math.round(s.s[0]*1000),Math.round(s.s[1]*1000),Math.round(s.s[2]*1000),Math.round(s.n*255)); }
    send({type:'spots', d});
  }
  drawHabit(O);
}
function drawHabit(O){
  const W=eCanvas.width,H=eCanvas.height; eCtx.clearRect(0,0,W,H);
  const cx=W/2,cy=H/2,sc=Math.min(W,H)*0.32;
  const hb=currentSpec._habit, col=currentSpec.col;
  const L=[0.4,0.55,-0.7], Ln=Math.hypot(...L); const light=[L[0]/Ln,L[1]/Ln,L[2]/Ln];
  const faces=hb.tris.map(t=>{
    const a=apply(O,hb.verts[t[0]]),b=apply(O,hb.verts[t[1]]),c=apply(O,hb.verts[t[2]]);
    const z=(a[2]+b[2]+c[2])/3;
    const n=tnorm(a,b,c); const sh=0.32+0.68*Math.abs(n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
    return{a,b,c,z,sh};
  }).sort((p,q)=>q.z-p.z);
  for(const f of faces){
    const pa=[cx+f.a[0]*sc,cy-f.a[1]*sc],pb=[cx+f.b[0]*sc,cy-f.b[1]*sc],pc=[cx+f.c[0]*sc,cy-f.c[1]*sc];
    eCtx.beginPath();eCtx.moveTo(pa[0],pa[1]);eCtx.lineTo(pb[0],pb[1]);eCtx.lineTo(pc[0],pc[1]);eCtx.closePath();
    eCtx.fillStyle=`rgba(${col[0]*f.sh*255|0},${col[1]*f.sh*255|0},${col[2]*f.sh*255|0},0.6)`;
    eCtx.strokeStyle='rgba(255,255,255,0.18)';eCtx.lineWidth=1;eCtx.fill();eCtx.stroke();
  }
}
function apply(O,v){return[O[0]*v[0]+O[1]*v[1]+O[2]*v[2],O[3]*v[0]+O[4]*v[1]+O[5]*v[2],O[6]*v[0]+O[7]*v[1]+O[8]*v[2]];}
function tnorm(a,b,c){const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];const l=Math.hypot(...n)||1;return[n[0]/l,n[1]/l,n[2]/l];}

// ════════════════════════════════════════════════════════════
//  DETECTOR  (the scatter / guesser)
// ════════════════════════════════════════════════════════════
let dCanvas,dCtx,recvSpots=[],score=0,streak=0,locked=false,caught=new Set();
function initDetector(){
  dCanvas=$('dCanvas'); dCtx=dCanvas.getContext('2d'); fitCanvas(dCanvas);
  addEventListener('resize',()=>fitCanvas(dCanvas));
  $('dCal').onclick=()=>{ calibrate(); };
  $('dNext').onclick=()=>{ send({type:'next'}); };
  const grid=$('guessGrid');
  for(const sys of SYSTEMS){
    const b=document.createElement('button'); b.className='sys'; b.textContent=SYS_LABEL[sys]; b.dataset.sys=sys;
    b.onclick=()=>{ if(locked||peers.length<2) return; locked=true; send({type:'guess',system:sys}); };
    grid.appendChild(b);
  }
}
function startDetectRound(){
  locked=false; caught.clear();
  $('dReveal').textContent='Catch the spots, read the symmetry, then name the crystal system.';
  document.querySelectorAll('#guessGrid .sys').forEach(b=>{b.disabled=false;b.className='sys';});
}
function ingestSpots(m){
  const d=m.d||[]; const arr=[];
  for(let i=0;i+3<d.length;i+=4){ arr.push({s:[d[i]/1000,d[i+1]/1000,d[i+2]/1000], n:d[i+3]/255}); }
  recvSpots=arr;
}
function showResult(m){
  if(m.correct){ score+=10+streak*2; streak++; } else streak=0;
  $('dScore').textContent=score; $('dStreak').textContent=streak;
  document.querySelectorAll('#guessGrid .sys').forEach(b=>{
    b.disabled=true;
    if(b.dataset.sys===m.system) b.classList.add('correct');
  });
  $('dReveal').innerHTML=`<b style="color:${m.correct?'#5fcf7a':'#e0635a'}">${m.correct?'✓ correct':'✗ not quite'}</b> — it was <b>${m.name}</b><br>`+
    `<span class="dim">${m.sysLabel} · signature symmetry: ${m.sysAxes} · ${m.center}-centred<br>${m.cell}</span>`;
}
function detectorFrame(){
  const W=dCanvas.width,H=dCanvas.height; dCtx.clearRect(0,0,W,H);
  const cx=W/2,cy=H/2;
  const vfov=62*Math.PI/180, f=(H/2)/Math.tan(vfov/2);
  const qView=qMul(qConj(qNow), qMul(q0||[0,0,0,1], E));   // lab → current device-local
  // reticle
  dCtx.strokeStyle='rgba(255,255,255,0.5)';dCtx.lineWidth=2;
  dCtx.beginPath();dCtx.arc(cx,cy,16,0,7);dCtx.stroke();
  dCtx.beginPath();dCtx.moveTo(cx-26,cy);dCtx.lineTo(cx-20,cy);dCtx.moveTo(cx+20,cy);dCtx.lineTo(cx+26,cy);
  dCtx.moveTo(cx,cy-26);dCtx.lineTo(cx,cy-20);dCtx.moveTo(cx,cy+20);dCtx.lineTo(cx,cy+26);dCtx.stroke();

  dCtx.globalCompositeOperation='lighter';
  const offscreen=[]; let idx=0;
  for(const sp of recvSpots){
    const sv=vRot(sp.s, qView);            // direction in device-local frame
    if(-sv[2]<=0.06){ idx++; continue; }   // behind the camera (camera looks down -z)
    const u=sv[0]/(-sv[2]), v=sv[1]/(-sv[2]);
    const x=cx+u*f, y=cy-v*f;
    if(x<-30||x>W+30||y<-30||y>H+30){ if(sp.n>0.25) offscreen.push({x,y,n:sp.n}); idx++; continue; }
    const dToReticle=Math.hypot(x-cx,y-cy);
    const isCaught=caught.has(idx);
    if(dToReticle<22){ caught.add(idx); }
    const rad=(2+6*Math.sqrt(sp.n));
    const a=0.35+0.65*sp.n;
    dCtx.fillStyle=isCaught?`rgba(150,255,180,${a})`:`rgba(90,150,255,${a*0.4})`;
    dCtx.beginPath();dCtx.arc(x,y,rad,0,7);dCtx.fill();
    dCtx.fillStyle=isCaught?`rgba(220,255,230,${a})`:`rgba(225,240,255,${a})`;
    dCtx.beginPath();dCtx.arc(x,y,Math.max(1,rad*0.42),0,7);dCtx.fill();
    idx++;
  }
  dCtx.globalCompositeOperation='source-over';
  // edge guidance: chevrons toward the brightest off-screen spots ("they're over there")
  const m=28;
  for(const o of offscreen.sort((a,b)=>b.n-a.n).slice(0,8)){
    const ang=Math.atan2(o.y-cy,o.x-cx);
    const ex=Math.max(m,Math.min(W-m,o.x)), ey=Math.max(m,Math.min(H-m,o.y));
    dCtx.save();dCtx.translate(ex,ey);dCtx.rotate(ang);
    dCtx.fillStyle=`rgba(150,200,255,${0.3+0.5*o.n})`;
    dCtx.beginPath();dCtx.moveTo(8,0);dCtx.lineTo(-5,-5);dCtx.lineTo(-5,5);dCtx.closePath();dCtx.fill();
    dCtx.restore();
  }

  // hint: live symmetry meter + caught count
  const sym=detectSymmetry(recvSpots);
  const axEl=$('dAxis');
  if(sym.n>1){ axEl.textContent=`◉ ${sym.n}-fold axis down the beam`; axEl.style.color='#5fcf7a'; }
  else { axEl.textContent='— pan to find a symmetry axis'; axEl.style.color='#e3c977'; }
  $('dCaught').textContent=`${caught.size}/${recvSpots.length} caught`;
}

// ── shared canvas + loop ─────────────────────────────────────
function fitCanvas(cv){ const dpr=Math.min(devicePixelRatio||1,2); const r=cv.getBoundingClientRect(); cv.width=Math.max(2,r.width*dpr|0); cv.height=Math.max(2,r.height*dpr|0); }
function loop(now){
  if(role==='emitter') emitterFrame(now||0);
  else if(role==='detector') detectorFrame();
  requestAnimationFrame(loop);
}

// ── boot ─────────────────────────────────────────────────────
$('room').value=randomCode();
$('beMatch').onclick=startMatch;
$('matchCancel').onclick=cancelMatch;
$('beCrystal').onclick=()=>startRole('emitter');
$('beDetector').onclick=()=>startRole('detector');
