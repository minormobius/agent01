// sci worker — static assets, plus one live thing: the sonar lobby.
//
// Everything under sci/ is served from the asset stage exactly as before.
// Requests no asset answers reach this script, and only one path is handled
// here: /sonar/lobby/ws, a WebSocket into a Durable Object per room.
//
// The lobby never carries audio. Each phone matched-filters its own
// microphone and sends only arrival times (a few numbers per round); timing
// is measured acoustically on each phone's own clock, so network delay does
// not enter the result. The room's jobs are small: hand out slots, publish
// a schedule, answer clock-sync pings, and relay reports.

const MAX_MEMBERS = 12;
const START_DELAY_MS = 1500;     // a new schedule starts this long after it is announced

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sonar/lobby/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected a WebSocket", { status: 426 });
      const room = (url.searchParams.get("room") || "").toUpperCase();
      if (!/^[A-Z0-9]{3,12}$/.test(room)) return new Response("bad room code", { status: 400 });
      return env.LOBBY.get(env.LOBBY.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class SonarLobby {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  members() {
    return this.ctx.getWebSockets()
      .map((ws) => ({ ws, a: ws.deserializeAttachment() }))
      .filter((m) => m.a && m.a.id)
      .sort((x, y) => x.a.joined - y.a.joined || (x.a.id < y.a.id ? -1 : 1));
  }

  async fetch(request) {
    if (this.ctx.getWebSockets().length >= MAX_MEMBERS) return new Response("room is full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const id = crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, joined: Date.now(), name: "", s: 0.02, fs: 0, ready: false });
    server.send(JSON.stringify({ t: "welcome", id, now: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // A new schedule whenever the set of ready phones changes. Slots follow join
  // order; the schedule is stored so that it survives the object hibernating.
  async reschedule() {
    const ready = this.members().filter((m) => m.a.ready);
    const sched = { T0: Date.now() + START_DELAY_MS, ids: ready.map((m) => m.a.id) };
    await this.ctx.storage.put("sched", sched);
    this.broadcast(await this.roster(sched));
  }

  async roster(sched) {
    sched = sched || (await this.ctx.storage.get("sched")) || { T0: 0, ids: [] };
    return {
      t: "roster", now: Date.now(), T0: sched.T0, order: sched.ids,
      members: this.members().map((m) => ({ id: m.a.id, name: m.a.name, s: m.a.s, fs: m.a.fs, ready: m.a.ready })),
    };
  }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(text); } catch { /* a closing socket; its close handler reschedules */ }
    }
  }

  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)); } catch { return; }
    const a = ws.deserializeAttachment();
    if (!a) return;
    switch (msg.t) {
      case "sync":                      // NTP-style: the client times the round trip
        ws.send(JSON.stringify({ t: "sync", c: msg.c, s: Date.now() }));
        break;
      case "hello": {                   // name, speaker–mic spacing, sample rate, ready
        const before = a.ready;
        a.name = String(msg.name || "").slice(0, 24);
        a.s = Math.max(0, Math.min(0.3, +msg.s || 0));
        a.fs = +msg.fs || 0;
        a.ready = !!msg.ready;
        ws.serializeAttachment(a);
        if (before !== a.ready) await this.reschedule();
        else this.broadcast(await this.roster());
        break;
      }
      case "report":                    // one round's arrival times, on the sender's clock
        if (typeof msg.r !== "number" || typeof msg.arr !== "object") return;
        this.broadcast({ t: "report", from: a.id, T0: msg.T0, r: msg.r, arr: msg.arr, s: a.s }, ws);
        break;
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    const a = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (a && a.ready) await this.reschedule();
    else this.broadcast(await this.roster());
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }
}
