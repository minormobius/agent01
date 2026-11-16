import { ask } from '/tmp/whetstone-town-xGeEJP/work/engines/models/ask.mjs';
const mk = t => `On what page of the 1979 Basic Books first edition of Gödel, Escher, Bach does the dialogue '${t}' begin? Reply in one line.`;
const sets = [['fake2','Canon for the Recursive Sloth']];
for (const [k,t] of sets) {
  const r = await Promise.all([...Array(8).keys()].map(i => ask('deepseek-v4-flash', mk(t)).then(x=>x.text).catch(e=>'ERR '+e.message)));
  r.forEach((x,i)=>console.log(k,i,JSON.stringify(x)));
}
