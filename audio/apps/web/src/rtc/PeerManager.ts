/**
 * WebRTC Peer Manager — handles peer connections for audio rooms.
 *
 * Architecture:
 * - Star topology: host connects to all peers, peers connect to host
 * - For small rooms (<5): full mesh (everyone connects to everyone)
 * - Signaling goes through the RoomCoordinator DO via WebSocket
 * - Audio goes directly peer-to-peer via WebRTC
 *
 * Public STUN servers for NAT traversal (free, no account needed).
 */

import type { ServerMessage, ClientMessage } from '@audio-rooms/shared';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface PeerAudioStream {
  did: string;
  stream: MediaStream;
}

export type PeerManagerEvent =
  | { type: 'stream-added'; did: string; stream: MediaStream }
  | { type: 'stream-removed'; did: string }
  | { type: 'room-state'; data: Extract<ServerMessage, { type: 'room-state' }> }
  | { type: 'peer-joined'; data: Extract<ServerMessage, { type: 'peer-joined' }> }
  | { type: 'peer-left'; did: string }
  | { type: 'peer-muted'; did: string; muted: boolean }
  | { type: 'peer-hand'; did: string; raised: boolean }
  | { type: 'role-changed'; did: string; role: string }
  | { type: 'kicked' }
  | { type: 'room-ended' }
  | { type: 'error'; message: string }
  | { type: 'connected' }
  | { type: 'disconnected' };

export class PeerManager {
  private ws: WebSocket | null = null;
  private connections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private listeners: Set<(event: PeerManagerEvent) => void> = new Set();
  private myDid: string = '';
  private myRole: string = 'listener';
  private roomId: string = '';

  /** Subscribe to events */
  on(listener: (event: PeerManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PeerManagerEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch {}
    }
  }

  /** Get the local audio stream (requests mic permission) */
  async getLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    return this.localStream;
  }

  /** Connect to a room via WebSocket signaling */
  async connect(wsUrl: string, roomId: string, sessionToken: string, did: string): Promise<void> {
    this.roomId = roomId;
    this.myDid = did;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.send({ type: 'join', roomId, sessionToken });
      this.emit({ type: 'connected' });
    };

    this.ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    this.ws.onclose = () => {
      this.emit({ type: 'disconnected' });
    };

    this.ws.onerror = () => {
      this.emit({ type: 'error', message: 'WebSocket connection failed' });
    };
  }

  /** Disconnect and clean up everything */
  disconnect(): void {
    // Close all peer connections
    for (const [did, pc] of this.connections) {
      pc.close();
      this.emit({ type: 'stream-removed', did });
    }
    this.connections.clear();

    // Stop local stream
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    // Close WebSocket
    if (this.ws) {
      try { this.ws.close(1000); } catch {}
      this.ws = null;
    }
  }

  /** Toggle local mute */
  setMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    this.send({ type: 'mute', muted });
  }

  /** Raise/lower hand */
  setHandRaised(raised: boolean): void {
    this.send({ type: 'raise-hand', raised });
  }

  /** Host: promote/demote a participant */
  promote(targetDid: string, role: 'speaker' | 'listener'): void {
    this.send({ type: 'promote', targetDid, role });
  }

  /** Host: kick a participant */
  kick(targetDid: string): void {
    this.send({ type: 'kick', targetDid });
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'room-state':
        this.myRole = msg.yourRole;
        this.emit({ type: 'room-state', data: msg });
        // Initiate WebRTC connections to existing participants
        for (const p of msg.participants) {
          if (p.did !== this.myDid && this.shouldInitiateConnection(p.did)) {
            await this.createOffer(p.did);
          }
        }
        break;

      case 'peer-joined':
        this.emit({ type: 'peer-joined', data: msg });
        // New peer joined — if we should initiate, send offer
        if (this.shouldInitiateConnection(msg.did)) {
          await this.createOffer(msg.did);
        }
        break;

      case 'peer-left':
        this.removePeer(msg.did);
        this.emit({ type: 'peer-left', did: msg.did });
        break;

      case 'sdp-offer':
        await this.handleSdpOffer(msg.fromDid, msg.sdp);
        break;

      case 'sdp-answer':
        await this.handleSdpAnswer(msg.fromDid, msg.sdp);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(msg.fromDid, msg.candidate);
        break;

      case 'peer-muted':
        this.emit({ type: 'peer-muted', did: msg.did, muted: msg.muted });
        break;

      case 'peer-hand':
        this.emit({ type: 'peer-hand', did: msg.did, raised: msg.raised });
        break;

      case 'role-changed':
        if (msg.did === this.myDid) {
          this.myRole = msg.role;
        }
        this.emit({ type: 'role-changed', did: msg.did, role: msg.role });
        break;

      case 'kicked':
        this.disconnect();
        this.emit({ type: 'kicked' });
        break;

      case 'room-ended':
        this.disconnect();
        this.emit({ type: 'room-ended' });
        break;

      case 'error':
        this.emit({ type: 'error', message: msg.message });
        break;
    }
  }

  /**
   * Determine who initiates the WebRTC connection.
   * To avoid duplicate offers, the peer with the "lower" DID initiates.
   */
  private shouldInitiateConnection(otherDid: string): boolean {
    return this.myDid < otherDid;
  }

  private async createOffer(targetDid: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(targetDid);

    // Add local stream if we have one (speakers/host)
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      // Even listeners need a transceiver to receive audio
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.send({
      type: 'sdp-offer',
      targetDid,
      sdp: offer.sdp!,
    });
  }

  private async handleSdpOffer(fromDid: string, sdp: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(fromDid);

    // Add local tracks if available
    if (this.localStream) {
      const senders = pc.getSenders();
      if (senders.length === 0) {
        for (const track of this.localStream.getTracks()) {
          pc.addTrack(track, this.localStream);
        }
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.send({
      type: 'sdp-answer',
      targetDid: fromDid,
      sdp: answer.sdp!,
    });
  }

  private async handleSdpAnswer(fromDid: string, sdp: string): Promise<void> {
    const pc = this.connections.get(fromDid);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }

  private async handleIceCandidate(fromDid: string, candidateJson: string): Promise<void> {
    const pc = this.connections.get(fromDid);
    if (!pc) return;
    try {
      const candidate = JSON.parse(candidateJson);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }

  private getOrCreatePeerConnection(did: string): RTCPeerConnection {
    let pc = this.connections.get(did);
    if (pc) return pc;

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.connections.set(did, pc);

    // Relay ICE candidates through signaling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          targetDid: did,
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      }
    };

    // Handle incoming audio streams
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.emit({ type: 'stream-added', did, stream: event.streams[0] });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === 'failed' || pc!.connectionState === 'disconnected') {
        this.removePeer(did);
      }
    };

    return pc;
  }

  private removePeer(did: string): void {
    const pc = this.connections.get(did);
    if (pc) {
      pc.close();
      this.connections.delete(did);
      this.emit({ type: 'stream-removed', did });
    }
  }
}
