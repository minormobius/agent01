// clear — clear the terminal

export default async function clear(args, flags, ctx) {
  ctx.terminal.clear();
}
