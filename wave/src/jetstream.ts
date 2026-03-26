/**
 * Jetstream WebSocket client — real-time ATProto firehose from the browser.
 *
 * Connects to Bluesky's public Jetstream endpoint. Filters by DIDs and collections.
 * Each browser tab opens its own connection — no backend needed.
 */

const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";

export interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: "commit" | "identity" | "account";
  commit?: {
    rev: string;
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    record?: Record<string, unknown>;
    cid?: string;
  };
}

export type JetstreamHandler = (event: JetstreamEvent) => void;

export interface JetstreamOptions {
  wantedDids: string[];
  wantedCollections: string[];
  onEvent: JetstreamHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class JetstreamClient {
  private ws: WebSocket | null = null;
  private opts: JetstreamOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private closed = false;

  constructor(opts: JetstreamOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closed = false;
    const params = new URLSearchParams();
    for (const did of this.opts.wantedDids) {
      params.append("wantedDids", did);
    }
    for (const col of this.opts.wantedCollections) {
      params.append("wantedCollections", col);
    }

    const url = `${JETSTREAM_URL}?${params}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.opts.onConnect?.();
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as JetstreamEvent;
        this.opts.onEvent(event);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.opts.onDisconnect?.();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /** Update the DID filter (reconnects with new params) */
  updateDids(dids: string[]): void {
    this.opts.wantedDids = dids;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.connect();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}
