import React, { useEffect, useRef, useState } from 'react';
import { Shell } from './Shell.js';
import * as fmt from '../lib/fmt.js';

const BANNER_FULL = `\x1b[36m
 ██████╗ ███████╗   ███╗   ███╗██╗███╗   ██╗ ██████╗
██╔═══██╗██╔════╝   ████╗ ████║██║████╗  ██║██╔═══██╗
██║   ██║███████╗   ██╔████╔██║██║██╔██╗ ██║██║   ██║
██║   ██║╚════██║   ██║╚██╔╝██║██║██║╚██╗██║██║   ██║
╚██████╔╝███████║██╗██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝
 ╚═════╝ ╚══════╝╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝
\x1b[0m
\x1b[2mPDS Shell — your data, your terminal\x1b[0m
`;

const BANNER_COMPACT = `\x1b[36m\x1b[1m
 OS.MINO
\x1b[0m\x1b[2mPDS Shell\x1b[0m
`;

function isMobile() {
  return window.innerWidth < 600 || ('ontouchstart' in window && window.innerWidth < 768);
}

function getBanner() {
  return isMobile() ? BANNER_COMPACT : BANNER_FULL;
}

const LOGIN_PROMPT = `\x1b[33mlogin\x1b[0m \x1b[2m(handle + app password)\x1b[0m

`;

