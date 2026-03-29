import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRoomWsUrl } from '../lib/api';
import { PeerManager, type PeerManagerEvent } from '../rtc/PeerManager';

interface ParticipantState {
  did: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  isMuted: boolean;
  hasRaisedHand: boolean;
}

export function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { isLoggedIn, token, did, handle } = useAuth();
  const navigate = useNavigate();

  const peerManagerRef = useRef<PeerManager | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [status, setStatus] = useState<'connecting' | 'connected' | 'ended' | 'kicked' | 'error'>('connecting');
  const [roomTitle, setRoomTitle] = useState('');
  const [hostDid, setHostDid] = useState('');
  const [participants, setParticipants] = useState<Map<string, ParticipantState>>(new Map());
  const [isMuted, setIsMuted] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [myRole, setMyRole] = useState('listener');
  const [errorMsg, setErrorMsg] = useState('');

  const isHost = did === hostDid;

  const handleEvent = useCallback((event: PeerManagerEvent) => {
    switch (event.type) {
      case 'connected':
        setStatus('connected');
        break;

      case 'room-state':
        setRoomTitle(event.data.room.title);
        setHostDid(event.data.room.hostDid);
        setMyRole(event.data.yourRole);
        const pMap = new Map<string, ParticipantState>();
        for (const p of event.data.participants) {
          pMap.set(p.did, {
            did: p.did,
            handle: p.handle,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            role: p.role,
            isMuted: p.isMuted,
            hasRaisedHand: p.hasRaisedHand,
          });
        }
        setParticipants(pMap);
        break;

      case 'peer-joined':
        setParticipants(prev => {
          const next = new Map(prev);
          next.set(event.data.did, {
            did: event.data.did,
            handle: event.data.handle,
            displayName: event.data.displayName,
            avatarUrl: event.data.avatarUrl,
            role: event.data.role,
            isMuted: true,
            hasRaisedHand: false,
          });
          return next;
        });
        break;

      case 'peer-left':
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(event.did);
          return next;
        });
        // Clean up audio element
        const el = audioElementsRef.current.get(event.did);
        if (el) {
          el.srcObject = null;
          audioElementsRef.current.delete(event.did);
        }
        break;

      case 'peer-muted':
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(event.did);
          if (p) next.set(event.did, { ...p, isMuted: event.muted });
          return next;
        });
        break;

      case 'peer-hand':
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(event.did);
          if (p) next.set(event.did, { ...p, hasRaisedHand: event.raised });
          return next;
        });
        break;

      case 'role-changed':
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(event.did);
          if (p) next.set(event.did, { ...p, role: event.role });
          return next;
        });
        if (event.did === did) setMyRole(event.role);
        break;

      case 'stream-added': {
        // Create or reuse an audio element for this peer
        let audioEl = audioElementsRef.current.get(event.did);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioElementsRef.current.set(event.did, audioEl);
        }
        audioEl.srcObject = event.stream;
        break;
      }

      case 'stream-removed': {
        const audioRm = audioElementsRef.current.get(event.did);
        if (audioRm) {
          audioRm.srcObject = null;
          audioElementsRef.current.delete(event.did);
        }
        break;
      }

      case 'kicked':
        setStatus('kicked');
        break;

      case 'room-ended':
        setStatus('ended');
        break;

      case 'error':
        setErrorMsg(event.message);
        break;

      case 'disconnected':
        if (status === 'connected') setStatus('error');
        break;
    }
  }, [did, status]);

  // Connect to the room
  useEffect(() => {
    if (!roomId || !isLoggedIn || !token || !did) return;

    const pm = new PeerManager();
    peerManagerRef.current = pm;

    const unsub = pm.on(handleEvent);

    (async () => {
      try {
        // Request mic access for speakers/host
        await pm.getLocalStream();
      } catch {
        // Listener mode — no mic is fine
      }

      const wsUrl = getRoomWsUrl(roomId);
      await pm.connect(wsUrl, roomId, token, did);
    })();

    return () => {
      unsub();
      pm.disconnect();
      peerManagerRef.current = null;
    };
  }, [roomId, isLoggedIn, token, did]);

  // Separate effect for updating the handler
  useEffect(() => {
    if (!peerManagerRef.current) return;
    // The event handler is already registered via the ref closure
  }, [handleEvent]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    peerManagerRef.current?.setMuted(next);
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    peerManagerRef.current?.setHandRaised(next);
  };

  const handleEndRoom = () => {
    peerManagerRef.current?.disconnect();
    setStatus('ended');
  };

  const handleLeave = () => {
    peerManagerRef.current?.disconnect();
    navigate('/');
  };

  const handlePromote = (targetDid: string, role: 'speaker' | 'listener') => {
    peerManagerRef.current?.promote(targetDid, role);
  };

  const handleKick = (targetDid: string) => {
    peerManagerRef.current?.kick(targetDid);
  };

  // Copy room link
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  if (!isLoggedIn) {
    return (
      <div className="card">
        <h2>Sign in to join</h2>
        <p><a href="/login" className="btn btn-primary">Sign in with Bluesky</a></p>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="card">
        <h2>Room Ended</h2>
        <p className="muted">This room has ended.</p>
        <button onClick={() => navigate('/')} className="btn">Back to Lobby</button>
      </div>
    );
  }

  if (status === 'kicked') {
    return (
      <div className="card">
        <h2>Removed</h2>
        <p className="muted">You were removed from the room by the host.</p>
        <button onClick={() => navigate('/')} className="btn">Back to Lobby</button>
      </div>
    );
  }

  // Sort participants: host first, then speakers, then listeners
  const sortedParticipants = Array.from(participants.values()).sort((a, b) => {
    const order = { host: 0, speaker: 1, listener: 2 };
    return (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
  });

  const speakers = sortedParticipants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = sortedParticipants.filter(p => p.role === 'listener');

  return (
    <div className="room">
      <div className="room-header">
        <h2>{roomTitle || 'Loading...'}</h2>
        <div className="room-actions">
          <button onClick={copyLink} className="btn btn-small" title="Copy room link">Share</button>
          {isHost ? (
            <button onClick={handleEndRoom} className="btn btn-small btn-danger">End Room</button>
          ) : (
            <button onClick={handleLeave} className="btn btn-small">Leave</button>
          )}
        </div>
      </div>

      {errorMsg && <div className="error">{errorMsg}</div>}
      {status === 'connecting' && <div className="muted">Connecting...</div>}

      {/* Speakers section */}
      <div className="participant-section">
        <h3>Speakers</h3>
        <div className="participant-grid">
          {speakers.map(p => (
            <ParticipantCard
              key={p.did}
              participant={p}
              isMe={p.did === did}
              isHost={isHost}
              onPromote={handlePromote}
              onKick={handleKick}
            />
          ))}
          {speakers.length === 0 && <p className="muted">No speakers yet</p>}
        </div>
      </div>

      {/* Listeners section */}
      {listeners.length > 0 && (
        <div className="participant-section">
          <h3>Listeners ({listeners.length})</h3>
          <div className="participant-grid">
            {listeners.map(p => (
              <ParticipantCard
                key={p.did}
                participant={p}
                isMe={p.did === did}
                isHost={isHost}
                onPromote={handlePromote}
                onKick={handleKick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="room-controls">
        {(myRole === 'host' || myRole === 'speaker') && (
          <button onClick={toggleMute} className={`btn btn-round ${isMuted ? 'muted-btn' : 'live-btn'}`}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        )}
        {myRole === 'listener' && (
          <button onClick={toggleHand} className={`btn btn-round ${handRaised ? 'hand-raised' : ''}`}>
            {handRaised ? 'Lower Hand' : 'Raise Hand'}
          </button>
        )}
      </div>
    </div>
  );
}

function ParticipantCard({
  participant: p,
  isMe,
  isHost,
  onPromote,
  onKick,
}: {
  participant: ParticipantState;
  isMe: boolean;
  isHost: boolean;
  onPromote: (did: string, role: 'speaker' | 'listener') => void;
  onKick: (did: string) => void;
}) {
  return (
    <div className={`participant-card ${p.isMuted ? 'is-muted' : 'is-speaking'} ${isMe ? 'is-me' : ''}`}>
      <div className="avatar">
        {p.avatarUrl ? (
          <img src={p.avatarUrl} alt="" />
        ) : (
          <div className="avatar-placeholder">{(p.handle || '?')[0].toUpperCase()}</div>
        )}
        {p.hasRaisedHand && <span className="hand-indicator" title="Hand raised">hand</span>}
      </div>
      <div className="participant-name">
        {p.displayName || `@${p.handle}`}
        {isMe && <span className="you-badge">you</span>}
      </div>
      <div className="participant-role">{p.role}</div>
      <div className="participant-status">
        {p.isMuted ? 'muted' : 'live'}
      </div>
      {isHost && !isMe && p.role !== 'host' && (
        <div className="host-controls">
          {p.role === 'listener' ? (
            <button onClick={() => onPromote(p.did, 'speaker')} className="btn btn-tiny">
              Invite to speak
            </button>
          ) : (
            <button onClick={() => onPromote(p.did, 'listener')} className="btn btn-tiny">
              Move to listeners
            </button>
          )}
          <button onClick={() => onKick(p.did)} className="btn btn-tiny btn-danger">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
