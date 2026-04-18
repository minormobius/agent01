import { useState, useMemo } from 'react';
import type { NoteStub } from '../lib/types';
import type { AuthUser } from '../lib/auth';

interface Props {
  stubs: NoteStub[];
  activeRkey: string | null;
  onSelect: (rkey: string) => void;
  onCreate: () => void;
  view: 'editor' | 'graph';
  onViewChange: (v: 'editor' | 'graph') => void;
  user: AuthUser;
  onLogout: () => void;
}

export function Sidebar({ stubs, activeRkey, onSelect, onCreate, view, onViewChange, user, onLogout }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q
      ? stubs.filter(s => s.title.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q)))
      : stubs;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [stubs, search]);

  return (
    <aside className="wiki-sidebar">
      <div className="wiki-sidebar-header">
        <h1>Wiki</h1>
        <div className="wiki-sidebar-user">
          <span title={user.did}>@{user.handle}</span>
          <button className="wiki-btn-sm" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      <div className="wiki-sidebar-actions">
        <button className="wiki-btn-primary" onClick={onCreate}>+ New Note</button>
        <div className="wiki-view-toggle">
          <button className={view === 'editor' ? 'active' : ''} onClick={() => onViewChange('editor')} title="Editor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button className={view === 'graph' ? 'active' : ''} onClick={() => onViewChange('graph')} title="Graph">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/></svg>
          </button>
        </div>
      </div>

      <input
        className="wiki-search"
        type="text"
        placeholder="Search notes..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <nav className="wiki-note-list">
        {filtered.map(s => (
          <button
            key={s.rkey}
            className={`wiki-note-item ${s.rkey === activeRkey ? 'active' : ''}`}
            onClick={() => onSelect(s.rkey)}
          >
            <span className="wiki-note-title">{s.title || 'Untitled'}</span>
            {s.tags.length > 0 && (
              <span className="wiki-note-tags">{s.tags.map(t => `#${t}`).join(' ')}</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && stubs.length > 0 && (
          <div className="wiki-note-empty">No matches</div>
        )}
      </nav>

      <div className="wiki-sidebar-footer">
        {stubs.length} note{stubs.length !== 1 ? 's' : ''}
      </div>
    </aside>
  );
}
