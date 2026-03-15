// pwd — print working directory

export default async function pwd(args, flags, ctx) {
  ctx.terminal.writeln(ctx.fs.pwd());
}
