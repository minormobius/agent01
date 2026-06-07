// ── AR Crystal — test bot ────────────────────────────────────
// A headless partner that plays either side so you can test solo.
// Runs in a browser tab (bot.html) or in Node (../bot.mjs). Zero deps:
// uses the global WebSocket (Node 21+ and all browsers) + the real
// laue.js physics, so the dots/symmetry it produces are genuine.
//
//   role 'crystal'  → connects as the emitter: picks a random mineral,
//                     slowly tumbles it, streams the true diffraction
//                     cloud, answers guesses, handles "next".
//   role 'detector' → connects as the detector: watches the streamed
//                     cloud, tracks the highest symmetry it sees, then
//                     guesses the system and asks for the next one.

import {
  computeSpots, detectSymmetry, mul3,
  ROSTER, SYS_LABEL, SYS_AXES, prepSpecimen,
} from './laue.js';

const rotX=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,c,-s,0,s,c];};
const rotY=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,s,0,1,0,-s,0,c];};
const rotZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1];};

export function runBot({ role, room, wsBase, log=console.log }){
  room=(room||'').toUpperCase();
  const url=`${wsBase}/api/room/${room}`;
  const wireRole = role==='crystal' ? 'emitter' : 'detector';
  log(`▸ ${role} bot → ${url}`);
  const ws=new WebSocket(url);

  let spec=null, t0=Date.now(), streamTimer=null, guessTimer=null;
  let bestN=1, recvSpots=[], stopped=false;

  const send=o=>{ if(ws.readyState===1) ws.send(JSON.stringify(o)); };

  ws.onopen =()=>{ log('● connected — hello as '+wireRole); send({type:'hello',role:wireRole}); };
  ws.onclose=()=>{ log('○ socket closed'); cleanup(); };
  ws.onerror=e =>{ log('! error '+((e&&e.message)||'')); };
  ws.onmessage=ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;} onMsg(m); };

  function onMsg(m){
    if(m.type==='peers'){
      log(`peers: ${m.count} [${m.roles.join(', ')}]`);
      if(role==='crystal' && m.count>=2 && !spec) newRound();
      return;
    }
    if(role==='crystal'){
      if(m.type==='guess'){
        const ok=m.system===spec.sys;
        log(`partner guessed ${SYS_LABEL[m.system]||m.system} → ${ok?'✓ correct':'✗ wrong'} (it was ${spec.name})`);
        send({type:'result', correct:ok, system:spec.sys, name:spec.name,
          sysLabel:SYS_LABEL[spec.sys], sysAxes:SYS_AXES[spec.sys], center:spec.center,
          cell:`a=${spec.a} b=${spec.b} c=${spec.c} Å · α=${spec.al}° β=${spec.be}° γ=${spec.ga}°`});
      } else if(m.type==='next'){ log('partner asked for next'); newRound(); }
    } else {
      if(m.type==='round'){ bestN=1; recvSpots=[]; log('new round — hunting symmetry…'); scheduleGuess(); }
      else if(m.type==='spots'){ ingest(m); }
      else if(m.type==='result'){
        log(`result: ${m.correct?'✓ correct':'✗ wrong'} — it was ${m.name}`);
        setTimeout(()=>{ if(!stopped){ log('→ next'); send({type:'next'}); } }, 3000);
      }
    }
  }

  // ── crystal bot ──
  function newRound(){
    spec=prepSpecimen(ROSTER[(Math.random()*ROSTER.length)|0]);
    log(`crystal: ${spec.name}  (${spec.sys} · ${spec.center}-centred)`);
    send({type:'round'});
    t0=Date.now();
    if(!streamTimer) streamTimer=setInterval(stream, 66);   // ~15 Hz
  }
  function stream(){
    if(!spec || stopped) return;
    const t=(Date.now()-t0)/1000;
    // wander through orientations so symmetry axes sweep past the beam
    const O=mul3(mul3(rotX(0.5*Math.sin(t*0.23)), rotY(t*0.13)), rotZ(0.4*Math.sin(t*0.097)));
    const {spots}=computeSpots(spec,O,{cap:120});
    const d=[]; for(const s of spots) d.push(Math.round(s.s[0]*1000),Math.round(s.s[1]*1000),Math.round(s.s[2]*1000),Math.round(s.n*255));
    send({type:'spots', d});
  }

  // ── detector bot ──
  function ingest(m){
    const d=m.d||[]; const a=[];
    for(let i=0;i+3<d.length;i+=4) a.push({s:[d[i]/1000,d[i+1]/1000,d[i+2]/1000], n:d[i+3]/255});
    recvSpots=a;
    const sym=detectSymmetry(a);
    if(sym.n>bestN){ bestN=sym.n; log(`…caught a ${sym.n}-fold axis`); }
  }
  function scheduleGuess(){
    clearTimeout(guessTimer);
    guessTimer=setTimeout(()=>{
      if(stopped) return;
      const sys=guessFromSym(bestN);
      log(`detector: best was ${bestN}-fold → guessing ${SYS_LABEL[sys]}`);
      send({type:'guess', system:sys});
    }, 7000);
  }
  function guessFromSym(n){
    if(n===6) return 'hexagonal';
    if(n===4) return Math.random()<0.5?'tetragonal':'cubic';
    if(n===3) return 'trigonal';
    if(n===2) return Math.random()<0.5?'orthorhombic':'monoclinic';
    return 'triclinic';
  }

  function cleanup(){ stopped=true; clearInterval(streamTimer); clearTimeout(guessTimer); }
  return ()=>{ cleanup(); try{ws.close();}catch{} };
}

// Join matchmaking; play whatever role the lobby assigns.
export function runBotMatch({ wsBase, log=console.log }){
  log(`▸ bot → matchmaking queue ${wsBase}/api/queue`);
  const ws=new WebSocket(`${wsBase}/api/queue`);
  let stopRoom=null, done=false;
  ws.onopen =()=>{ log('● queue connected — joining'); ws.send(JSON.stringify({type:'join'})); };
  ws.onclose=()=>log('○ queue socket closed');
  ws.onerror=e =>log('! queue error '+((e&&e.message)||''));
  ws.onmessage=ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;}
    if(m.type==='queue'){ log(`waiting… ${m.waiting} in queue`); }
    else if(m.type==='matched'){
      log(`✦ matched! room ${m.room} — assigned ${m.role}`);
      try{ws.close();}catch{}
      const role=m.role==='emitter'?'crystal':'detector';
      if(!done) stopRoom=runBot({role, room:m.room, wsBase, log});
    }
  };
  return ()=>{ done=true; try{ws.close();}catch{} if(stopRoom) stopRoom(); };
}
