// kimi — boot a coding-agent CELL inside your per-DID container.
//
// A cell is (harness, model): the harness is the agent loop, the model is an
// endpoint + model id. Provider keys live on the worker (AGENT_PROFILES), so no
// key is needed here; access is gated by the worker's ALLOWED_DIDS check.
//
// Usage: kimi [--model=<profile>] [--harness=<claude|opencode|codex>]
//   kimi                                   → kimi3 under Claude Code
//   kimi --model=ds4-flash                 → DeepSeek V4 Flash under Claude Code
//   kimi --model=ds4-flash --harness=opencode
//
// `agent` with no args inside the container prints the live matrix — that is
// the authority on what is actually installed and keyed, not this list.

import { checkContainerHealth } from '../../lib/container-config.js';

const HARNESSES = ['claude', 'opencode', 'codex'];
// ChatGPT-subscription cells: Responses-only, so codex is their only harness
// and the only harness that can reach them (os/api/CODEX.md D6).
const SUBSCRIPTION = ['astra', 'sol', 'luna'];

export default async function kimi(args, flags, ctx) {
  const { terminal, fmt, shell } = ctx;

  if (!shell.onConnectContainer) {
    terminal.writeln(fmt.red('container shell not available'));
    return;
  }

  const harness = typeof flags.harness === 'string' ? flags.harness : 'claude';
  if (!HARNESSES.includes(harness)) {
    terminal.writeln(fmt.red(`unknown harness '${harness}'`));
    terminal.writeln(fmt.dim(`(known: ${HARNESSES.join(', ')})`));
    return;
  }

  terminal.writeln(fmt.dim('checking backend...'));
  if (!(await checkContainerHealth())) {
    terminal.writeln(fmt.red('os-api backend not reachable'));
    terminal.writeln(fmt.dim('(deploy-os-api.yml has not run green yet — see os/RUNBOOK.md)'));
    return;
  }

  const boot = typeof flags.model === 'string' ? flags.model : harness === 'codex' ? 'astra' : 'kimi3';
  if ((harness === 'codex') !== SUBSCRIPTION.includes(boot)) {
    terminal.writeln(fmt.red(`${SUBSCRIPTION.join('/')} require --harness=codex; the open models require claude or opencode`));
    return;
  }

  terminal.writeln(fmt.dim(`launching ${boot} under ${harness} in your container...`));
  terminal.writeln(fmt.dim('(cold start may take 2-3s; exit returns to bash, exit again for PDS shell)'));

  shell.onConnectContainer({ boot, harness });
}
