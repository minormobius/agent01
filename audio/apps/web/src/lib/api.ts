/**
 * API client for the audio rooms backend.
 */

const API_BASE = '/api';

function authHeaders(token: string): HeadersInit {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function login(handle: string, appPassword: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, appPassword }),
  });
  if (!res.ok) throw new Error((await res.json() as any).error || 'Login failed');
  return res.json() as Promise<{
    session: {
      sessionId: string;
      did: string;
      handle: string;
      displayName?: string;
      avatarUrl?: string;
    };
  }>;
}

export async function createRoom(token: string, title: string, description?: string, maxParticipants?: number) {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ title, description, maxParticipants }),
  });
  if (!res.ok) throw new Error((await res.json() as any).error || 'Failed to create room');
  return res.json() as Promise<{ room: { id: string; title: string; status: string } }>;
}

export async function getRoomInfo(roomId: string) {
  const res = await fetch(`${API_BASE}/rooms/${roomId}`);
  if (!res.ok) throw new Error((await res.json() as any).error || 'Room not found');
  return res.json() as Promise<{
    room: { id: string; title: string; hostDid: string; status: string };
    participantCount: number;
    participants: Array<{
      did: string;
      handle: string;
      displayName?: string;
      role: string;
      isMuted: boolean;
      hasRaisedHand: boolean;
    }>;
  }>;
}

export async function endRoom(token: string, roomId: string) {
  const res = await fetch(`${API_BASE}/rooms/${roomId}/end`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error((await res.json() as any).error || 'Failed to end room');
  return res.json();
}

/** Build the WebSocket URL for a room */
export function getRoomWsUrl(roomId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/rooms/${roomId}/ws`;
}
