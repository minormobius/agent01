// WebSocket transport — connects xterm.js to a remote PTY container
// Handles connection, reconnection, and message framing

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]; // exponential backoff

export class WSTransport {
  constructor({ url, onOutput, onExit, onStatus }) {
    this.baseUrl = url;
    this.onOutput = onOutput;
    this.onExit = onExit;
    this.onStatus = onStatus;
    this.ws = null;
    this.reconnectAttempt = 0;
    this.intentionalClose = false;
    this.pingInterval = null;
  }

  connect({ cols, rows, session, apiKey }) {
    this.intentionalClose = false;
    this.session = session;
    this.apiKey = apiKey;
    this.cols = cols;
    this.rows = rows;

    const params = new URLSearchParams({
      session,
      cols: String(cols),
      rows: String(rows),
    });
    if (apiKey) params.set('apiKey', apiKey);

    const wsUrl = `${this.baseUrl}/ws?${params}`;
    this.onStatus?.('connecting');

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.onStatus?.('connected');
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'output':
          this.onOutput?.(msg.data);
          break;
        case 'exit':
          this.onExit?.(msg.exitCode, msg.signal);
          break;
        case 'pong':
          // heartbeat response
          break;
      }
    };

    this.ws.onclose = () => {
      this._stopPing();
      if (!this.intentionalClose) {
        this.onStatus?.('disconnected');
        this._tryReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this._stopPing();
    this.ws?.close();
    this.ws = null;
    this.onStatus?.('disconnected');
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  _tryReconnect() {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      this.onStatus?.('failed');
      return;
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    this.reconnectAttempt++;
    this.onStatus?.('reconnecting');

    setTimeout(() => {
      if (!this.intentionalClose) {
        this.connect({
          cols: this.cols,
          rows: this.rows,
          session: this.session,
          apiKey: this.apiKey,
        });
      }
    }, delay);
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25_000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
