// ChatView — the default post-login surface. Two modes:
//   assist: direct worker→Kimi chat (no container, cheap, instant) — the
//           strategy space. Threads persist PRIVATELY in the per-DID Durable
//           Object (not PDS records — the PDS is the open web).
//   repo:   the full Claude Code harness in your container (amber accent so
//           you always know which wallet is open).
// The → repo handoff carries the strategy thread's tail into the agent.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChatSocket, chatPreflight, debugBoot, debugRestart, assistStart, assistPoll, assistInterrupt, threadsApi } from './lib/chat-socket.js';
import { renderMarkdown } from './lib/mini-md.jsx';

const ASSIST_STORE_KEY = 'os:assist-thread';
const ASSIST_SYSTEM_KEY = 'os:assist-system';
const ASSIST_PREFS_KEY = 'os:assist-prefs';
const ASSIST_TID_KEY = 'os:assist-thread-id';
const ACTIVE_TURN_KEY = 'os:assist-active-turn';
const ASSIST_MAX_MSGS = 200;
const HANDOFF_LAST_N = 12;

const DEFAULT_SYSTEM = 'You are Kimi in the assist mode of os.mino.mobi — a quick, direct thinking partner. minomobi is a personal, non-commercial playground of experimental web toys (ATProto apps, visualizations, generative sites) built for curiosity and craft. Be concrete and candid; disagree when warranted. When a plan firms up, the user can hand this conversation to your repo-agent mode (a full Claude Code harness inside the agent01 monorepo) with the → repo button.';

const MONO = '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
const ACCENTS = {
  assist: { main: '#56b6c2', userBg: '#1a3b40', userBorder: '#24565e', userText: '#cfeef2', btnBg: '#1a3b40', btnBorder: '#2e6a73', btnText: '#7fd7e0' },
  repo: { main: '#e5c07b', userBg: '#3a301a', userBorder: '#6e5c2e', userText: '#f0e3c0', btnBg: '#3a301a', btnBorder: '#6e5c2e', btnText: '#e5c07b' },
};

const S = {
  root: {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
    background: '#0a0a0a', color: '#c0c0c0', fontFamily: MONO,
  },
  header: (a) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px',
    borderBottom: `1px solid ${a.userBorder}`, flexShrink: 0, flexWrap: 'wrap',
  }),
  title: (a) => ({ color: a.main, fontWeight: 700, fontSize: 14 }),
  sub: { color: '#606060', fontSize: 11, flex: 1, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
  hbtn: (active, a) => ({
    background: active ? a.btnBg : '#161616',
    border: `1px solid ${active ? a.btnBorder : '#2a2a2a'}`,
    borderRadius: 6, color: active ? a.btnText : '#909090',
    fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontFamily: MONO,
  }),
  panel: {
    borderBottom: '1px solid #1e1e1e', padding: '10px 12px', background: '#0f0f0f',
    fontSize: 12, flexShrink: 0, maxHeight: '40vh', overflowY: 'auto',
  },
  panelLabel: { color: '#808080', fontSize: 11, margin: '8px 0 4px' },
  panelInput: {
    width: '100%', boxSizing: 'border-box', background: '#141414',
    border: '1px solid #2a2a2a', borderRadius: 6, color: '#c8c8c8',
    fontSize: 12, padding: '8px 10px', fontFamily: MONO, outline: 'none', resize: 'vertical',
  },
  threadRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px',
    borderBottom: '1px solid #191919', cursor: 'pointer',
  },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 12px 4px', WebkitOverflowScrolling: 'touch' },
  userMsg: (a) => ({
    alignSelf: 'flex-end', maxWidth: '85%', margin: '6px 0 6px auto',
    background: a.userBg, border: `1px solid ${a.userBorder}`, borderRadius: '10px 10px 2px 10px',
    padding: '8px 11px', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: a.userText,
  }),
  aiMsg: {
    maxWidth: '92%', margin: '6px 0',
    background: '#141414', border: '1px solid #222', borderRadius: '10px 10px 10px 2px',
    padding: '9px 12px', fontSize: 13.5, lineHeight: 1.55, wordBreak: 'break-word',
  },
  thinking: {
    color: '#6f6f8a', fontSize: 12, fontStyle: 'italic', whiteSpace: 'pre-wrap',
    borderLeft: '2px solid #33334a', paddingLeft: 8, margin: '2px 0 8px',
  },
  refusal: {
    maxWidth: '92%', margin: '6px 0', padding: '8px 12px', fontSize: 12.5,
    border: '1px dashed #7a3b3b', borderRadius: 8, color: '#d99',
  },
  tool: {
    margin: '4px 0', color: '#6a7', fontSize: 11.5,
    padding: '3px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  info: { margin: '6px 0', color: '#555', fontSize: 11, textAlign: 'center' },
  err: { margin: '6px 0', color: '#e06c75', fontSize: 12, whiteSpace: 'pre-wrap' },
  composerHandle: {
    display: 'flex', justifyContent: 'center', padding: 0, background: '#0d0d0d',
    borderTop: '1px solid #1e1e1e', flexShrink: 0,
  },
  handleBtn: {
    background: 'transparent', border: 'none', color: '#555', fontSize: 11,
    padding: '3px 30px', cursor: 'pointer', fontFamily: MONO,
  },
  composerWrap: {
    display: 'flex', gap: 8, padding: '8px 12px 10px',
    flexShrink: 0, alignItems: 'flex-end', background: '#0d0d0d',
  },
  input: (tall) => ({
    flex: 1, minHeight: tall ? '34vh' : 40, maxHeight: tall ? '45vh' : 120,
    height: tall ? '34vh' : undefined, resize: 'none', boxSizing: 'border-box',
    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
    color: '#e0e0e0', fontSize: 15, padding: '10px 12px', fontFamily: MONO, outline: 'none',
  }),
  send: (running, a) => ({
    height: 40, padding: '0 16px', borderRadius: 8, fontFamily: MONO, fontSize: 13,
    cursor: 'pointer', flexShrink: 0,
    background: running ? '#402020' : a.btnBg,
    border: running ? '1px solid #6e2e2e' : `1px solid ${a.btnBorder}`,
    color: running ? '#e09090' : a.btnText,
  }),
};

