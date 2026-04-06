import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createRoom } from '../lib/api';

export function HomePage() {
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setError('');
    setCreating(true);
    try {
      const res = await createRoom(token, title.trim());
      navigate(`/room/${res.room.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = joinId.trim();
    if (!id) return;
    // Accept full URLs or just room IDs
    const match = id.match(/room\/([a-f0-9]+)/i);
    navigate(`/room/${match ? match[1] : id}`);
  };

  return (
    <div className="home">
      <div className="hero">
        <h1>Live Audio Rooms</h1>
        <p className="subtitle">Host a room. Invite people. Talk live. All on ATProto.</p>
        <p className="muted">
          Peer-to-peer audio — no servers touch your voice. Just WebRTC between browsers.
        </p>
      </div>

      {isLoggedIn ? (
        <div className="card">
          <h2>Host a Room</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="title">Room Name</label>
              <input
                id="title"
                type="text"
                placeholder="My audio room"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Room'}
            </button>
          </form>
        </div>
      ) : (
        <div className="card">
          <p>
            <a href="/login" className="btn btn-primary">Sign in with Bluesky</a> to host a room.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Join a Room</h2>
        <form onSubmit={handleJoin}>
          <div className="field">
            <label htmlFor="roomId">Room Link or ID</label>
            <input
              id="roomId"
              type="text"
              placeholder="Paste a room link or ID"
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn">Join</button>
        </form>
      </div>
    </div>
  );
}
