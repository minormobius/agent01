// ai — chat with Gemini or launch container agent
// Usage:
//   ai                     — start interactive chat (browser-side, free)
//   ai <message>           — single question (browser-side, free)
//   ai --container         — launch full agent in container
//   ai --login             — sign in with Google (re-authenticate)
//   ai --logout            — clear Google token
//   ai --model=<model>     — choose model (default: gemini-2.5-flash)
//   ai --key=<key>         — use API key instead of OAuth

import { signInWithGoogle, getGoogleToken, clearGoogleToken, isGoogleConfigured } from '../../auth/google.js';
import { GeminiChat } from '../../lib/gemini.js';

// Persist chat instance across invocations within a session
let chatInstance = null;

export default async function ai(args, flags, ctx) {
  const { terminal, fmt, shell, signal } = ctx;

  // --logout: clear Google token
  if (flags.logout) {
    clearGoogleToken();
    chatInstance = null;
    terminal.writeln(fmt.green('Google token cleared'));
    return;
  }

  // --container: launch full agent in container
  if (flags.container) {
    return launchContainer(flags, ctx);
  }

  // Get auth — either API key or Google OAuth
  const auth = await resolveAuth(flags, ctx);
  if (!auth) return; // user cancelled or error was printed

  // Create or reuse chat instance
  if (!chatInstance || flags.login || flags.key) {
    const model = flags.model || 'gemini-2.5-flash';
    chatInstance = new GeminiChat({ ...auth, model });
    chatInstance.setSystem(
      'You are a helpful assistant in a terminal environment. ' +
      'Keep responses concise and use plain text (no markdown rendering). ' +
      'The user is browsing their ATProto PDS data.'
    );
  }

  // --reset: clear conversation
  if (flags.reset) {
    chatInstance.reset();
    terminal.writeln(fmt.dim('conversation cleared'));
    return;
  }

  const message = args.join(' ').trim();

  if (!message) {
    // Interactive mode — enter chat REPL on the shell
    terminal.writeln(fmt.cyan('ai chat') + fmt.dim(` (${chatInstance.model})`));
    terminal.writeln(fmt.dim('Empty line or /exit to leave. /reset to clear history.'));
    terminal.writeln('');
    shell.enterChatMode(chatInstance);
    return;
  }

  // Single-shot message
  await streamResponse(chatInstance, message, terminal, fmt, signal);
}

// Exposed for Shell to call during chat mode
export { streamResponse };

async function resolveAuth(flags, ctx) {
  const { terminal, fmt } = ctx;

  // Explicit API key
  const apiKey = flags.key || flags.k;
  if (apiKey) return { apiKey };

  // Check for stored Google token
  const token = getGoogleToken();
  if (token) return { accessToken: token.access_token };

  // No token — need to authenticate
  if (!isGoogleConfigured()) {
    // Fall back to API key instruction
    terminal.writeln(fmt.yellow('Google OAuth not configured'));
    terminal.writeln(fmt.dim('Set VITE_GOOGLE_CLIENT_ID or use --key=<gemini-api-key>'));
    terminal.writeln('');
    terminal.writeln(fmt.dim('Get a free API key at https://aistudio.google.com/apikey'));
    return null;
  }

  terminal.writeln(fmt.dim('signing in with Google...'));

  try {
    const token = await signInWithGoogle();
    terminal.writeln(fmt.green('authenticated'));
    return { accessToken: token.access_token };
  } catch (err) {
    terminal.writeln(fmt.red(`Google sign-in failed: ${err.message}`));
    return null;
  }
}

async function streamResponse(chat, message, terminal, fmt, signal) {
  terminal.write(fmt.cyan('> '));

  try {
    for await (const chunk of chat.send(message, { signal })) {
      // Convert newlines to \r\n for xterm
      terminal.write(chunk.replace(/\n/g, '\r\n'));
    }
    terminal.writeln('\r\n');
  } catch (err) {
    if (err.name === 'AbortError') {
      terminal.writeln('\r\n' + fmt.dim('^C'));
    } else {
      terminal.writeln('\r\n' + fmt.red(`error: ${err.message}`));
    }
  }
}

async function launchContainer(flags, ctx) {
  const { terminal, fmt, shell } = ctx;

  if (!shell.onConnectContainer) {
    terminal.writeln(fmt.red('container shell not available'));
    terminal.writeln(fmt.dim('(API endpoint not configured)'));
    return;
  }

  // For container mode, we need an Anthropic key (Claude) or Gemini key
  let apiKey = flags['api-key'] || localStorage.getItem('os:anthropic-key');

  if (!apiKey) {
    terminal.writeln(fmt.yellow('API key required for container agent'));
    terminal.writeln(fmt.dim('Usage: ai --container --api-key=sk-ant-...'));
    terminal.writeln(fmt.dim('  or:  set-key sk-ant-... && ai --container'));
    return;
  }

  localStorage.setItem('os:anthropic-key', apiKey);
  terminal.writeln(fmt.dim('launching container agent...'));
  terminal.writeln(fmt.dim('(cold start may take 2-3s)'));

  shell.onConnectContainer(apiKey);
}
