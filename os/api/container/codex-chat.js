export const validSessionId = (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id);

export function codexChatArgs(profile, sessionId) {
  return ['--harness=codex', profile, 'exec', ...(validSessionId(sessionId) ? ['resume'] : []),
    '--json', '--dangerously-bypass-approvals-and-sandbox',
    ...(validSessionId(sessionId) ? [sessionId] : []), '-'];
}

// Codex exec JSONL -> the browser's existing event vocabulary. Item updates
// are snapshots, so emit only new text and do not duplicate the final item.
export function normalizeCodexEvent(evt, seen = new Map()) {
  if (!evt || typeof evt !== 'object') return null;
  if (evt.type === 'thread.started') return {
    type: 'system', subtype: 'init', session_id: evt.thread_id, model: 'codex',
  };
  if (evt.type === 'turn.completed') return { type: 'result', is_error: false, usage: evt.usage };
  if (evt.type === 'turn.failed' || evt.type === 'error') return {
    type: 'result', is_error: true, result: evt.error?.message || evt.message || 'Codex run failed',
  };
  if (!evt.type?.startsWith('item.') || !evt.item) return null;
  const item = evt.item;
  if (item.type === 'agent_message' && typeof item.text === 'string') {
    const previous = seen.get(item.id) || '';
    const text = item.text.startsWith(previous) ? item.text.slice(previous.length) : item.text;
    seen.set(item.id, item.text);
    return text ? { type: 'assistant', message: { content: [{ type: 'text', text }] } } : { type: 'codex_progress' };
  }
  if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'plan'].includes(item.type)) {
    // Tool completion can arrive without a start; still show it exactly once.
    const key = `tool:${item.id}`;
    if (seen.has(key)) return { type: 'codex_progress' };
    seen.set(key, true);
    return { type: 'assistant', message: { content: [{ type: 'tool_use',
      name: item.tool || item.type, input: item.command ? { command: item.command } : item,
    }] } };
  }
  return null;
}