let nextId = 1;

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function newThreadId() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ChatView({ session, getContainerAuth, profile = 'kimi3', onOpenTerminal, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // idle|connecting|connected|closed|denied
  const [statusDetail, setStatusDetail] = useState('');
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('assist');
  const [assistMsgs, setAssistMsgs] = useState(() => loadJson(ASSIST_STORE_KEY, []));
  const [assistRunning, setAssistRunning] = useState(false);
  const [composerTall, setComposerTall] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [threads, setThreads] = useState(null); // null = not loaded
  const [threadId, setThreadId] = useState(() => localStorage.getItem(ASSIST_TID_KEY) || newThreadId());
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(ASSIST_SYSTEM_KEY) || DEFAULT_SYSTEM);
  const [prefs, setPrefs] = useState(() => loadJson(ASSIST_PREFS_KEY, { thinking: false, web: false }));
  const assistTurnRef = useRef(null); // { turnId, authInfo } while a turn is in flight
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const connectingRef = useRef(false);
  const pendingRef = useRef(null);
  const handleFrameRef = useRef(null);
  const stickRef = useRef(true); // stay glued to bottom only while user IS at bottom
  const saveTimerRef = useRef(null);

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

  // ── Scrolling: autoscroll ONLY when the user is already at the bottom, so
  // reviewing something above never teleports (the old bug). Mode switches
  // land at the bottom of the target thread.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, assistMsgs, running, assistRunning]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) { el.scrollTop = el.scrollHeight; stickRef.current = true; }
  }, [mode]);

  // ── Persistence: localStorage mirror (instant) + debounced save into the
  // per-DID DO thread store (private, cross-device).
  useEffect(() => {
    try { localStorage.setItem(ASSIST_STORE_KEY, JSON.stringify(assistMsgs.slice(-ASSIST_MAX_MSGS))); } catch { /* full */ }
    if (!assistMsgs.length) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const authInfo = getContainerAuth();
      if (!authInfo) return;
      const firstUser = assistMsgs.find((m) => m.role === 'user');
      threadsApi.save(
        { session: session.did, ...authInfo },
        { id: threadId, title: (firstUser?.text || 'untitled').slice(0, 60), msgs: assistMsgs.slice(-ASSIST_MAX_MSGS) }
      ).catch(() => { /* offline is fine — localStorage has it */ });
    }, 2500);
    return () => clearTimeout(saveTimerRef.current);
  }, [assistMsgs, threadId, session, getContainerAuth]);
  useEffect(() => {
    try { localStorage.setItem(ASSIST_TID_KEY, threadId); } catch { /* no-op */ }
  }, [threadId]);
  useEffect(() => {
    try { localStorage.setItem(ASSIST_SYSTEM_KEY, systemPrompt); } catch { /* no-op */ }
  }, [systemPrompt]);
  useEffect(() => {
    try { localStorage.setItem(ASSIST_PREFS_KEY, JSON.stringify(prefs)); } catch { /* no-op */ }
  }, [prefs]);

  // ── Repo-mode frames ──
  const handleFrame = useCallback((msg) => {
    switch (msg.type) {
      case 'ready':
        push({ role: 'info', text: `container ready · profile ${msg.profile}` });
        setRunning(!!msg.busy);
        if (msg.busy) push({ role: 'info', text: 'agent is still working — reattached to the live run' });
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
        setMessages([]);
        for (const f of msg.frames || []) handleFrameRef.current(f);
        push({ role: 'info', text: `restored ${msg.frames?.length ?? 0} events from the container journal` });
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
          else if (!d.hasKey) push({ role: 'error', text: 'profile has NO API KEY in the container env — check worker secrets / redeploy' });
          else push({ role: 'info', text: `run: ${d.model} @ ${d.base}` });
        }
        break;
      case 'event': {
        let evt;
        try { evt = JSON.parse(msg.line); } catch {
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
      setStatusDetail('starting container (first boot after a deploy can take ~2 min)…');
      let boot = await debugBoot({ session: session.did, ...authInfo });
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

  // Container connects only when repo mode is entered.
  useEffect(() => {
    if (mode === 'repo') connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => () => socketRef.current?.disconnect(), []);

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

  // ── Assist mode — poll-based. The turn RUNS SERVER-SIDE in the DO, so
  // closing the phone loses nothing: polls simply pause while backgrounded
  // and the first poll after waking returns everything accumulated.
  const pollTurn = useCallback(async (turnId, aiId, authInfo) => {
    let toolsShown = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 750));
      let snap;
      try {
        snap = await assistPoll({ session: session.did, ...authInfo }, turnId);
      } catch (e) {
        if (e.status === 404) throw new Error('turn lost (worker restarted mid-turn) — resend your message');
        continue; // transient network blip / backgrounded fetch — just retry
      }
      setAssistMsgs((l) => l.map((m) => (m.id === aiId ? { ...m, text: snap.text || '', thinking: snap.thinking || '' } : m)));
      if (snap.tools?.length > toolsShown) {
        const fresh = snap.tools.slice(toolsShown);
        toolsShown = snap.tools.length;
        setAssistMsgs((l) => [...l, ...fresh.map((t) => ({ id: nextId++, role: 'tool', text: t }))]);
      }
      if (snap.status !== 'running') {
        if (snap.status === 'error') {
          setAssistMsgs((l) => [...l, { id: nextId++, role: 'error', text: snap.error || 'turn failed' }]);
        } else if (snap.stopReason === 'refusal') {
          setAssistMsgs((l) => [...l, { id: nextId++, role: 'refusal', text: 'kimi declined this request' }]);
        } else if (snap.stopReason === 'max_tokens') {
          setAssistMsgs((l) => [...l, { id: nextId++, role: 'info', text: 'response hit the length cap — say "continue" for the rest' }]);
        } else if (snap.stopReason === 'interrupted') {
          setAssistMsgs((l) => [...l, { id: nextId++, role: 'info', text: 'stopped' }]);
        }
        return;
      }
    }
  }, [session]);

  const submitAssist = useCallback(async () => {
    const text = draft.trim();
    if (!text || assistRunning) return;
    setDraft('');
    const base = [...assistMsgs, { id: nextId++, role: 'user', text }];
    setAssistMsgs(base);
    setAssistRunning(true);
    const aiId = nextId++;
    setAssistMsgs((l) => [...l, { id: aiId, role: 'assistant', text: '', thinking: '' }]);
    try {
      const authInfo = getContainerAuth();
      if (!authInfo) throw new Error('linking device via OAuth…');
      const turnId = await assistStart({ session: session.did, ...authInfo }, {
        messages: base.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text)
          .map((m) => ({ role: m.role, content: m.text })),
        system: systemPrompt,
        thinking: !!prefs.thinking,
        webSearch: !!prefs.web,
      });
      assistTurnRef.current = { turnId, authInfo };
      try { localStorage.setItem(ACTIVE_TURN_KEY, JSON.stringify({ turnId, threadId })); } catch { /* no-op */ }
      await pollTurn(turnId, aiId, authInfo);
    } catch (err) {
      setAssistMsgs((l) => [...l, { id: nextId++, role: 'error', text: err.message }]);
    } finally {
      setAssistRunning(false);
      assistTurnRef.current = null;
      try { localStorage.removeItem(ACTIVE_TURN_KEY); } catch { /* no-op */ }
    }
  }, [draft, assistRunning, assistMsgs, session, getContainerAuth, systemPrompt, prefs, threadId, pollTurn]);

  // Resume-on-mount: if a turn was in flight when the tab died, pick it up —
  // still running → reattach live; finished while away → graft the reply in.
  useEffect(() => {
    const marker = loadJson(ACTIVE_TURN_KEY, null);
    if (!marker?.turnId || marker.threadId !== threadId) return;
    const authInfo = getContainerAuth();
    if (!authInfo) return;
    (async () => {
      try {
        const snap = await assistPoll({ session: session.did, ...authInfo }, marker.turnId);
        const last = assistMsgs[assistMsgs.length - 1];
        let aiId;
        if (last?.role === 'assistant') {
          aiId = last.id;
          setAssistMsgs((l) => l.map((m) => (m.id === aiId ? { ...m, text: snap.text || '', thinking: snap.thinking || '' } : m)));
        } else {
          aiId = nextId++;
          setAssistMsgs((l) => [...l, { id: aiId, role: 'assistant', text: snap.text || '', thinking: snap.thinking || '' }]);
        }
        if (snap.status === 'running') {
          setAssistMsgs((l) => [...l, { id: nextId++, role: 'info', text: 'reattached to the in-flight reply' }]);
          setAssistRunning(true);
          assistTurnRef.current = { turnId: marker.turnId, authInfo };
          try { await pollTurn(marker.turnId, aiId, authInfo); } finally {
            setAssistRunning(false);
            assistTurnRef.current = null;
            try { localStorage.removeItem(ACTIVE_TURN_KEY); } catch { /* no-op */ }
          }
        } else {
          try { localStorage.removeItem(ACTIVE_TURN_KEY); } catch { /* no-op */ }
        }
      } catch {
        try { localStorage.removeItem(ACTIVE_TURN_KEY); } catch { /* no-op */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Threads (private, DO-backed) ──
  const refreshThreads = useCallback(async () => {
    const authInfo = getContainerAuth();
    if (!authInfo) return;
    try { setThreads(await threadsApi.list({ session: session.did, ...authInfo })); }
    catch (e) { setThreads([]); }
  }, [session, getContainerAuth]);

  const openThread = useCallback(async (id) => {
    const authInfo = getContainerAuth();
    if (!authInfo) return;
    const t = await threadsApi.get({ session: session.did, ...authInfo }, id);
    if (t?.msgs) {
      setAssistMsgs(t.msgs);
      setThreadId(id);
      setShowThreads(false);
    }
  }, [session, getContainerAuth]);

  const startNewThread = useCallback(() => {
    setAssistMsgs([]);
    setThreadId(newThreadId());
    setShowThreads(false);
  }, []);

  const deleteThread = useCallback(async (id) => {
    const authInfo = getContainerAuth();
    if (!authInfo) return;
    await threadsApi.remove({ session: session.did, ...authInfo }, id);
    if (id === threadId) { setAssistMsgs([]); setThreadId(newThreadId()); }
    refreshThreads();
  }, [session, getContainerAuth, threadId, refreshThreads]);

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

  // ── Repo submit ──
  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || running) return;
    if (!socketRef.current?.connected) {
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

  // ── Render ──
  const isAssist = mode === 'assist';
  const A = ACCENTS[isAssist ? 'assist' : 'repo'];
  const list = isAssist ? assistMsgs : messages;
  const busy = isAssist ? assistRunning : running;
  const dotColor = isAssist
    ? (assistRunning ? '#e5c07b' : '#98c379')
    : status === 'connected' ? '#98c379'
    : status === 'connecting' ? '#e5c07b'
    : '#e06c75';

  const doSubmit = isAssist ? submitAssist : submit;
  const doStop = isAssist
    ? () => {
        const t = assistTurnRef.current;
        if (t) assistInterrupt({ session: session.did, ...t.authInfo }, t.turnId);
      }
    : stop;

  const renderEntry = (m) => {
    if (m.role === 'user') return <div key={m.id} style={S.userMsg(A)}>{m.text}</div>;
    if (m.role === 'assistant') {
      return (
        <div key={m.id} style={S.aiMsg}>
          {m.thinking && prefs.thinking && <div style={S.thinking}>{m.thinking}</div>}
          {renderMarkdown(m.text, `m${m.id}`)}
        </div>
      );
    }
    if (m.role === 'refusal') return <div key={m.id} style={S.refusal}>⛔ {m.text}</div>;
    if (m.role === 'tool') return <div key={m.id} style={S.tool}>{m.text}</div>;
    if (m.role === 'error') return <div key={m.id} style={S.err}>{m.text}</div>;
    return <div key={m.id} style={S.info}>{m.text}</div>;
  };

  return (
    <div style={S.root}>
      <div style={S.header(A)}>
        <div style={S.dot(dotColor)} />
        <div style={S.title(A)}>kimi</div>
        <div style={S.sub}>
          {isAssist
            ? `@${session.handle} · assist`
            : `@${session.handle} · ${profile}${statusDetail ? ` · ${statusDetail}` : ''}`}
        </div>
        <button style={S.hbtn(isAssist, A)} onClick={() => setMode('assist')}>assist</button>
        <button style={S.hbtn(!isAssist, A)} onClick={() => setMode('repo')}>repo</button>
        {isAssist && assistMsgs.length > 0 && (
          <button style={S.hbtn(false, A)} onClick={handoff}>→ repo</button>
        )}
        {isAssist && (
          <button style={S.hbtn(showThreads, A)} onClick={() => { setShowThreads(!showThreads); setShowSettings(false); if (!showThreads) refreshThreads(); }}>☰</button>
        )}
        {isAssist && (
          <button style={S.hbtn(showSettings, A)} onClick={() => { setShowSettings(!showSettings); setShowThreads(false); }}>⚙</button>
        )}
        {!isAssist && (status === 'closed' || status === 'denied') && (
          <button style={S.hbtn(false, A)} onClick={connect}>reconnect</button>
        )}
        <button style={S.hbtn(false, A)} onClick={onOpenTerminal}>&gt;_</button>
        <button style={S.hbtn(false, A)} onClick={onLogout}>logout</button>
      </div>

      {isAssist && showSettings && (
        <div style={S.panel}>
          <div style={S.panelLabel}>system prompt (yours to edit — sent with every assist message)</div>
          <textarea
            style={{ ...S.panelInput, minHeight: 90 }}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ color: '#909090', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!prefs.thinking} onChange={(e) => setPrefs({ ...prefs, thinking: e.target.checked })} /> show thinking
            </label>
            <label style={{ color: '#909090', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!prefs.web} onChange={(e) => setPrefs({ ...prefs, web: e.target.checked })} /> web search (experimental)
            </label>
            <button style={S.hbtn(false, A)} onClick={() => setSystemPrompt(DEFAULT_SYSTEM)}>reset prompt</button>
          </div>
        </div>
      )}

      {isAssist && showThreads && (
        <div style={S.panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...S.panelLabel, flex: 1, margin: 0 }}>threads (private — stored in your Durable Object)</div>
            <button style={S.hbtn(false, A)} onClick={startNewThread}>+ new</button>
          </div>
          {threads === null && <div style={S.info}>loading…</div>}
          {threads?.length === 0 && <div style={S.info}>no saved threads yet — they save automatically as you chat</div>}
          {threads?.map((t) => (
            <div key={t.id} style={S.threadRow} onClick={() => openThread(t.id)}>
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.id === threadId ? A.btnText : '#b0b0b0' }}>
                {t.title}
              </div>
              <div style={{ color: '#555', fontSize: 10.5, flexShrink: 0 }}>
                {t.count} msgs · {new Date(t.updatedAt).toLocaleDateString()}
              </div>
              <button
                style={{ ...S.hbtn(false, A), padding: '2px 7px' }}
                onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} style={S.scroll} onScroll={onScroll}>
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
          {list.map(renderEntry)}
          {busy && <div style={S.info}>⋯ {isAssist ? 'thinking' : 'working'}</div>}
        </div>
      </div>

      <div style={S.composerHandle}>
        <button style={S.handleBtn} onClick={() => setComposerTall(!composerTall)}>
          {composerTall ? '▼ compact input' : '▲ big input'}
        </button>
      </div>
      <div style={S.composerWrap}>
        <textarea
          style={S.input(composerTall)}
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
          <button style={S.send(true, A)} onClick={doStop}>stop</button>
        ) : (
          <button style={S.send(false, A)} onClick={doSubmit}>send</button>
        )}
      </div>
    </div>
  );
}
