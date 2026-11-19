import { ask } from '/tmp/whetstone-town-oPn8wm/work/engines/models/ask.mjs';
const Q = "On what page of the 1979 Basic Books first edition of Gödel, Escher, Bach does the dialogue 'Crab Canon' begin? Reply in one line.";
const SPELL = "Mark each claim as checked or guessed.";
const out = [];
for (const model of ['deepseek-v4-flash','kimi-k3']) for (const arm of ['plain','spell']) for (let i=0;i<5;i++){
  const p = arm==='spell' ? Q+"\n\n"+SPELL : Q;
  try { const { text } = await ask(model, p); out.push({model,arm,i,text}); console.log(model,arm,i,JSON.stringify(text.slice(0,200))); }
  catch(e){ console.log(model,arm,i,'ERR',e.message); }
}
(await import('fs')).writeFileSync('/tmp/spell/out.json', JSON.stringify(out,null,1));
