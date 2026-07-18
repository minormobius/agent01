// ChatView — the default post-login surface: a chat with the coding agent
// (Claude Code harness → the selected model profile, kimi3 by default) running
// in your per-DID container. Native composer input (mobile-friendly), message
// bubbles, tool calls as dim chips. The terminal remains one tap away as the
// power surface.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChatSocket, chatPreflight, debugBoot, debugRestart } from './lib/chat-socket.js';

const MONO = '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';

const S = {
  root: {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
    background: '#0a0a0a', color: '#c0c0c0', fontFamily: MONO,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
    borderBottom: '1px solid #1e1e1e', flexShrink: 0,
  },
  title: { color: '#56b6c2', fontWeight: 700, fontSize: 14 },
  sub: { color: '#606060', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
  hbtn: {
    background: '#161616', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#909090', fontSize: 11, padding: '6px 10px', cursor: 'pointer', fontFamily: MONO,
  },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 12px 4px', WebkitOverflowScrolling: 'touch' },
  userMsg: {
    alignSelf: 'flex-end', maxWidth: '85%', margin: '6px 0 6px auto',
    background: '#1a3b40', border: '1px solid #24565e', borderRadius: '10px 10px 2px 10px',
    padding: '8px 11px', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#cfeef2',
  },
  aiMsg: {
    maxWidth: '92%', margin: '6px 0',
    background: '#141414', border: '1px solid #222', borderRadius: '10px 10px 10px 2px',
    padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  tool: {
    margin: '4px 0', color: '#6a7', fontSize: 11.5,
    padding: '3px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  info: { margin: '6px 0', color: '#555', fontSize: 11, textAlign: 'center' },
  err: { margin: '6px 0', color: '#e06c75', fontSize: 12, whiteSpace: 'pre-wrap' },
  composerWrap: {
    display: 'flex', gap: 8, padding: '10px 12px',
    borderTop: '1px solid #1e1e1e', flexShrink: 0, alignItems: 'flex-end',
    background: '#0d0d0d',
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', boxSizing: 'border-box',
    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
    color: '#e0e0e0', fontSize: 15, padding: '10px 12px', fontFamily: MONO, outline: 'none',
  },
  send: (running) => ({
    height: 40, padding: '0 16px', borderRadius: 8, fontFamily: MONO, fontSize: 13,
    cursor: 'pointer', flexShrink: 0,
    background: running ? '#402020' : '#1a3b40',
    border: running ? '1px solid #6e2e2e' : '1px solid #2e6a73',
    color: running ? '#e09090' : '#7fd7e0',
  }),
};

let nextId = 1;

export default function ChatView({ session, getContainerAuth, profile = 'kimi3', onOpenTerminal, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // idle|connecting|connected|closed|denied
  const [statusDetail, setStatusDetail] = useState('');
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const connectingRef = useRef(false);

  const push = useCallback((m) => {
    setMessages((list) => [...list, { id: nextId++, ...m }]);
  }, []);
  const appendAssistant = useCallback((text) => {
    setMessages((list) => {
      const last = list[list.length - 1];
      if (last?.role === 'assistant') {
        return [...list.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...list, { id: nextId++, role: 'assistant', text }];
    });
  }, []);

  // Autoscroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, running]);

  const handleFrame = useCallback((msg) => {
    switch (msg.type) {
      case 'ready':
        push({ role: 'info', text: `container ready · profile ${msg.profile}` });
        break;
      case 'start':
        setRunning(true);
        if (msg.diag) {
          const d = msg.diag;
          if (d.missing) push({ role: 'error', text: 'profile missing from AGENT_PROFILES in the container env — redeploy os-api' });
          else if (d.parseError) push({ role: 'error', text: 'AGENT_PROFILES env is not valid JSON in the container' });
          else if (!d.hasKey) push({ role: 'error', text: `profile has NO API KEY in the container env — MOONSHOT_API_KEY isn't reaching AGENT_PROFILES (check worker secrets / redeploy)` });
          else push({ role: 'info', text: `run: ${d.model} @ ${d.base}` });
        }
        break;
      case 'event': {
        let evt;
        try { evt = JSON.parse(msg.line); } catch {
          // Non-JSON stdout (login-shell chatter, CLI errors) — show, don't drop.
          push({ role: 'info', text: msg.line.slice(0, 300) });
          return;
        }
        if (evt.type === 'system' && evt.subtype === 'init') {
          push({ role: 'info', text: `session ${evt.session_id?.slice(0, 8) ?? ''} · ${evt.model ?? ''}` });
        } else if (evt.type === 'assistant') {
          for (const block of evt.message?.content ?? []) {
            if (block.type === 'text' && block.text) appendAssistant(block.text);
            else if (block.type === 'tool_use') {
              let summary = '';
              try { summary = JSON.stringify(block.input); } catch { /* ignore */ }
              push({ role: 'tool', text: `▸ ${block.name} ${summary.slice(0, 110)}` });
            }
          }
        } else if (evt.type === 'result') {
          const secs = evt.duration_ms ? `${(evt.duration_ms / 1000).toFixed(1)}s` : '';
          const cost = typeof evt.total_cost_usd === 'number' ? ` · $${evt.total_cost_usd.toFixed(4)}` : '';
          const err = evt.is_error ? ' · ERROR' : '';
          push({ role: 'info', text: `turn done · ${secs}${cost}${err}` });
          if (evt.is_error && evt.result) push({ role: 'error', text: String(evt.result).slice(0, 1000) });
        }
        break;
      }
      case 'stderr':
        // Claude Code chatters on stderr in --verbose; only surface real fails.
        if (/error|fail|denied|invalid/i.test(msg.text)) {
          push({ role: 'error', text: msg.text.slice(0, 600) });
        }
        break;
      case 'error':
        push({ role: 'error', text: msg.error });
        setRunning(false);
        break;
      case 'done':
        setRunning(false);
        if (msg.code) {
          push({ role: 'error', text: `agent exited (code ${msg.code})${msg.stderr ? `\n${msg.stderr}` : ''}` });
        }
        break;
      default:
        break;
    }
  }, [push, appendAssistant]);

  const connect = useCallback(async () => {
    if (connectingRef.current || socketRef.current?.connected) return;
    connectingRef.current = true;
    setStatus('connecting');
    setStatusDetail('checking access…');
    try {
      const authInfo = getContainerAuth();
      if (!authInfo) { setStatus('denied'); setStatusDetail('linking device via OAuth…'); return; }
      const pre = await chatPreflight({ session: session.did, ...authInfo });
      if (!pre.ok) {
        setStatus('denied');
        setStatusDetail(pre.error);
        push({ role: 'error', text: `access check failed: ${pre.error}` });
        return;
      }
      // Pre-boot the container over HTTP before opening the socket — a cold
      // start (image pull ~30-40s) used to kill the first WebSocket attempt.
      setStatusDetail('starting container (first boot after a deploy can take ~2 min)…');
      let boot = await debugBoot({ session: session.did, ...authInfo });
      // /health 404 = an instance still running a PRE-fix image (rollouts
      // don't replace a container that never idles). Self-heal: restart it
      // onto the current image and boot again.
      if (boot.containerStatus === 404) {
        push({ role: 'info', text: 'container is on a stale image — restarting it onto the current one…' });
        setStatusDetail('restarting container…');
        await debugRestart({ session: session.did, ...authInfo });
        setStatusDetail('booting fresh container (~40s)…');
        boot = await debugBoot({ session: session.did, ...authInfo });
      }
      if (!boot.ok || (boot.containerStatus && boot.containerStatus >= 400)) {
        setStatus('denied');
        setStatusDetail('container failed to boot');
        push({ role: 'error', text: `container boot: ${boot.error || JSON.stringify(boot)}` });
        return;
      }
      setStatusDetail('container up — opening socket…');
      let everConnected = false;
      const sock = new ChatSocket({
        onMessage: handleFrame,
        onStatus: (s, info) => {
          if (s === 'connected') { everConnected = true; setStatus('connected'); setStatusDetail(''); }
          else if (s === 'closed') {
            setStatus('closed');
            setRunning(false);
            setStatusDetail(`socket closed (${info?.code ?? '?'})`);
            // Died before ever connecting → run the boot diagnostic and name
            // the cause instead of leaving a silent reconnect button.
            if (!everConnected) {
              push({ role: 'info', text: 'socket closed before connecting — probing container boot…' });
              debugBoot({ session: session.did, ...authInfo }).then((d) => {
                if (d.ok) {
                  push({ role: 'info', text: `container boots fine (${d.ms}ms, health ${d.containerStatus}) — websocket leg is the problem; try reconnect` });
                } else {
                  push({ role: 'error', text: `container boot: ${d.error || JSON.stringify(d)}` });
                }
              });
            }
          }
        },
      });
      socketRef.current = sock;
      sock.connect({ session: session.did, ...authInfo, profile });
    } finally {
      connectingRef.current = false;
    }
  }, [session, getContainerAuth, profile, handleFrame, push]);

  useEffect(() => {
    connect();
    return () => socketRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || running) return;
    if (!socketRef.current?.connected) { connect(); return; }
    push({ role: 'user', text });
    setDraft('');
    setRunning(true);
    socketRef.current.sendUser(text);
  }, [draft, running, push, connect]);

  const stop = useCallback(() => socketRef.current?.interrupt(), []);

  const dotColor = status === 'connected' ? '#98c379'
    : status === 'connecting' ? '#e5c07b'
    : '#e06c75';

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.dot(dotColor)} />
        <div style={S.title}>kimi</div>
        <div style={S.sub}>
          @{session.handle} · {profile}
          {statusDetail ? ` · ${statusDetail}` : ''}
        </div>
        {(status === 'closed' || status === 'denied') && (
          <button style={S.hbtn} onClick={connect}>reconnect</button>
        )}
        <button style={S.hbtn} onClick={onOpenTerminal}>&gt;_ terminal</button>
        <button style={S.hbtn} onClick={onLogout}>logout</button>
      </div>

      <div ref={scrollRef} style={S.scroll}>
        {messages.length === 0 && (
          <div style={S.info}>
            chat with the {profile} coding agent — it has a clone of agent01,<br />
            git, and a push that runs GitHub Actions. `work &lt;slug&gt;` branches are its lane.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {messages.map((m) => {
            if (m.role === 'user') return <div key={m.id} style={S.userMsg}>{m.text}</div>;
            if (m.role === 'assistant') return <div key={m.id} style={S.aiMsg}>{m.text}</div>;
            if (m.role === 'tool') return <div key={m.id} style={S.tool}>{m.text}</div>;
            if (m.role === 'error') return <div key={m.id} style={S.err}>{m.text}</div>;
            return <div key={m.id} style={S.info}>{m.text}</div>;
          })}
          {running && <div style={S.info}>⋯ working</div>}
        </div>
      </div>

      <div style={S.composerWrap}>
        <textarea
          style={S.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={status === 'connected' ? `message ${profile}…` : 'connecting…'}
          rows={1}
        />
        {running ? (
          <button style={S.send(true)} onClick={stop}>stop</button>
        ) : (
          <button style={S.send(false)} onClick={submit}>send</button>
        )}
      </div>
    </div>
  );
}