export default function Terminal({ session, onLogin, onLogout, transport, onConnectContainer, containerStatus }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const shellRef = useRef(null);
  const fitAddonRef = useRef(null);
  const inputRef = useRef('');
  const cursorPosRef = useRef(0);
  const modeRef = useRef(session ? 'shell' : 'login');
  const loginStateRef = useRef({ step: 'handle', handle: '' });
  const [mobile, setMobile] = useState(() => isMobile());
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    let term;
    const init = async () => {
      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      // Load xterm CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
      document.head.appendChild(link);

      const mobile = isMobile();
      term = new XTerm({
        theme: {
          background: '#0a0a0a',
          foreground: '#c0c0c0',
          cursor: '#c0c0c0',
          cyan: '#56b6c2',
          green: '#98c379',
          yellow: '#e5c07b',
          red: '#e06c75',
          magenta: '#c678dd',
          blue: '#61afef',
          white: '#abb2bf',
        },
        fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace',
        fontSize: mobile ? 12 : 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      fitAddon.fit();
      fitAddonRef.current = fitAddon;

      const resizeObs = new ResizeObserver(() => {
        fitAddon.fit();
        // Notify container transport of resize
        if (transport?.connected) {
          transport.resize(term.cols, term.rows);
        }
      });
      resizeObs.observe(containerRef.current);

      // Virtual keyboard: refit terminal when keyboard appears/disappears
      if (window.visualViewport) {
        const onViewportResize = () => {
          const vv = window.visualViewport;
          const kb = window.innerHeight - vv.height;
          setKbHeight(kb > 50 ? kb : 0);
          containerRef.current.style.height = `${vv.height}px`;
          fitAddon.fit();
        };
        window.visualViewport.addEventListener('resize', onViewportResize);
      }

      // Tap to focus on mobile
      const textarea = containerRef.current.querySelector('textarea.xterm-helper-textarea');
      if (mobile && textarea) {
        containerRef.current.addEventListener('touchstart', () => {
          textarea.focus();
        }, { passive: true });
      }

      setMobile(isMobile());

      termRef.current = term;

      // Banner
      term.write(getBanner());

      if (session) {
        startShell(term, session);
      } else {
        term.write(LOGIN_PROMPT);
        term.write('handle: ');
      }

      // Input handling
      term.onData(data => handleInput(data));
      term.onKey(({ domEvent }) => handleKey(domEvent));
    };

    init();

    return () => {
      if (term) term.dispose();
    };
  }, []);

  // When session changes (login), start shell
  useEffect(() => {
    if (session && termRef.current && modeRef.current === 'login') {
      startShell(termRef.current, session);
    }
  }, [session]);

  // Container mode: wire transport output → terminal
  useEffect(() => {
    if (!transport || !termRef.current) return;

    transport.onOutput = (data) => {
      termRef.current?.write(data);
    };

    transport.onExit = (exitCode) => {
      const term = termRef.current;
      if (term) {
        term.writeln(`\r\n${fmt.dim(`[container exited: ${exitCode}]`)}`);
        // Fall back to PDS shell
        modeRef.current = 'shell';
        if (shellRef.current) {
          writePrompt(term, shellRef.current);
        }
      }
    };

    transport.onStatus = (status) => {
      const term = termRef.current;
      if (!term) return;
      if (status === 'connected' && modeRef.current === 'container-connecting') {
        modeRef.current = 'container';
        term.writeln(`\r\n${fmt.green('connected')} ${fmt.dim('to container shell')}`);
        term.writeln(`${fmt.dim('bash + git + claude-code available')}`);
        term.writeln(`${fmt.dim('Type')} ${fmt.cyan('exit')} ${fmt.dim('or Ctrl+D to return to PDS shell')}\r\n`);
        // Send initial resize
        transport.resize(term.cols, term.rows);
      } else if (status === 'disconnected' && modeRef.current === 'container') {
        modeRef.current = 'shell';
        term.writeln(`\r\n${fmt.yellow('[container disconnected]')}`);
        if (shellRef.current) {
          writePrompt(term, shellRef.current);
        }
      } else if (status === 'reconnecting') {
        term.writeln(`\r\n${fmt.dim('[reconnecting...]')}`);
      } else if (status === 'failed') {
        modeRef.current = 'shell';
        term.writeln(`\r\n${fmt.red('[container connection failed]')}`);
        if (shellRef.current) {
          writePrompt(term, shellRef.current);
        }
      }
    };
  }, [transport]);

  function startShell(term, sess) {
    modeRef.current = 'shell';
    const shell = new Shell(term, sess, {
      onLogout: () => {
        shellRef.current = null;
        modeRef.current = 'login';
        loginStateRef.current = { step: 'handle', handle: '' };
        term.writeln('');
        term.write(LOGIN_PROMPT);
        term.write('handle: ');
        onLogout();
      },
      onConnectContainer,
    });
    shellRef.current = shell;
    term.writeln(`\r\n${fmt.green('authenticated')} as ${fmt.bold(sess.handle)} ${fmt.dim(`(${sess.did})`)}`);
    term.writeln(`${fmt.dim('PDS:')} ${sess.pdsUrl}`);
    term.writeln(`${fmt.dim('Type')} ${fmt.cyan('help')} ${fmt.dim('for commands')}\r\n`);
    writePrompt(term, shell);
  }

  function writePrompt(term, shell) {
    term.write(shell.getPrompt());
    inputRef.current = '';
    cursorPosRef.current = 0;
  }

  function handleInput(data) {
    const term = termRef.current;
    if (!term) return;

    // Container mode: pipe ALL input directly to remote PTY
    if (modeRef.current === 'container' && transport?.connected) {
      transport.send(data);
      return;
    }

    // PDS shell mode: local input handling
    if (data.length > 1 && !data.startsWith('\x1b')) {
      for (const ch of data) {
        handleChar(ch);
      }
      return;
    }

    handleChar(data);
  }

  function handleChar(ch) {
    const term = termRef.current;
    const shell = shellRef.current;

    // Enter
    if (ch === '\r') {
      term.writeln('');
      if (modeRef.current === 'login') {
        handleLoginInput(inputRef.current);
      } else if (shell) {
        const input = inputRef.current;
        inputRef.current = '';
        cursorPosRef.current = 0;
        shell.execute(input).then(() => {
          if (modeRef.current === 'shell' && shellRef.current) {
            writePrompt(term, shellRef.current);
          }
        });
      }
      return;
    }

    // Ctrl+C
    if (ch === '\x03') {
      if (shell?.running) {
        shell.abort();
      } else {
        term.writeln('^C');
        inputRef.current = '';
        cursorPosRef.current = 0;
        if (modeRef.current === 'shell' && shell) {
          writePrompt(term, shell);
        }
      }
      return;
    }

    // Ctrl+L — clear
    if (ch === '\x0c') {
      term.clear();
      if (modeRef.current === 'shell' && shell) {
        writePrompt(term, shell);
      }
      return;
    }

    // Backspace
    if (ch === '\x7f' || ch === '\b') {
      if (cursorPosRef.current > 0) {
        const input = inputRef.current;
        const pos = cursorPosRef.current;
        inputRef.current = input.slice(0, pos - 1) + input.slice(pos);
        cursorPosRef.current = pos - 1;
        const after = inputRef.current.slice(pos - 1);
        term.write(`\b${after} ${'\b'.repeat(after.length + 1)}`);
      }
      return;
    }

    // Tab — completion
    if (ch === '\t') {
      if (modeRef.current === 'shell' && shell && !shell.running) {
        shell.complete(inputRef.current).then(completions => {
          if (completions.length === 1) {
            const parts = inputRef.current.split(/\s+/);
            const prefix = parts.length > 1 ? parts.slice(0, -1).join(' ') + ' ' : '';
            const completed = prefix + completions[0];
            term.write('\b'.repeat(cursorPosRef.current) + ' '.repeat(inputRef.current.length) + '\b'.repeat(inputRef.current.length));
            inputRef.current = completed;
            cursorPosRef.current = completed.length;
            term.write(completed);
          } else if (completions.length > 1) {
            term.writeln('');
            term.writeln(completions.join('  '));
            writePrompt(term, shell);
            term.write(inputRef.current);
          }
        });
      }
      return;
    }

    // Printable character
    if (ch >= ' ' && ch.length === 1) {
      const pos = cursorPosRef.current;
      inputRef.current = inputRef.current.slice(0, pos) + ch + inputRef.current.slice(pos);
      cursorPosRef.current = pos + 1;

      if (modeRef.current === 'login' && loginStateRef.current.step === 'password') {
        term.write('*');
      } else {
        const after = inputRef.current.slice(pos);
        term.write(after + '\b'.repeat(after.length - 1));
      }
    }
  }

  function handleKey(ev) {
    const term = termRef.current;
    const shell = shellRef.current;

    // Container mode: arrow keys and special keys go through onData, not here
    if (modeRef.current === 'container') return;

    // Arrow up — history
    if (ev.key === 'ArrowUp' && modeRef.current === 'shell' && shell && !shell.running) {
      const prev = shell.historyUp();
      if (prev !== null) {
        term.write('\b'.repeat(cursorPosRef.current) + ' '.repeat(inputRef.current.length) + '\b'.repeat(inputRef.current.length));
        inputRef.current = prev;
        cursorPosRef.current = prev.length;
        term.write(prev);
      }
      ev.preventDefault();
    }

    // Arrow down — history
    if (ev.key === 'ArrowDown' && modeRef.current === 'shell' && shell && !shell.running) {
      const next = shell.historyDown();
      if (next !== null) {
        term.write('\b'.repeat(cursorPosRef.current) + ' '.repeat(inputRef.current.length) + '\b'.repeat(inputRef.current.length));
        inputRef.current = next;
        cursorPosRef.current = next.length;
        term.write(next);
      }
      ev.preventDefault();
    }

    // Arrow left
    if (ev.key === 'ArrowLeft' && cursorPosRef.current > 0) {
      cursorPosRef.current--;
      term.write('\x1b[D');
    }

    // Arrow right
    if (ev.key === 'ArrowRight' && cursorPosRef.current < inputRef.current.length) {
      cursorPosRef.current++;
      term.write('\x1b[C');
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) handleInput(text);
    } catch {
      // Clipboard API denied
    }
    const textarea = containerRef.current?.querySelector('textarea.xterm-helper-textarea');
    if (textarea) {
      textarea.focus({ preventScroll: true });
    }
    termRef.current?.focus();
  }

  async function handleLoginInput(input) {
    const term = termRef.current;
    const state = loginStateRef.current;

    if (state.step === 'handle') {
      state.handle = input.trim();
      if (!state.handle) {
        term.write('handle: ');
        return;
      }
      state.step = 'password';
      inputRef.current = '';
      cursorPosRef.current = 0;
      term.write('app password: ');
    } else if (state.step === 'password') {
      const password = input;
      inputRef.current = '';
      cursorPosRef.current = 0;
      term.writeln('');
      term.write(fmt.dim('authenticating...'));
      try {
        await onLogin(state.handle, password);
      } catch (err) {
        term.writeln(`\r${' '.repeat(20)}\r`);
        term.writeln(fmt.red(`auth failed: ${err.message}`));
        term.writeln('');
        state.step = 'handle';
        state.handle = '';
        term.write('handle: ');
      }
    }
  }

  // Mode indicator color
  const statusColor = containerStatus === 'connected' ? '#98c379'
    : containerStatus === 'connecting' || containerStatus === 'reconnecting' ? '#e5c07b'
    : '#808080';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px',
        }}
      />
      {/* Mode indicator — top right */}
      {session && (
        <div style={{
          position: 'fixed',
          top: 8,
          right: 12,
          display: 'flex',
          gap: 6,
          zIndex: 10,
        }}>
          {modeRef.current === 'container' || containerStatus === 'connected' ? (
            <div style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: statusColor,
              fontSize: 11,
              fontFamily: 'monospace',
            }}>
              CONTAINER
            </div>
          ) : null}
        </div>
      )}
      {/* Mobile buttons */}
      {mobile && (
        <button
          onTouchEnd={(e) => { e.preventDefault(); handlePaste(); }}
          style={{
            position: 'fixed',
            bottom: kbHeight + 12,
            right: 12,
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#808080',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            zIndex: 10,
          }}
          aria-label="Paste from clipboard"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          </svg>
        </button>
      )}
    </div>
  );
}
