// BYOK LLM client — supports OpenAI and Anthropic APIs directly from browser
// User provides their own API key, requests go direct to provider

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano'],
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
  },
};

export function getProviders() {
  return PROVIDERS;
}

export function detectProvider(apiKey) {
  if (!apiKey) return null;
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  if (apiKey.startsWith('sk-')) return 'openai';
  return null;
}

// Stream a chat completion. Yields text chunks.
export async function* streamChat({ provider, apiKey, model, messages, signal }) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  if (provider === 'openai') {
    yield* streamOpenAI({ baseUrl: config.baseUrl, apiKey, model: model || config.defaultModel, messages, signal });
  } else if (provider === 'anthropic') {
    yield* streamAnthropic({ baseUrl: config.baseUrl, apiKey, model: model || config.defaultModel, messages, signal });
  }
}

async function* streamOpenAI({ baseUrl, apiKey, model, messages, signal }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 2048,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip malformed */ }
    }
  }
}

async function* streamAnthropic({ baseUrl, apiKey, model, messages, signal }) {
  // Convert from OpenAI format: extract system message
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: system || undefined,
      messages: chatMessages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.type === 'content_block_delta' && json.delta?.text) {
          yield json.delta.text;
        }
      } catch { /* skip */ }
    }
  }
}

// Build a RAG system prompt with context from vector search results
export function buildRAGMessages(query, results, chatHistory = []) {
  const contextPosts = results.map((r, i) => {
    const date = r.doc.createdAt ? new Date(r.doc.createdAt).toLocaleDateString() : '';
    return `[${i + 1}] (${date}, score: ${r.score.toFixed(3)})\n${r.doc.text}`;
  }).join('\n\n');

  const system = `You are Sleuth, an AI assistant that helps users explore and understand their Bluesky posting history. You have access to the user's posts loaded from their ATProto repository.

When answering questions, reference specific posts from the context provided. Be concise and direct. If the context doesn't contain relevant information, say so.

The user's posts are searched semantically — the most relevant posts to their query are provided below.

## Retrieved Posts
${contextPosts}`;

  const messages = [
    { role: 'system', content: system },
    ...chatHistory,
    { role: 'user', content: query },
  ];

  return messages;
}
