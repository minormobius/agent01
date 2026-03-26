/**
 * Wave chat view — real-time encrypted messages in a thread.
 */

import { useRef, useEffect } from "react";
import type { WaveOrgContext, WaveChannelRecord, WaveThreadRecord, WaveOpRecord, MessagePayload, DocEditPayload } from "../types";

interface Props {
  ctx: WaveOrgContext;
  channel: WaveChannelRecord;
  thread: WaveThreadRecord;
  ops: WaveOpRecord[];
  decryptedMessages: Map<string, MessagePayload | DocEditPayload>;
  connected: boolean;
  loading: boolean;
  messageText: string;
  sending: boolean;
  myDid: string;
  onMessageTextChange: (text: string) => void;
  onSendMessage: () => void;
}

export function ChatView({
  ctx,
  channel,
  thread,
  ops,
  decryptedMessages,
  connected,
  loading,
  messageText,
  sending,
  myDid,
  onMessageTextChange,
  onSendMessage,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ops]);

  return (
    <>
      <div className="wave-thread-header">
        <h3>{thread.thread.title || `# ${channel.channel.name}`}</h3>
        <span className="wave-thread-meta">
          {ctx.memberships.length} members
          {connected && " \u00b7 live"}
        </span>
      </div>

      <div className="wave-messages">
        {loading && <div className="wave-loading-inline">Loading messages...</div>}
        {ops.map((opRec) => {
          const key = `${opRec.authorDid}:${opRec.rkey}`;
          const payload = decryptedMessages.get(key);
          const isMe = opRec.authorDid === myDid;
          return (
            <div key={key} className={`wave-message ${isMe ? "mine" : ""}`}>
              <div className="wave-message-author">
                {opRec.authorHandle ? `@${opRec.authorHandle}` : opRec.authorDid.slice(0, 20) + "..."}
              </div>
              <div className="wave-message-text">{payload ? payload.text : "Decrypting..."}</div>
              <div className="wave-message-time">{new Date(opRec.op.createdAt).toLocaleTimeString()}</div>
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
          placeholder="Type a message..."
          disabled={sending}
        />
        <button className="btn-primary wave-send-btn" onClick={onSendMessage} disabled={sending || !messageText.trim()}>
          {sending ? "..." : "Send"}
        </button>
      </div>
    </>
  );
}
