// logout — end session

export default async function logout(args, flags, ctx) {
  ctx.terminal.writeln(ctx.fmt.dim('session ended'));
  if (ctx.shell.onLogout) ctx.shell.onLogout();
}
