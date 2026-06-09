// Headless AR Crystal test partner (Node 21+, zero deps — global WebSocket).
//
//   node ar/bot.mjs match                          # join matchmaking, role assigned
//   node ar/bot.mjs crystal  ABCD                  # bot plays the crystal in room ABCD
//   node ar/bot.mjs detector ABCD                  # bot plays the detector
//   node ar/bot.mjs match    "" ws://localhost:8787   # against a local dev worker
//
// ABCD = the same room code your phone is using (manual mode). Default ws
// base is the live ar.mino.mobi. Browser equivalent: ar.mino.mobi/crystal/bot.html
import { runBot, runBotMatch } from './public/crystal/bot.js';

const [,, role, room, base] = process.argv;
const wsBase = base || 'wss://ar.mino.mobi';

if(role === 'match'){
  runBotMatch({ wsBase });
} else if(['crystal','detector'].includes(role) && room){
  runBot({ role, room: room.toUpperCase(), wsBase });
} else {
  console.log('usage: node ar/bot.mjs <match | crystal <ROOM> | detector <ROOM>> [wsBase]');
  process.exit(1);
}
