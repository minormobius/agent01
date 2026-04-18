import { useEffect, useRef, useState } from 'react';
import type { WaveThreadRecord, WaveOpRecord, MessagePayload } from '../types';

interface Props {
  thread: WaveThreadRecord;
  ops: WaveOpRecord[];
  decryptedMessages: Map<string, MessagePayload>;
  connected: boolean;
  memberCount: number;
  myDid: string;
  sending: boolean;
  onSendMessage: (text: string) => void;
}

export function ChatView({
  thread, ops, decryptedMessages, connected, memberCount,
  myDid, sending, onSendMessage,
}: Props) {
  const [messageText, setMessageText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ops]);

  const handleSend = () => {
    if (!messageText.trim() || sending) return;
    onSendMessage(messageText.trim());
    setMessageText('');
  };

  return (
    <div className="wave-chat">
      <div className="wave-thread-header">
        <h3>{thread.thread.title || 'Chat'}</h3>
        <span className="wave-thread-meta">
          {memberCount} members{connected && ' · live'}
        </span>
      </div>

      <div className="wave-messages">
        {ops.map(opRec => {
          const key = `${opRec.authorDid}:${opRec.rkey}`;
          const payload = decryptedMessages.get(key);
          const isMe = opRec.authorDid === myDid;
          return (
            <div key={key} className={`wave-message ${isMe ? 'mine' : ''}`}>
              <div className="wave-message-author">
                {opRec.authorHandle ? `@${opRec.authorHandle}` : opRec.authorDid.slice(0, 20) + '...'}
              </div>
              <div className="wave-message-text">
                {payload ? payload.text : 'Decrypting...'}
              </div>
              <div className="wave-message-time">
                {new Date(opRec.op.createdAt).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="wave-compose">
        <input
          type="text"
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          disabled={sending}
        />
        <button
          className="wave-btn-primary wave-send-btn"
          onClick={handleSend}
          disabled={sending || !messageText.trim()}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
