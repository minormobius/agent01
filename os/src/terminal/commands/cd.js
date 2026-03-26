// cd — change directory (navigate collections)
// cd                      → go to root
// cd app.bsky.feed.post   → enter collection
// cd ..                   → go up

export default async function cd(args, flags, ctx) {
  const { fs, terminal, fmt } = ctx;
  const path = args[0] || '/';

  try {
    // Validate the path exists before cd'ing
    if (path !== '/' && path !== '..' && path !== '.') {
      const { collection } = fs.resolve(path);
      if (collection) {
        // Check collection exists by trying to list one record
        const desc = await fs.describeRepo();
        const collections = desc.collections || [];
        if (!collections.includes(collection)) {
          terminal.writeln(fmt.red(`cd: no such collection: ${collection}`));
          return;
        }
      }
    }
    fs.cd(path);
  } catch (err) {
    terminal.writeln(fmt.red(`cd: ${err.message}`));
  }
}
