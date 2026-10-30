// usage: node cdp.mjs <url> <js-expression-after-load>  (headless chromium via CDP)
import { spawn } from 'node:child_process';
const [url, expr] = process.argv.slice(2);
const ch = spawn('chromium', ['--headless=new', '--no-sandbox', '--remote-debugging-port=9333', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=/tmp/mscripts/prof' + Date.now(), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, logs = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.args.map(a => a.value).join(' ')); if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400)); if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) logs.push(d.params.response.status + ' ' + d.params.response.url); };
const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Page.navigate', { url }); await sleep(3000);
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1));
console.log(logs.join('\n'));
ws.close(); ch.kill();
