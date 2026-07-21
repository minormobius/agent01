// kimi — chat with the Kimi coding agent (Claude Code harness → Moonshot's
// Anthropic-compatible endpoint) inside your per-DID container. The Moonshot
// key lives on the worker (AGENT_PROFILES), so no key is needed here; access is
// gated by the worker's ALLOWED_DIDS identity check.
// Usage: kimi [--model=<profile>]   (profile defaults to kimi3)

import { checkContainerHealth } from '../../lib/container-config.js';

export default async function kimi(args, flags, ctx) {
  const { terminal, fmt, shell } = ctx;

  if (!shell.onConnectContainer) {
    terminal.writeln(fmt.red('container shell not available'));
    return;
  }

  terminal.writeln(fmt.dim('checking backend...'));
  if (!(await checkContainerHealth())) {
    terminal.writeln(fmt.red('os-api backend not reachable'));
    terminal.writeln(fmt.dim('(deploy-os-api.yml has not run green yet — see os/RUNBOOK.md)'));
    return;
  }

  const boot = typeof flags.model === 'string' ? flags.model : 'kimi3';

  terminal.writeln(fmt.dim(`launching ${boot} agent in your container...`));
  terminal.writeln(fmt.dim('(cold start may take 2-3s; exit returns to bash, exit again for PDS shell)'));

  shell.onConnectContainer({ boot });
}
