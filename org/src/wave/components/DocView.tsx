/**
 * Wave doc view — collaborative markdown document with edit history.
 */

import { useState, useRef, useEffect } from "react";
import type { WaveThreadRecord, WaveOpRecord, MessagePayload, DocEditPayload } from "../types";

interface DocHistoryEntry {
  uri: string;
  authorDid: string;
  authorHandle?: string;
  text: string;
  createdAt: string;
}

interface Props {
  thread: WaveThreadRecord;
  ops: WaveOpRecord[];
  decryptedMessages: Map<string, MessagePayload | DocEditPayload>;
  connected: boolean;
  loading: boolean;
  sending: boolean;
  messageText: string;
  myDid?: string;
  onMessageTextChange: (text: string) => void;
  onSendMessage: () => void;
  onSendDocEdit: (text: string) => void;
}

export function DocView({
  thread,
  ops,
  decryptedMessages,
  connected,
  loading,
  sending,
  messageText,
  onMessageTextChange,
  onSendMessage,
  onSendDocEdit,
}: Props) {
  const [docText, setDocText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Build doc state from decrypted ops
  const history: DocHistoryEntry[] = [];
  let latestText = "";
  for (const opRec of ops) {
    const key = `${opRec.authorDid}:${opRec.rkey}`;
    const p = decryptedMessages.get(key);
    if (p && "text" in p && opRec.op.opType === "doc_edit") {
      const docPayload = p as DocEditPayload;
      latestText = docPayload.text;
      history.push({
        uri: `at://${opRec.authorDid}/com.minomobi.wave.op/${opRec.rkey}`,
        authorDid: opRec.authorDid,
        authorHandle: opRec.authorHandle,
        text: docPayload.text,
        createdAt: opRec.op.createdAt,
      });
    }
  }

  // Update doc text when new edits arrive (only if not editing)
  useEffect(() => {
    if (!editing) setDocText(latestText);
  }, [latestText, editing]);

  return (
    <>
      <div className="wave-thread-header">
        <h3>{thread.thread.title || "Untitled Document"}</h3>
        <span className="wave-thread-meta">
          {history.length} edits
          {connected && " \u00b7 live"}
          <button className="btn-icon" title="History" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Close" : "History"}
          </button>
        </span>
      </div>

      {showHistory ? (
        <div className="wave-messages wave-doc-history">
          <div className="wave-doc-history-header">Edit History ({history.length} versions)</div>
          {history.map((entry, i) => (
            <div key={entry.uri} className="wave-message">
              <div className="wave-message-author">
                v{i + 1} by @{entry.authorHandle || entry.authorDid.slice(0, 16) + "..."}
              </div>
              <div className="wave-message-text wave-doc-history-text">
                {entry.text.slice(0, 200)}
                {entry.text.length > 200 ? "..." : ""}
              </div>
              <div className="wave-message-time">{new Date(entry.createdAt).toLocaleString()}</div>
              <button
                className="btn-secondary"
                onClick={() => {
                  setDocText(entry.text);
                  setEditing(true);
                  setShowHistory(false);
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : editing ? (
        <div className="wave-doc-editor">
          <textarea
            className="wave-doc-textarea"
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            placeholder="Write your document in markdown..."
          />
          <div className="wave-doc-actions">
            <button
              className="btn-primary"
              onClick={() => {
                onSendDocEdit(docText);
                setEditing(false);
              }}
              disabled={sending}
            >
              {sending ? "Saving..." : "Save"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setEditing(false);
                setDocText(latestText);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="wave-doc-viewer">
          {loading && <div className="wave-loading-inline">Loading document...</div>}
          <div className="wave-doc-content">
            {docText ? (
              <pre className="wave-doc-rendered">{docText}</pre>
            ) : (
              <p className="wave-empty-hint">Empty document. Click Edit to start writing.</p>
            )}
          </div>
          <div className="wave-doc-actions">
            <button className="btn-primary" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        </div>
      )}

      {/* Comments on the doc */}
      <div className="wave-doc-comments">
        <div className="wave-section-header">
          <span>Comments</span>
        </div>
        <div className="wave-messages compact">
          {ops
            .filter((o) => o.op.opType === "message")
            .map((opRec) => {
              const key = `${opRec.authorDid}:${opRec.rkey}`;
              const payload = decryptedMessages.get(key);
              return (
                <div key={key} className="wave-message compact">
                  <span className="wave-message-author">
                    @{opRec.authorHandle || opRec.authorDid.slice(0, 16) + "..."}
                  </span>
                  <span className="wave-message-text">{payload ? payload.text : "Decrypting..."}</span>
                </div>
              );
            })}
          <div ref={messagesEndRef} />
        </div>
        <div className="wave-compose">
          <input
            type="text"
            value={messageText}
            onChange={(e) => onMessageTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            placeholder="Add a comment..."
            disabled={sending}
          />
          <button className="btn-primary wave-send-btn" onClick={onSendMessage} disabled={sending || !messageText.trim()}>
            Send
          </button>
        </div>
      </div>
    </>
  );
}
