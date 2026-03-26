// curl — raw XRPC call passthrough
// curl com.atproto.repo.describeRepo repo=did:plc:...
// curl -X POST com.atproto.repo.createRecord '{"repo":"...","collection":"...","record":{...}}'
// curl com.atproto.sync.getRepoStatus did=did:plc:...

export default async function curl(args, flags, ctx) {
  const { xrpc, terminal, fmt } = ctx;

  const method = flags.X || flags.method || 'GET';
  let nsid = null;
  const params = {};
  let body = null;

  for (const arg of args) {
    if (!nsid && arg.includes('.')) {
      nsid = arg;
    } else if (arg.includes('=')) {
      const [k, ...v] = arg.split('=');
      params[k] = v.join('=');
    } else if (arg.startsWith('{') || arg.startsWith('[')) {
      try { body = JSON.parse(arg); } catch {
        terminal.writeln(fmt.red('curl: invalid JSON body'));
        return;
      }
    }
  }

  if (!nsid) {
    terminal.writeln(fmt.red('curl: missing XRPC method'));
    terminal.writeln(fmt.dim('usage: curl com.atproto.repo.describeRepo repo=did:plc:...'));
    return;
  }

  try {
    const result = await xrpc.call(nsid, method === 'GET' ? params : {}, {
      method,
      body: method !== 'GET' ? (body || params) : null
    });
    terminal.writeln(fmt.colorizeJSON(result));
  } catch (err) {
    terminal.writeln(fmt.red(`${err.message}`));
    if (err.body) terminal.writeln(fmt.colorizeJSON(err.body));
  }
}
