// Gemini API client — streaming chat via REST
// Supports both OAuth (access_token) and API key auth

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export class GeminiChat {
  constructor({ accessToken, apiKey, model } = {}) {
    this.accessToken = accessToken;
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    this.history = [];
  }

  // Send a message and stream the response, yielding text chunks
  async *send(text, { signal } = {}) {
    this.history.push({ role: 'user', parts: [{ text }] });

    const url = this._url('streamGenerateContent') + '&alt=sse';
    const body = {
      contents: this.history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API ${res.status}: ${err}`);
    }

    let fullResponse = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) {
            fullResponse += chunk;
            yield chunk;
          }
        } catch {
          // skip malformed SSE frames
        }
      }
    }

    if (fullResponse) {
      this.history.push({ role: 'model', parts: [{ text: fullResponse }] });
    }
  }

  // Clear conversation history
  reset() {
    this.history = [];
  }

  // Set system instruction
  setSystem(text) {
    // Gemini uses systemInstruction at the top level, not in history
    this.systemInstruction = text;
  }

  _url(method) {
    const base = `${BASE_URL}/models/${this.model}:${method}`;
    if (this.apiKey) return `${base}?key=${this.apiKey}`;
    return `${base}?`;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    return h;
  }
}
