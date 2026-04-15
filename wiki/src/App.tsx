import { useState, useEffect, useCallback, useRef } from 'react';
import { authInit, authLogin, authLogout, type AuthUser } from './lib/auth';
import { listNotes, saveNote, deleteNote, toStubs, buildTitleIndex, resolveOutgoingLinks, findBacklinks } from './lib/notes';
import type { Note, NoteStub } from './lib/types';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { BacklinksPanel } from './components/BacklinksPanel';
import { GraphView } from './components/GraphView';

type View = 'editor' | 'graph';

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stubs, setStubs] = useState<NoteStub[]>([]);
  const [activeRkey, setActiveRkey] = useState<string | null>(null);
  const [view, setView] = useState<View>('editor');
  const [loginHandle, setLoginHandle] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const titleIndexRef = useRef(new Map<string, string>());

  // Derive active note + backlinks
  const activeNote = notes.find(n => n.rkey === activeRkey) ?? null;
  const backlinks = activeRkey ? findBacklinks(activeRkey, stubs) : [];

  // Rebuild title index when stubs change
  useEffect(() => {
    titleIndexRef.current = buildTitleIndex(stubs);
  }, [stubs]);

  // Init auth on mount
  useEffect(() => {
    authInit().then(u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Load notes when user logs in
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    listNotes()
      .then(all => {
        setNotes(all);
        setStubs(toStubs(all));
        // Auto-open most recently updated note
        if (all.length > 0 && !activeRkey) {
          const sorted = [...all].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
          setActiveRkey(sorted[0].rkey);
        }
      })
      .catch(err => console.error('Failed to load notes:', err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginHandle.trim()) return;
    setLoginError('');
    setLoginLoading(true);
    try {
      await authLogin(loginHandle.trim());
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    authLogout();
    setUser(null);
    setNotes([]);
    setStubs([]);
    setActiveRkey(null);
  };

  const handleCreate = useCallback(async () => {
    const title = 'Untitled';
    const saved = await saveNote(null, title, '', [], []);
    const updated = [...notes, saved];
    setNotes(updated);
    setStubs(toStubs(updated));
    setActiveRkey(saved.rkey);
    setView('editor');
  }, [notes]);

  const handleSave = useCallback(async (rkey: string, title: string, content: string, tags: string[]) => {
    const outgoing = resolveOutgoingLinks(content, titleIndexRef.current);
    const saved = await saveNote(rkey, title, content, tags, outgoing);
    const updated = notes.map(n => n.rkey === rkey ? saved : n);
    setNotes(updated);
    setStubs(toStubs(updated));
  }, [notes]);

  const handleDelete = useCallback(async (rkey: string) => {
    await deleteNote(rkey);
    const updated = notes.filter(n => n.rkey !== rkey);
    setNotes(updated);
    setStubs(toStubs(updated));
    if (activeRkey === rkey) {
      setActiveRkey(updated.length > 0 ? updated[0].rkey : null);
    }
  }, [notes, activeRkey]);

  const handleNavigate = useCallback((title: string) => {
    const rkey = titleIndexRef.current.get(title.toLowerCase());
    if (rkey) {
      setActiveRkey(rkey);
      setView('editor');
    }
  }, []);

  // --- Login screen ---
  if (loading && !user) {
    return <div className="wiki-loading">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="wiki-login">
        <div className="wiki-login-card">
          <h1>Wiki</h1>
          <p>Knowledge graph on ATProto. Sign in with Bluesky.</p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="you.bsky.social"
              value={loginHandle}
              onChange={e => setLoginHandle(e.target.value)}
              disabled={loginLoading}
              autoFocus
            />
            {loginError && <div className="wiki-error">{loginError}</div>}
            <button type="submit" disabled={loginLoading || !loginHandle.trim()}>
              {loginLoading ? 'Redirecting...' : 'Sign in with Bluesky'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Main app ---
  return (
    <div className="wiki-app">
      <Sidebar
        stubs={stubs}
        activeRkey={activeRkey}
        onSelect={rkey => { setActiveRkey(rkey); setView('editor'); }}
        onCreate={handleCreate}
        view={view}
        onViewChange={setView}
        user={user}
        onLogout={handleLogout}
      />
      <main className="wiki-main">
        {loading && <div className="wiki-loading">Loading notes...</div>}
        {!loading && view === 'editor' && activeNote && (
          <div className="wiki-editor-layout">
            <Editor
              note={activeNote}
              titleIndex={titleIndexRef.current}
              onSave={handleSave}
              onDelete={handleDelete}
              onNavigate={handleNavigate}
            />
            <BacklinksPanel backlinks={backlinks} onNavigate={rkey => { setActiveRkey(rkey); }} />
          </div>
        )}
        {!loading && view === 'editor' && !activeNote && notes.length === 0 && (
          <div className="wiki-empty">
            <h2>No notes yet</h2>
            <p>Create your first note to get started.</p>
            <button onClick={handleCreate}>New Note</button>
          </div>
        )}
        {!loading && view === 'graph' && (
          <GraphView
            stubs={stubs}
            activeRkey={activeRkey}
            onSelect={rkey => { setActiveRkey(rkey); setView('editor'); }}
          />
        )}
      </main>
    </div>
  );
}
