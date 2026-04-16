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
  onPostToBluesky?: (text: string) => Promise<void>;
}

export function CanvasDocView({
  thread, ops, decryptedMessages, connected, sending,
  allStubs, allDocThreads, onSaveDoc, onSendComment, onNavigate, onPostToBluesky,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);
  const blinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editing, setEditing] = useState(false);
  const [textareaEditing, setTextareaEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
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
    if (!editing && !textareaEditing) setEditText(latestText);
  }, [latestText, editing, textareaEditing]);

  const backlinks = useMemo(() => {
    const stub = allStubs.find(s => s.rkey === thread.rkey);
    return stub ? findBacklinks(allStubs, thread.rkey) : [];
  }, [allStubs, thread.rkey]);

  // Initialize canvas renderer (persistent — not destroyed on edit toggle)
  useEffect(() => {
    if (!canvasRef.current || !isMarkdownReady() || showHistory || textareaEditing) return;

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
  }, [showHistory, textareaEditing]);

  // Render content when text or config changes (view mode only)
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || showHistory || textareaEditing) return;
    // Don't re-render from latestText while in canvas edit mode —
    // the edit state owns the markdown during editing
    if (editing) return;

    try {
      renderer.render(latestText, configJson);
    } catch (err) {
      console.warn('Canvas render failed:', err);
    }
  }, [latestText, configJson, showHistory, textareaEditing, editing]);

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

  // Cursor blink interval when in canvas edit mode
  useEffect(() => {
    if (editing) {
      blinkRef.current = setInterval(() => {
        rendererRef.current?.toggleBlink();
      }, 530);
      return () => {
        if (blinkRef.current) clearInterval(blinkRef.current);
      };
    }
  }, [editing]);

  // Handle scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    e.preventDefault();
    const newScroll = renderer.getScroll() + e.deltaY;
    renderer.setScroll(newScroll);
    renderer.paint();
  }, []);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editing) {
      // Edit mode: place cursor
      renderer.handleClick(x, y, e.shiftKey);
      // Focus the hidden input to capture keyboard events
      hiddenInputRef.current?.focus();
      return;
    }

    // View mode: hit test for links
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
  }, [onNavigate, editing]);

  // Handle cursor changes on hover
  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !canvasRef.current) return;

    if (editing) {
      canvasRef.current.style.cursor = 'text';
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitJson = renderer.hitTest(x, y);
    canvasRef.current.style.cursor = hitJson ? 'pointer' : 'default';
  }, [editing]);

  // Hidden input handlers for canvas edit mode
  const handleHiddenInput = useCallback(() => {
    const renderer = rendererRef.current;
    const input = hiddenInputRef.current;
    if (!renderer || !input || !editing) return;

    const text = input.value;
    if (text) {
      renderer.handleInput(text);
      input.value = '';
    }
  }, [editing]);

  const handleHiddenKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !editing) return;

    // Let the hidden input handle normal character input via onInput
    // Here we only handle special keys
    const ctrl = e.ctrlKey || e.metaKey;

    // Handle copy/cut/paste natively
    if (ctrl && (e.key === 'c' || e.key === 'x' || e.key === 'v')) {
      if (e.key === 'c' || e.key === 'x') {
        const selected = renderer.getSelectedText();
        if (selected) {
          navigator.clipboard.writeText(selected);
        }
        if (e.key === 'x' && selected) {
          renderer.handleKeyDown('Backspace', false, false);
        }
        e.preventDefault();
      }
      // Let paste go through — it'll trigger onInput
      return;
    }

    // Save shortcut
    if (ctrl && e.key === 's') {
      e.preventDefault();
      const md = renderer.getMarkdown();
      onSaveDoc(md);
      return;
    }

    // Escape exits edit mode
    if (e.key === 'Escape') {
      e.preventDefault();
      const md = renderer.stopEditing();
      setEditing(false);
      setEditText(md);
      renderer.render(md, configJson);
      return;
    }

    const handled = renderer.handleKeyDown(e.key, ctrl, e.shiftKey);
    if (handled) {
      e.preventDefault();
    }
  }, [editing, onSaveDoc, configJson]);

  // Start canvas editing
  const startCanvasEdit = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      // Fallback to textarea if canvas isn't available
      setTextareaEditing(true);
      setEditText(latestText);
      return;
    }
    renderer.startEditing(latestText);
    setEditing(true);
    // Focus hidden input after render
    requestAnimationFrame(() => hiddenInputRef.current?.focus());
  }, [latestText]);

  // Save from canvas edit
  const saveCanvasEdit = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const md = renderer.getMarkdown();
    onSaveDoc(md);
    renderer.stopEditing();
    setEditing(false);
    // Re-render in view mode
    renderer.render(md, configJson);
  }, [onSaveDoc, configJson]);

  // Cancel canvas edit
  const cancelCanvasEdit = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.stopEditing();
    setEditing(false);
    renderer.render(latestText, configJson);
  }, [latestText, configJson]);

  // Format toolbar actions (canvas edit mode)
  const applyFormat = useCallback((prefix: string, suffix: string) => {
    const renderer = rendererRef.current;
    if (!renderer || !editing) return;
    renderer.applyFormat(prefix, suffix);
    hiddenInputRef.current?.focus();
  }, [editing]);

  const commentOps = ops.filter(o => o.op.opType === 'message');

  const handleSendComment = () => {
    if (!commentText.trim() || sending) return;
    onSendComment(commentText.trim());
    setCommentText('');
  };

  const textBytes = new TextEncoder().encode(latestText).length;
  const canPostToBluesky = onPostToBluesky && latestText.trim() && textBytes <= 300;

  const handlePostToBluesky = async () => {
    if (!onPostToBluesky || !canPostToBluesky || posting) return;
    setPosting(true);
    try {
      await onPostToBluesky(latestText.trim());
      setPosted(true);
      setTimeout(() => setPosted(false), 3000);
    } catch (err) {
      console.error('Post to Bluesky failed:', err);
    } finally {
      setPosting(false);
    }
  };

  // Format toolbar for canvas edit mode
  const formatButtons = [
    { label: 'B', title: 'Bold', pre: '**', suf: '**' },
    { label: 'I', title: 'Italic', pre: '*', suf: '*' },
    { label: 'S', title: 'Strikethrough', pre: '~~', suf: '~~' },
    { label: '`', title: 'Code', pre: '`', suf: '`' },
    { label: '[[', title: 'Wiki link', pre: '[[', suf: ']]' },
    { label: '🔗', title: 'Link', pre: '[', suf: '](url)' },
  ];

  return (
    <div className="wave-doc">
      <div className="wave-thread-header">
        <h3>{thread.thread.title || 'Untitled Document'}</h3>
        <span className="wave-thread-meta">
          {docHistory.length} edits{connected && ' · live'}
          {editing && <span style={{ color: 'var(--accent)' }}> · editing</span>}
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
                setTextareaEditing(true);
                setShowHistory(false);
              }}>Restore</button>
            </div>
          ))}
        </div>
      ) : textareaEditing ? (
        <div className="wave-doc-editor">
          <textarea
            className="wave-doc-textarea wave-doc-textarea-full"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder="Write your document in markdown..."
            autoFocus
          />
          <div className="wave-doc-actions">
            <button className="wave-btn-primary" onClick={() => {
              onSaveDoc(editText);
              setTextareaEditing(false);
            }} disabled={sending}>
              {sending ? 'Saving...' : 'Save'}
            </button>
            <button className="wave-btn-sm" onClick={() => { setTextareaEditing(false); setEditText(latestText); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="wave-doc-viewer" ref={containerRef}>
          {/* Format toolbar (visible in canvas edit mode) */}
          {editing && (
            <div className="wave-format-toolbar">
              {formatButtons.map(b => (
                <button key={b.title} className="wave-format-btn" title={b.title}
                  onMouseDown={e => { e.preventDefault(); applyFormat(b.pre, b.suf); }}>
                  {b.label}
                </button>
              ))}
            </div>
          )}

          {latestText || editing ? (
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

          {/* Hidden input for capturing keyboard input in canvas edit mode */}
          {editing && (
            <textarea
              ref={hiddenInputRef}
              className="wave-hidden-input"
              onInput={handleHiddenInput}
              onKeyDown={handleHiddenKeyDown}
              autoFocus
            />
          )}

          <div className="wave-doc-actions">
            {editing ? (
              <>
                <button className="wave-btn-primary" onClick={saveCanvasEdit} disabled={sending}>
                  {sending ? 'Saving...' : 'Save'}
                </button>
                <button className="wave-btn-sm" onClick={cancelCanvasEdit}>Cancel</button>
                <button className="wave-btn-sm" onClick={() => {
                  // Switch to raw textarea mode
                  const renderer = rendererRef.current;
                  const md = renderer?.getMarkdown() || latestText;
                  renderer?.stopEditing();
                  setEditing(false);
                  setEditText(md);
                  setTextareaEditing(true);
                }}>Raw</button>
              </>
            ) : (
              <>
                <button className="wave-btn-primary" onClick={startCanvasEdit}>Edit</button>
                {onPostToBluesky && latestText.trim() && (
                  canPostToBluesky ? (
                    <button className="wave-post-bsky" onClick={handlePostToBluesky}
                      disabled={posting || posted}>
                      {posted ? 'Posted!' : posting ? 'Posting...' : 'Post to Bluesky'}
                    </button>
                  ) : (
                    <span className="wave-post-bsky-info">
                      {textBytes}/300 bytes — too long to post
                    </span>
                  )
                )}
              </>
            )}
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
