import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { WaveThreadRecord, WaveOpRecord, MessagePayload, DocEditPayload } from '../types';
import type { NoteStub } from '../lib/wiki';
import { renderWikilinks, findBacklinks, buildTitleIndex } from '../lib/wiki';

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

export function DocView({
  thread, ops, decryptedMessages, connected, sending,
  allStubs, allDocThreads, onSaveDoc, onSendComment, onNavigate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [commentText, setCommentText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const titleIndex = useMemo(() => buildTitleIndex(allDocThreads), [allDocThreads]);

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

  // Backlinks for current page
  const backlinks = useMemo(() => {
    const stub = allStubs.find(s => s.rkey === thread.rkey);
    return stub ? findBacklinks(allStubs, thread.rkey) : [];
  }, [allStubs, thread.rkey]);

  // Rendered preview HTML with wikilinks
  const previewHtml = useMemo(() => {
    const text = editing ? editText : latestText;
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return renderWikilinks(escaped, titleIndex);
  }, [editing, editText, latestText, titleIndex]);

  // Handle wikilink clicks in preview
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wiki-link') && target.dataset.rkey) {
      onNavigate(target.dataset.rkey);
    }
  }, [onNavigate]);

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
          <div className="wave-doc-split">
            <textarea
              className="wave-doc-textarea"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              placeholder="Write your document in markdown... Use [[Page Title]] for wikilinks."
            />
            <div
              className="wave-doc-preview"
              onClick={handlePreviewClick}
              dangerouslySetInnerHTML={{ __html: `<pre>${previewHtml}</pre>` }}
            />
          </div>
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
        <div className="wave-doc-viewer">
          {latestText ? (
            <div
              className="wave-doc-content"
              onClick={handlePreviewClick}
              dangerouslySetInnerHTML={{ __html: `<pre>${previewHtml}</pre>` }}
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
