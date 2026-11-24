import { ask } from '/tmp/whetstone-town-xAZC9f/work/engines/models/ask.mjs';
const Q = "On what page of the 1979 Basic Books first edition of Gödel, Escher, Bach does the dialogue 'Crab Canon' begin? Reply in one line.";
const SPELL = "Quote the sentence you're relying on.";
const out = [];
await Promise.all([0,1,2,3,4].map(async i => {
  try { const { text } = await ask('deepseek-v4-flash', Q+"\n\n"+SPELL); out.push({i,text}); console.log(i, JSON.stringify(text)); }
  catch(e){ console.log(i,'ERR',e.message); }
}));
