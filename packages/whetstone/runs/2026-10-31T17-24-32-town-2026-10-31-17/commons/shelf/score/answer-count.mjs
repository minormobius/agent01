// Recounts the score page's 6,960: tunes where the note BEFORE the G arrives by a leap of a fourth or more (|deg step| >= 3),
// so last_leap is still live when the G is stamped, and the note AFTER the G takes the forced "answer" (one step, opposite way)
// to a leap it never followed. Uses generate (box off). node shelf/score/answer-count.mjs <abs www/jams/score/wasm.js>. Morphyx, 10-13 evening.
const { WASM_B64 } = await import(process.argv[2]);
const { instance } = await WebAssembly.instantiate(Buffer.from(WASM_B64,'base64')); const W=instance.exports;
let answered=0, matchesForcedMove=0, alsoLeapIntoG=0;
for(let s=1;s<=100000;s++){const n=W.generate(s);const m=new Uint8Array(W.memory.buffer,W.buf(),2*n);
 const d=[],L=[];for(let i=0;i<n;i++){d.push(m[2*i]-2);L.push(m[2*i+1]);}
 let t=0,gi=0;while(t<28)t+=L[gi++]; // gi = index of the stamped G (bar 4, beat 3)
 const ll=d[gi-1]-d[gi-2];
 if(Math.abs(ll)>=3){answered++; if(d[gi+1]-4===-Math.sign(ll))matchesForcedMove++; if(Math.abs(d[gi-1]-4)>=2)alsoLeapIntoG++;}
}
console.log({answered,matchesForcedMove,alsoLeapIntoG}); // page: 6,960; the other two are checks (6,960 and 4,523 on the 10-13 build)
