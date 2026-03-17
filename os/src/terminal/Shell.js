// Shell — command parser, history, dispatch
// Parses input, routes to command handlers, manages state

import { XRPCClient } from '../lib/xrpc.js';
import { PDSFilesystem } from '../lib/pds.js';
import * as fmt from '../lib/fmt.js';

// Command registry — lazy loaded
const COMMANDS = {
  ls: () => import('./commands/ls.js'),
  cd: () => import('./commands/cd.js'),
  cat: () => import('./commands/cat.js'),
  echo: () => import('./commands/echo.js'),
  edit: () => import('./commands/edit.js'),
  rm: () => import('./commands/rm.js'),
  find: () => import('./commands/find.js'),
  du: () => import('./commands/du.js'),
  whoami: () => import('./commands/whoami.js'),
  blob: () => import('./commands/blob.js'),
  curl: () => import('./commands/curl.js'),
  history: () => import('./commands/history.js'),
  help: () => import('./commands/help.js'),
  pwd: () => import('./commands/pwd.js'),
  clear: () => import('./commands/clear.js'),
  logout: () => import('./commands/logout.js'),
  sync: () => import('./commands/sync.js'),
  sql: () => import('./commands/sql.js'),
  index: () => import('./commands/index.js'),
  container: () => import('./commands/container.js'),
  ai: () => import('./commands/ai.js'),
  'set-key': () => import('./commands/setkey.js'),
};

export class Shell {
  constructor(terminal, session, { onLogout, onConnectContainer } = {}) {
    this.terminal = terminal;
    this.session = session;
    this.xrpc = new XRPCClient(session);
    this.fs = new PDSFilesystem(this.xrpc, session.did);
    this.onLogout = onLogout;
    this.onConnectContainer = onConnectContainer;
    this.commandHistory = [];
    this.historyIndex = -1;
    this.running = false;
    this.abortController = null;
    this._chatMode = null; // active GeminiChat instance when in chat REPL
  }

  getPrompt() {
    if (this._chatMode) {
      return `${fmt.magenta('ai')}${fmt.dim('>')} `;
    }
    const handle = this.session.handle;
    const cwd = this.fs.pwd();
    return `${fmt.green(handle)}:${fmt.blue(cwd)}$ `;
  }

  enterChatMode(chatInstance) {
    this._chatMode = chatInstance;
  }

  exitChatMode() {
    this._chatMode = null;
  }

  async execute(input) {
    const trimmed = input.trim();

    // Chat mode — route input to Gemini instead of command parser
    if (this._chatMode) {
      // Empty line or /exit leaves chat
      if (!trimmed || trimmed === '/exit' || trimmed === '/quit') {
        this.exitChatMode();
        this.terminal.writeln(fmt.dim('(exited chat)'));
        return;
      }
      // /reset clears conversation
      if (trimmed === '/reset') {
        this._chatMode.reset();
        this.terminal.writeln(fmt.dim('conversation cleared'));
        return;
      }
      // Store in history so up-arrow works
      this.commandHistory.push(trimmed);
      this.historyIndex = this.commandHistory.length;

      this.running = true;
      this.abortController = new AbortController();
      try {
        const { streamResponse } = await import('./commands/ai.js');
        await streamResponse(this._chatMode, trimmed, this.terminal, fmt, this.abortController.signal);
      } catch (err) {
        if (err.name === 'AbortError') {
          this.terminal.writeln(fmt.dim('^C'));
        } else {
          this.terminal.writeln(fmt.red(`error: ${err.message}`));
        }
      } finally {
        this.running = false;
        this.abortController = null;
      }
      return;
    }

    if (!trimmed) return;

    // Store in history
    this.commandHistory.push(trimmed);
    this.historyIndex = this.commandHistory.length;

    // Parse command and args
    const { cmd, args, flags } = this._parse(trimmed);

    // Check for pipe to head/tail/grep (built-in pipe support)
    const pipeIdx = trimmed.indexOf('|');
    let pipeFilter = null;
    if (pipeIdx > -1) {
      pipeFilter = trimmed.slice(pipeIdx + 1).trim();
    }

    if (!COMMANDS[cmd]) {
      this.terminal.writeln(fmt.red(`pds: command not found: ${cmd}`));
      return;
    }

    this.running = true;
    this.abortController = new AbortController();

    try {
      const mod = await COMMANDS[cmd]();
      const ctx = {
        shell: this,
        fs: this.fs,
        xrpc: this.xrpc,
        session: this.session,
        terminal: this.terminal,
        signal: this.abortController.signal,
        fmt,
        pipeFilter,
      };
      await mod.default(args, flags, ctx);
    } catch (err) {
      if (err.name === 'AbortError') {
        this.terminal.writeln(fmt.dim('^C'));
      } else {
        this.terminal.writeln(fmt.red(`error: ${err.message}`));
      }
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  abort() {
    if (this.abortController) this.abortController.abort();
  }

  historyUp() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.commandHistory[this.historyIndex];
    }
    return null;
  }

  historyDown() {
    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex++;
      return this.commandHistory[this.historyIndex];
    }
    this.historyIndex = this.commandHistory.length;
    return '';
  }

  // Tab completion — returns matching commands or paths
  async complete(partial) {
    const parts = partial.split(/\s+/);
    if (parts.length <= 1) {
      // Complete command name
      const prefix = parts[0] || '';
      return Object.keys(COMMANDS).filter(c => c.startsWith(prefix));
    }
    // Complete path — try listing current context
    const lastPart = parts[parts.length - 1];
    const { collection } = this.fs.resolve(lastPart || '.');
    const results = [];
    try {
      for await (const entry of this.fs.ls(collection ? undefined : '/')) {
        const name = entry.type === 'collection' ? entry.name + '/' : entry.rkey;
        if (!lastPart || name.startsWith(lastPart)) {
          results.push(name);
        }
        if (results.length >= 20) break;
      }
    } catch { /* ignore completion errors */ }
    return results;
  }

  _parse(input) {
    // Strip pipe portion for command parsing
    const pipeIdx = input.indexOf('|');
    const cmdPart = pipeIdx > -1 ? input.slice(0, pipeIdx).trim() : input;

    const tokens = this._tokenize(cmdPart);
    const cmd = tokens[0];
    const args = [];
    const flags = {};

    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith('--')) {
        const eq = t.indexOf('=');
        if (eq > -1) {
          flags[t.slice(2, eq)] = t.slice(eq + 1);
        } else {
          flags[t.slice(2)] = true;
        }
      } else if (t.startsWith('-') && t.length > 1) {
        for (const c of t.slice(1)) flags[c] = true;
      } else {
        args.push(t);
      }
    }
    return { cmd, args, flags };
  }

  _tokenize(input) {
    const tokens = [];
    let current = '';
    let inQuote = null;

    for (const ch of input) {
      if (inQuote) {
        if (ch === inQuote) { inQuote = null; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current) { tokens.push(current); current = ''; }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }
}
