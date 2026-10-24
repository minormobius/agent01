const {Lexicons}=require(require.resolve('@atproto/lexicon',{paths:['/tmp/lvpkg']}));const fs=require('fs');
const L=new Lexicons();for(const f of fs.readdirSync('/tmp/lv'))L.add(JSON.parse(fs.readFileSync('/tmp/lv/'+f)));
const ref={uri:'at://did:plc:x/com.minomobi.gangs.game/1',cid:'bafyreibppbvq34ozohwl5fptplyb7ojn5vgshpx6blcl5n5ovttkibrhuu'};
const r={$type:'com.minomobi.gangs.sheet',game:ref,name:'Wren',playbook:'Lurk',look:'coat',drive:'ledger',controller:'agent',actions:[{action:'prowl',dots:2}],abilities:[{name:'Casing',text:'When you case a place, take +1d.'}],createdAt:'2026-10-18T05:00:00Z'};
L.assertValidRecord(r.$type,r);console.log('sheet with abilities: valid');
const r2=JSON.parse(JSON.stringify(r));r2.abilities.push({name:'x'});try{L.assertValidRecord(r2.$type,r2);console.log('BAD: accepted missing text')}catch(e){console.log('rejects missing text:',e.message)}
L.assertValidRecord('com.minomobi.gangs.move',{$type:'com.minomobi.gangs.move',game:ref,kind:'advance',ability:{name:'A',text:'b'},createdAt:'2026-10-18T05:00:00Z'});console.log('advance with ability: valid');
L.assertValidRecord('com.minomobi.gangs.move',{$type:'com.minomobi.gangs.move',game:ref,kind:'strike',sheet:ref,abilityName:'Casing',createdAt:'2026-10-18T05:00:00Z'});console.log('strike: valid');
const g=JSON.parse(fs.readFileSync('research/gangs/dry-run/root.json'));const gv=g.value??g.record??g;gv.rules={...gv.rules,abilities:{atStart:1,max:4,guide:'a narrow edge'},advance:{track:'xp',cost:8}};
try{L.assertValidRecord('com.minomobi.gangs.game',{$type:'com.minomobi.gangs.game',...gv});console.log('dry-run root + ability rules: valid')}catch(e){console.log('root:',e.message)}
