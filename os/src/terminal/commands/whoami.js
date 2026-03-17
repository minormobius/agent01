// whoami — show current session info

export default async function whoami(args, flags, ctx) {
  const { session, terminal, fmt } = ctx;

  terminal.writeln(`${fmt.bold(session.handle)}`);
  terminal.writeln(`${fmt.dim('DID:')} ${session.did}`);
  terminal.writeln(`${fmt.dim('PDS:')} ${session.pdsUrl}`);
}
