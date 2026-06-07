// Headless AR Crystal test partner (Node 21+, zero deps — global WebSocket).
//
//   node ar/bot.mjs crystal  ABCD                 # bot plays the crystal
//   node ar/bot.mjs detector ABCD                 # bot plays the detector
//   node ar/bot.mjs crystal  ABCD ws://localhost:8787   # against a local dev worker
//
// ABCD = the same room code your phone is using. Default ws base is the
// live ar.mino.mobi. Browser-friendly equivalent: ar.mino.mobi/crystal/bot.html
import { runBot } from './public/crystal/bot.js';

const [,, role, room, base] = process.argv;
if(!role || !['crystal','detector'].includes(role) || !room){
  console.log('usage: node ar/bot.mjs <crystal|detector> <ROOM> [wsBase]');
  process.exit(1);
}
runBot({ role, room: room.toUpperCase(), wsBase: base || 'wss://ar.mino.mobi' });
