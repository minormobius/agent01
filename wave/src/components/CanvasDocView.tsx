import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { WaveThreadRecord, WaveOpRecord, MessagePayload, DocEditPayload } from '../types';
import type { NoteStub } from '../lib/wiki';
import type { CanvasRenderer } from '../lib/markdown';
import { createCanvasRenderer, isMarkdownReady } from '../lib/markdown';
import { findBacklinks, buildTitleIndex } from '../lib/wiki';

interface Props {
  thread: WaveThreadRecord;
  ops: WaveOpRecord[];
  decryptedMessages: Map<string, MessagePayload | DocEditPayload>;
  connected: boolean;
  sending: boolean;
  allStubs: NoteStub[];
  allDocThreads: WaveThreadRecord[];
  onSaveDoc: (text: string) => void;
  onSendComment: (text: string) => void;
  onNavigate: (rkey: string) => void;
}

export function CanvasDocView({
  thread, ops, decryptedMessages, connected, sending,
  allStubs, allDocThreads, onSaveDoc, onSendComment, onNavigate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const titleIndex = useMemo(() => buildTitleIndex(allDocThreads), [allDocThreads]);

  const wasmTitleIndex = useMemo(() => {
    const entries: Array<{ rkey: string; title: string }> = [];
    titleIndex.forEach((rkey, title) => entries.push({ rkey, title }));
    return entries;
  }, [titleIndex]);

  const configJson = useMemo(() => JSON.stringify({
    title_index: wasmTitleIndex,
    kanban: true,
    dataview: true,
    embeds: true,
    template_vars: [],
  }), [wasmTitleIndex]);

  // Build doc history + latest text from ops
  const { docHistory, latestText } = useMemo(() => {
    const history: Array<{
      uri: string; authorDid: string; authorHandle?: string; text: string; createdAt: string;
    }> = [];
    let latest = '';
    for (const opRec of ops) {
      if (opRec.op.opType !== 'doc_edit') continue;
      const key = `${opRec.authorDid}:${opRec.rkey}`;
      const payload = decryptedMessages.get(key) as DocEditPayload | undefined;
      if (payload?.text !== undefined) {
        latest = payload.text;
        history.push({
          uri: `at://${opRec.authorDid}/com.minomobi.wave.op/${opRec.rkey}`,
          authorDid: opRec.authorDid,
          authorHandle: opRec.authorHandle,
          text: payload.text,
          createdAt: opRec.op.createdAt,
        });
      }
    }
    return { docHistory: history, latestText: latest };
  }, [ops, decryptedMessages]);

  useEffect(() => {
    if (!editing) setEditText(latestText);
  }, [latestText, editing]);

  const backlinks = useMemo(() => {
    const stub = allStubs.find(s => s.rkey === thread.rkey);
    return stub ? findBacklinks(allStubs, thread.rkey) : [];
  }, [allStubs, thread.rkey]);

  // Initialize canvas renderer
  useEffect(() => {
    if (!canvasRef.current || !isMarkdownReady() || editing || showHistory) return;

    const canvas = canvasRef.current;
    try {
      const renderer = createCanvasRenderer(canvas);
      rendererRef.current = renderer;
      return () => {
        renderer.free();
        rendererRef.current = null;
      };
    } catch (err) {
      console.warn('Canvas renderer init failed:', err);
    }
  }, [editing, showHistory]);

  // Render content when text or config changes
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || editing || showHistory) return;

    try {
      renderer.render(latestText, configJson);
    } catch (err) {
      console.warn('Canvas render failed:', err);
    }
  }, [latestText, configJson, editing, showHistory]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        renderer.resize(width, height);
        renderer.paint();
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Handle scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    e.preventDefault();
    const newScroll = renderer.getScroll() + e.deltaY;
    renderer.setScroll(newScroll);
    renderer.paint();
  }, []);

  // Handle click (hit testing)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitJson = renderer.hitTest(x, y);
    if (!hitJson) return;

    try {
      const action = JSON.parse(hitJson);
      if (action.WikiLink?.rkey) {
        onNavigate(action.WikiLink.rkey);
      } else if (action.ExternalLink?.url) {
        window.open(action.ExternalLink.url, '_blank', 'noopener');
      }
    } catch {
      // Invalid JSON, ignore
    }
  }, [onNavigate]);

  // Handle cursor changes on hover
  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitJson = renderer.hitTest(x, y);
    canvasRef.current.style.cursor = hitJson ? 'pointer' : 'default';
  }, []);

  const commentOps = ops.filter(o => o.op.opType === 'message');

  const handleSendComment = () => {
    if (!commentText.trim() || sending) return;
    onSendComment(commentText.trim());
    setCommentText('');
  };

  return (
    <div className="wave-doc">
      <div className="wave-thread-header">
        <h3>{thread.thread.title || 'Untitled Document'}</h3>
        <span className="wave-thread-meta">
          {docHistory.length} edits{connected && ' · live'}
          <button className="wave-btn-sm" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Close' : 'History'}
          </button>
        </span>
      </div>

      {showHistory ? (
        <div className="wave-doc-history">
          <div className="wave-section-label"><span>Edit History ({docHistory.length})</span></div>
          {docHistory.map((entry, i) => (
            <div key={entry.uri} className="wave-doc-history-entry">
              <div className="wave-message-author">
                v{i + 1} by @{entry.authorHandle || entry.authorDid.slice(0, 16) + '...'}
              </div>
              <div className="wave-message-text">
                {entry.text.slice(0, 200)}{entry.text.length > 200 ? '...' : ''}
              </div>
              <div className="wave-message-time">{new Date(entry.createdAt).toLocaleString()}</div>
              <button className="wave-btn-sm" onClick={() => {
                setEditText(entry.text);
                setEditing(true);
                setShowHistory(false);
              }}>Restore</button>
            </div>
          ))}
        </div>
      ) : editing ? (
        <div className="wave-doc-editor">
          <textarea
            className="wave-doc-textarea wave-doc-textarea-full"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder="Write your document in markdown..."
          />
          <div className="wave-doc-actions">
            <button className="wave-btn-primary" onClick={() => onSaveDoc(editText)} disabled={sending}>
              {sending ? 'Saving...' : 'Save'}
            </button>
            <button className="wave-btn-sm" onClick={() => { setEditing(false); setEditText(latestText); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="wave-doc-viewer" ref={containerRef}>
          {latestText ? (
            <canvas
              ref={canvasRef}
              className="wave-canvas-doc"
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMove}
              onWheel={handleWheel}
            />
          ) : (
            <p className="wave-empty-hint">Empty document. Click Edit to start writing.</p>
          )}
          <div className="wave-doc-actions">
            <button className="wave-btn-primary" onClick={() => setEditing(true)}>Edit</button>
          </div>
        </div>
      )}

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <div className="wave-backlinks">
          <h3>Backlinks ({backlinks.length})</h3>
          <ul>
            {backlinks.map(b => (
              <li key={b.rkey}>
                <button className="wave-backlink-item" onClick={() => onNavigate(b.rkey)}>
                  {b.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comments */}
      <div className="wave-doc-comments">
        <div className="wave-section-label"><span>Comments</span></div>
        <div className="wave-messages compact">
          {commentOps.map(opRec => {
            const key = `${opRec.authorDid}:${opRec.rkey}`;
            const payload = decryptedMessages.get(key) as MessagePayload | undefined;
            return (
              <div key={key} className="wave-message compact">
                <span className="wave-message-author">
                  @{opRec.authorHandle || opRec.authorDid.slice(0, 16) + '...'}
                </span>
                <span className="wave-message-text">
                  {payload ? payload.text : 'Decrypting...'}
                </span>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="wave-compose">
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendComment();
              }
            }}
            placeholder="Add a comment..."
            disabled={sending}
          />
          <button className="wave-btn-primary wave-send-btn" onClick={handleSendComment}
            disabled={sending || !commentText.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}
