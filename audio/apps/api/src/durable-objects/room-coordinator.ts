/**
 * RoomCoordinator — Durable Object for live audio room state.
 *
 * One instance per room. Manages:
 * - WebSocket connections for signaling (SDP offers/answers, ICE candidates)
 * - Participant list, roles, mute state, hand raises
 * - Room lifecycle (waiting → live → ended)
 *
 * Audio never touches this server. Only lightweight JSON signaling messages flow here.
 * The actual audio streams go peer-to-peer via WebRTC between browsers.
 */

import type {
  Room,
  Participant,
  ParticipantRole,
  ClientMessage,
  ServerMessage,
} from '@audio-rooms/shared';

interface ConnectedPeer {
  ws: WebSocket;
  participant: Participant;
}

export class RoomCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private room: Room | null = null;
  private peers: Map<string, ConnectedPeer> = new Map(); // DID → peer

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;

    // Restore room from storage on wake
    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<Room>('room')) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // REST endpoints for room management
    if (url.pathname.endsWith('/create') && request.method === 'POST') {
      return this.handleCreate(request);
    }
    if (url.pathname.endsWith('/info')) {
      return this.handleInfo();
    }
    if (url.pathname.endsWith('/end') && request.method === 'POST') {
      return this.handleEnd(request);
    }

    // WebSocket upgrade for signaling
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleCreate(request: Request): Promise<Response> {
    if (this.room && this.room.status !== 'ended') {
      return jsonResponse({ error: 'Room already exists' }, 409);
    }

    const body = await request.json() as {
      hostDid: string;
      hostHandle: string;
      title: string;
      description?: string;
      maxParticipants?: number;
    };

    this.room = {
      id: this.state.id.toString(),
      hostDid: body.hostDid,
      hostHandle: body.hostHandle,
      title: body.title,
      description: body.description,
      status: 'waiting',
      maxParticipants: body.maxParticipants ?? 10,
      createdAt: new Date().toISOString(),
    };

    await this.state.storage.put('room', this.room);
    return jsonResponse({ room: this.room }, 201);
  }

  private handleInfo(): Response {
    if (!this.room) {
      return jsonResponse({ error: 'Room not found' }, 404);
    }
    return jsonResponse({
      room: this.room,
      participantCount: this.peers.size,
      participants: Array.from(this.peers.values()).map(p => ({
        did: p.participant.did,
        handle: p.participant.handle,
        displayName: p.participant.displayName,
        role: p.participant.role,
        isMuted: p.participant.isMuted,
        hasRaisedHand: p.participant.hasRaisedHand,
      })),
    });
  }

  private async handleEnd(request: Request): Promise<Response> {
    if (!this.room) {
      return jsonResponse({ error: 'Room not found' }, 404);
    }

    // Verify caller is host (DID passed in header, validated by outer worker)
    const callerDid = request.headers.get('X-Caller-DID');
    if (callerDid !== this.room.hostDid) {
      return jsonResponse({ error: 'Only the host can end the room' }, 403);
    }

    await this.endRoom();
    return jsonResponse({ ok: true });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called by the runtime for each WebSocket message (hibernation API) */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.sendTo(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'join':
        await this.handleJoin(ws, msg);
        break;
      case 'leave':
        this.handleLeave(ws);
        break;
      case 'sdp-offer':
      case 'sdp-answer':
        this.relaySdp(ws, msg);
        break;
      case 'ice-candidate':
        this.relayIce(ws, msg);
        break;
      case 'mute':
        this.handleMute(ws, msg.muted);
        break;
      case 'raise-hand':
        this.handleRaiseHand(ws, msg.raised);
        break;
      case 'promote':
        this.handlePromote(ws, msg.targetDid, msg.role);
        break;
      case 'kick':
        this.handleKick(ws, msg.targetDid);
        break;
    }
  }

  /** Called by the runtime when a WebSocket closes */
  async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  /** Called by the runtime when a WebSocket errors */
  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  private async handleJoin(ws: WebSocket, msg: { roomId: string; sessionToken: string }): Promise<void> {
    if (!this.room || this.room.status === 'ended') {
      this.sendTo(ws, { type: 'error', message: 'Room not available', code: 'ROOM_ENDED' });
      return;
    }

    // Validate session token via outer worker's session store
    // For now, decode the token which contains DID + handle (set by the auth middleware)
    let identity: { did: string; handle: string; displayName?: string; avatarUrl?: string };
    try {
      identity = JSON.parse(atob(msg.sessionToken));
    } catch {
      this.sendTo(ws, { type: 'error', message: 'Invalid session token', code: 'AUTH_FAILED' });
      return;
    }

    // Check capacity
    if (this.room.maxParticipants > 0 && this.peers.size >= this.room.maxParticipants) {
      this.sendTo(ws, { type: 'error', message: 'Room is full', code: 'ROOM_FULL' });
      return;
    }

    // Remove existing connection for this DID (reconnect case)
    const existing = this.peers.get(identity.did);
    if (existing) {
      try { existing.ws.close(1000, 'Reconnecting'); } catch {}
      this.peers.delete(identity.did);
    }

    // Determine role
    const role: ParticipantRole = identity.did === this.room.hostDid ? 'host' : 'listener';

    const participant: Participant = {
      did: identity.did,
      handle: identity.handle,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      role,
      isMuted: true, // Start muted
      hasRaisedHand: false,
      joinedAt: new Date().toISOString(),
    };

    this.peers.set(identity.did, { ws, participant });

    // If host joins and room is waiting, go live
    if (role === 'host' && this.room.status === 'waiting') {
      this.room.status = 'live';
      this.room.startedAt = new Date().toISOString();
      await this.state.storage.put('room', this.room);
    }

    // Send full room state to the joiner
    this.sendTo(ws, {
      type: 'room-state',
      room: {
        id: this.room.id,
        title: this.room.title,
        hostDid: this.room.hostDid,
        status: this.room.status,
      },
      participants: Array.from(this.peers.values()).map(p => ({
        did: p.participant.did,
        handle: p.participant.handle,
        displayName: p.participant.displayName,
        avatarUrl: p.participant.avatarUrl,
        role: p.participant.role,
        isMuted: p.participant.isMuted,
        hasRaisedHand: p.participant.hasRaisedHand,
      })),
      yourRole: role,
    });

    // Notify all other peers
    this.broadcast({
      type: 'peer-joined',
      did: identity.did,
      handle: identity.handle,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      role,
    }, identity.did);
  }

  private handleLeave(ws: WebSocket): void {
    // Find which peer this WebSocket belongs to
    let leavingDid: string | null = null;
    for (const [did, peer] of this.peers) {
      if (peer.ws === ws) {
        leavingDid = did;
        break;
      }
    }
    if (!leavingDid) return;

    this.peers.delete(leavingDid);
    this.broadcast({ type: 'peer-left', did: leavingDid });

    // If host left, end the room
    if (this.room && leavingDid === this.room.hostDid) {
      this.endRoom();
    }
  }

  private relaySdp(ws: WebSocket, msg: { type: 'sdp-offer' | 'sdp-answer'; targetDid: string; sdp: string }): void {
    const senderDid = this.didForWs(ws);
    if (!senderDid) return;

    const target = this.peers.get(msg.targetDid);
    if (!target) return;

    this.sendTo(target.ws, {
      type: msg.type,
      fromDid: senderDid,
      sdp: msg.sdp,
    });
  }

  private relayIce(ws: WebSocket, msg: { targetDid: string; candidate: string }): void {
    const senderDid = this.didForWs(ws);
    if (!senderDid) return;

    const target = this.peers.get(msg.targetDid);
    if (!target) return;

    this.sendTo(target.ws, {
      type: 'ice-candidate',
      fromDid: senderDid,
      candidate: msg.candidate,
    });
  }

  private handleMute(ws: WebSocket, muted: boolean): void {
    const did = this.didForWs(ws);
    if (!did) return;

    const peer = this.peers.get(did);
    if (!peer) return;

    peer.participant.isMuted = muted;
    this.broadcast({ type: 'peer-muted', did, muted });
  }

  private handleRaiseHand(ws: WebSocket, raised: boolean): void {
    const did = this.didForWs(ws);
    if (!did) return;

    const peer = this.peers.get(did);
    if (!peer) return;

    peer.participant.hasRaisedHand = raised;
    this.broadcast({ type: 'peer-hand', did, raised });
  }

  private handlePromote(ws: WebSocket, targetDid: string, role: 'speaker' | 'listener'): void {
    const callerDid = this.didForWs(ws);
    if (!callerDid || !this.room || callerDid !== this.room.hostDid) return;

    const target = this.peers.get(targetDid);
    if (!target) return;

    target.participant.role = role;
    if (role === 'listener') {
      target.participant.isMuted = true;
      target.participant.hasRaisedHand = false;
    }

    this.broadcast({ type: 'role-changed', did: targetDid, role });
  }

  private handleKick(ws: WebSocket, targetDid: string): void {
    const callerDid = this.didForWs(ws);
    if (!callerDid || !this.room || callerDid !== this.room.hostDid) return;
    if (targetDid === this.room.hostDid) return; // Can't kick yourself

    const target = this.peers.get(targetDid);
    if (!target) return;

    this.sendTo(target.ws, { type: 'kicked', reason: 'Removed by host' });
    try { target.ws.close(1000, 'Kicked'); } catch {}
    this.peers.delete(targetDid);
    this.broadcast({ type: 'peer-left', did: targetDid });
  }

  private async endRoom(): Promise<void> {
    if (!this.room) return;

    this.room.status = 'ended';
    this.room.endedAt = new Date().toISOString();
    await this.state.storage.put('room', this.room);

    this.broadcast({ type: 'room-ended' });

    // Close all WebSocket connections
    for (const [, peer] of this.peers) {
      try { peer.ws.close(1000, 'Room ended'); } catch {}
    }
    this.peers.clear();
  }

  // --- Helpers ---

  private didForWs(ws: WebSocket): string | null {
    for (const [did, peer] of this.peers) {
      if (peer.ws === ws) return did;
    }
    return null;
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private broadcast(msg: ServerMessage, excludeDid?: string): void {
    const data = JSON.stringify(msg);
    for (const [did, peer] of this.peers) {
      if (did === excludeDid) continue;
      try { peer.ws.send(data); } catch {}
    }
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
