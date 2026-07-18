// ChatView — the default post-login surface: a chat with the coding agent
// (Claude Code harness → the selected model profile, kimi3 by default) running
// in your per-DID container. Native composer input (mobile-friendly), message
// bubbles, tool calls as dim chips. The terminal remains one tap away as the
// power surface.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChatSocket, chatPreflight, debugBoot, debugRestart, assistStream } from './lib/chat-socket.js';

const ASSIST_STORE_KEY = 'os:assist-thread';
const ASSIST_MAX_MSGS = 200;
const HANDOFF_LAST_N = 12;

function loadAssistThread() {
  try { return JSON.parse(localStorage.getItem(ASSIST_STORE_KEY)) || []; } catch { return []; }
}

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
  // Two modes. 'assist' (default): direct worker→Kimi chat — no container, no
  // repo context, instant and cheap; the place to strategize. 'repo': the full
  // Claude Code harness in your container. The → repo handoff carries the
  // strategy thread's tail across.
  const [mode, setMode] = useState('assist');
  const [assistMsgs, setAssistMsgs] = useState(loadAssistThread);
  const [assistRunning, setAssistRunning] = useState(false);
  const assistAbortRef = useRef(null);
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const connectingRef = useRef(false);
  const pendingRef = useRef(null);   // message typed while disconnected
  const handleFrameRef = useRef(null); // for history replay recursion

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
        // The server keeps runs alive across disconnects — reattaching tells
        // us whether the agent is STILL WORKING right now.
        setRunning(!!msg.busy);
        if (msg.busy) push({ role: 'info', text: 'agent is still working — reattached to the live run' });
        // Flush a message typed while disconnected (after history replays).
        setTimeout(() => {
          const pending = pendingRef.current;
          if (pending && socketRef.current?.connected) {
            pendingRef.current = null;
            push({ role: 'user', text: pending });
            setRunning(true);
            socketRef.current.sendUser(pending);
          }
        }, 150);
        break;
      case 'history':
        // Authoritative story-so-far from the server (survives reloads and
        // container sleeps). Replace local state and replay.
        setMessages([]);
        for (const f of msg.frames || []) handleFrameRef.current(f);
        break;
      case 'user-msg':
        push({ role: 'user', text: msg.text });
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
  handleFrameRef.current = handleFrame;

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
          else if (s === 'reconnecting') {
            setStatus('connecting');
            setStatusDetail(`reconnecting (${info?.attempt ?? ''})…`);
          }
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

  // The container connects only when repo mode is entered — assist mode
  // never boots (or bills) a container.
  useEffect(() => {
    if (mode === 'repo') connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => () => socketRef.current?.disconnect(), []);

  // Persist the assist thread across reloads (device-local for now).
  useEffect(() => {
    try { localStorage.setItem(ASSIST_STORE_KEY, JSON.stringify(assistMsgs.slice(-ASSIST_MAX_MSGS))); } catch { /* full */ }
  }, [assistMsgs]);

  // Coming back to the app (rotate, unlock, tab switch) with a dead socket →
  // rejoin automatically; the server-side run and history are waiting.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || mode !== 'repo') return;
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.reconnectNow();
      } else if (!socketRef.current) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [connect, mode]);

  // Assist mode: direct streaming chat, no container.
  const submitAssist = useCallback(async () => {
    const text = draft.trim();
    if (!text || assistRunning) return;
    setDraft('');
    const base = [...assistMsgs, { id: nextId++, role: 'user', text }];
    setAssistMsgs(base);
    setAssistRunning(true);
    const aiId = nextId++;
    setAssistMsgs((l) => [...l, { id: aiId, role: 'assistant', text: '' }]);
    const ctrl = new AbortController();
    assistAbortRef.current = ctrl;
    try {
      const authInfo = getContainerAuth();
      if (!authInfo) throw new Error('linking device via OAuth…');
      await assistStream(
        { session: session.did, ...authInfo },
        base.filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.text })),
        (delta) => {
          setAssistMsgs((l) => l.map((m) => (m.id === aiId ? { ...m, text: m.text + delta } : m)));
        },
        ctrl.signal
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setAssistMsgs((l) => [...l, { id: nextId++, role: 'error', text: err.message }]);
      }
    } finally {
      setAssistRunning(false);
      assistAbortRef.current = null;
    }
  }, [draft, assistRunning, assistMsgs, session, getContainerAuth]);

  // Handoff: distill the strategy thread's tail into the repo agent's first
  // message — left in the composer so YOU pull the expensive trigger.
  const handoff = useCallback(() => {
    const tail = assistMsgs
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim())
      .slice(-HANDOFF_LAST_N);
    const transcript = tail
      .map((m) => `${m.role === 'user' ? 'me' : 'kimi'}: ${m.text}`)
      .join('\n\n');
    setDraft(
      tail.length
        ? `Context from our strategy chat:\n\n${transcript}\n\n---\nWith that context, please: `
        : ''
    );
    setMode('repo');
  }, [assistMsgs]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || running) return;
    if (!socketRef.current?.connected) {
      // Don't swallow the message: queue it, rejoin, flush on ready.
      pendingRef.current = text;
      setDraft('');
      push({ role: 'info', text: 'not connected — message queued, reconnecting…' });
      if (socketRef.current) socketRef.current.reconnectNow(); else connect();
      return;
    }
    push({ role: 'user', text });
    setDraft('');
    setRunning(true);
    socketRef.current.sendUser(text);
  }, [draft, running, push, connect]);

  const stop = useCallback(() => socketRef.current?.interrupt(), []);

  const isAssist = mode === 'assist';
  const list = isAssist ? assistMsgs : messages;
  const busy = isAssist ? assistRunning : running;
  const dotColor = isAssist
    ? (assistRunning ? '#e5c07b' : '#98c379')
    : status === 'connected' ? '#98c379'
    : status === 'connecting' ? '#e5c07b'
    : '#e06c75';

  const doSubmit = isAssist ? submitAssist : submit;
  const doStop = isAssist
    ? () => assistAbortRef.current?.abort()
    : stop;

  const modeBtn = (m, label) => (
    <button
      style={{ ...S.hbtn, ...(mode === m ? { borderColor: '#2e6a73', color: '#7fd7e0' } : {}) }}
      onClick={() => setMode(m)}
    >
      {label}
    </button>
  );

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.dot(dotColor)} />
        <div style={S.title}>kimi</div>
        <div style={S.sub}>
          {isAssist
            ? `@${session.handle} · assist (direct, cheap)`
            : `@${session.handle} · ${profile}${statusDetail ? ` · ${statusDetail}` : ''}`}
        </div>
        {modeBtn('assist', 'assist')}
        {modeBtn('repo', 'repo')}
        {isAssist && assistMsgs.length > 0 && (
          <button style={S.hbtn} onClick={handoff}>→ repo</button>
        )}
        {isAssist && assistMsgs.length > 0 && (
          <button style={S.hbtn} onClick={() => setAssistMsgs([])}>clear</button>
        )}
        {!isAssist && (status === 'closed' || status === 'denied') && (
          <button style={S.hbtn} onClick={connect}>reconnect</button>
        )}
        <button style={S.hbtn} onClick={onOpenTerminal}>&gt;_</button>
        <button style={S.hbtn} onClick={onLogout}>logout</button>
      </div>

      <div ref={scrollRef} style={S.scroll}>
        {list.length === 0 && (
          <div style={S.info}>
            {isAssist ? (
              <>strategy chat with Kimi — direct API, no container, pennies per message.<br />
                when the plan is ready, <b>→ repo</b> hands this thread to the coding agent.</>
            ) : (
              <>the {profile} coding agent — a clone of agent01, git, and pushes that run
                GitHub Actions.<br />`work &lt;slug&gt;` branches are its lane.</>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {list.map((m) => {
            if (m.role === 'user') return <div key={m.id} style={S.userMsg}>{m.text}</div>;
            if (m.role === 'assistant') return <div key={m.id} style={S.aiMsg}>{m.text}</div>;
            if (m.role === 'tool') return <div key={m.id} style={S.tool}>{m.text}</div>;
            if (m.role === 'error') return <div key={m.id} style={S.err}>{m.text}</div>;
            return <div key={m.id} style={S.info}>{m.text}</div>;
          })}
          {busy && <div style={S.info}>⋯ {isAssist ? 'thinking' : 'working'}</div>}
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
              doSubmit();
            }
          }}
          placeholder={isAssist
            ? 'strategize with kimi…'
            : status === 'connected' ? `message the ${profile} agent…` : 'connecting…'}
          rows={1}
        />
        {busy ? (
          <button style={S.send(true)} onClick={doStop}>stop</button>
        ) : (
          <button style={S.send(false)} onClick={doSubmit}>send</button>
        )}
      </div>
    </div>
  );
}
