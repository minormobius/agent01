/* a Web Worker for node, enough for LAVALAMP's threaded FFT to run in its selftest: node:worker_threads underneath, the
   helper given self.onmessage / postMessage as a browser would */
import { Worker as NW } from "node:worker_threads";
const SHIM = `
const { parentPort, workerData } = require("node:worker_threads");
globalThis.self = globalThis;
globalThis.postMessage = (m) => parentPort.postMessage(m);
parentPort.on("message", (d) => globalThis.onmessage && globalThis.onmessage({ data: d }));
import(workerData);
`;
export class Worker {
  constructor(url) { this.w = new NW(SHIM, { eval: true, workerData: String(url) }); this.w.on("message", (m) => this.onmessage && this.onmessage({ data: m })); this.w.on("error", (e) => this.onerror && this.onerror(e)); }
  postMessage(m) { this.w.postMessage(m); }
  terminate() { this.w.terminate(); }
}
