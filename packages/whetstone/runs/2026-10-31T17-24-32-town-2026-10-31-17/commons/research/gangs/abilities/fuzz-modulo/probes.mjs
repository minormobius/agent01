const { reportSheet } = await import(process.argv[2]);
const base = { $type:'com.minomobi.gangs.sheet', game:{uri:'at://did:plc:x/com.minomobi.gangs.game/1',cid:'bafy'}, name:'N', playbook:'Whisper', look:'l', drive:'d', controller:'agent', operator:'did:plc:abc',
 actions:[{action:'hunt',dots:2},{action:'study',dots:2},{action:'survey',dots:1},{action:'tinker',dots:1},{action:'finesse',dots:1}], createdAt:'2026-10-18T05:00:00Z' };
const root = r => ({ uri:'at://x', cid:'c', rules: r });
const cases = [
 ['empty arr, atStart -1', {abilities:[]}, root({abilities:{atStart:-1}})],
 ['none, atStart -1', {}, root({abilities:{atStart:-1}})],
 ['atStart 2 max 1, two', {abilities:[{name:'a',text:'t'},{name:'b',text:'t'}]}, root({abilities:{atStart:2,max:1}})],
 ['atStart 20, nine', {abilities:Array.from({length:9},(_,i)=>({name:'a'+i,text:'t'}))}, root({abilities:{atStart:20,max:20}})],
 ['extra field in item', {abilities:[{name:'a',text:'t',dice:'+5d'}]}, null],
 ['name ZWSP only', {abilities:[{name:'​',text:'t'}]}, null],
 ['dup fullwidth', {abilities:[{name:'Ａ',text:'t'},{name:'a',text:'t'}]}, root({abilities:{atStart:2}})],
 ['dup turkish I', {abilities:[{name:'I',text:'t'},{name:'ı',text:'t'}]}, root({abilities:{atStart:2}})],
 ['dup ß/ss', {abilities:[{name:'ß',text:'t'},{name:'SS',text:'t'}]}, root({abilities:{atStart:2}})],
 ['atStart 1.5', {abilities:[{name:'a',text:'t'}]}, root({abilities:{atStart:1.5}})],
 ['atStart "3"', {abilities:[{name:'a',text:'t'},{name:'b',text:'t'}]}, root({abilities:{atStart:'3'}})],
];
for (const [n, add, r] of cases) { const o = reportSheet({...base, ...add}, r); console.log(n.padEnd(26), JSON.stringify(o)); }
