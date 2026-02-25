// ── OPFS Write Worker ──
// Safari doesn't support FileSystemFileHandle.createWritable().
// This worker uses createSyncAccessHandle() instead, which Safari supports
// but only in a dedicated Worker context.
//
// Messages:
//   { cmd: 'write', name: string, data: ArrayBuffer }
//   → { ok: true } | { ok: false, error: string }

self.onmessage = async (e) => {
  const { cmd, name, data } = e.data;

  if (cmd !== 'write') {
    self.postMessage({ ok: false, error: `Unknown command: ${cmd}` });
    return;
  }

  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name, { create: true });
    const access = await handle.createSyncAccessHandle();
    try {
      access.truncate(0);
      access.write(data, { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
    self.postMessage({ ok: true });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
