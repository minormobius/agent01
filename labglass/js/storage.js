// ── OPFS Storage Manager ──
// Manages the Origin Private File System for persistent, high-performance file storage.
// Files dropped/uploaded land here and are queryable by DuckDB-Wasm.

window.LabStorage = (() => {
  let root = null;

  async function init() {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      throw new Error('OPFS not supported in this browser');
    }
    root = await navigator.storage.getDirectory();
    // Request persistent storage so the browser won't evict our data
    if (navigator.storage.persist) {
      await navigator.storage.persist();
    }
    return root;
  }

  async function getRoot() {
    if (!root) await init();
    return root;
  }

  // Write a File/Blob to OPFS
  async function writeFile(name, data) {
    const dir = await getRoot();
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return handle;
  }

  // Read a file from OPFS as a File object
  async function readFile(name) {
    const dir = await getRoot();
    const handle = await dir.getFileHandle(name);
    return handle.getFile();
  }

  // Read file as ArrayBuffer
  async function readFileBuffer(name) {
    const file = await readFile(name);
    return file.arrayBuffer();
  }

  // Delete a file
  async function deleteFile(name) {
    const dir = await getRoot();
    await dir.removeEntry(name);
  }

  // List all files
  async function listFiles() {
    const dir = await getRoot();
    const files = [];
    for await (const [name, handle] of dir) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        files.push({
          name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        });
      }
    }
    return files.sort((a, b) => b.lastModified - a.lastModified);
  }

  // Get storage quota info
  async function getStorageInfo() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usage: 0, quota: 0 };
    }
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
    };
  }

  // Format bytes to human-readable
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Get a file's URL for use in DuckDB or other tools
  async function getFileURL(name) {
    const file = await readFile(name);
    return URL.createObjectURL(file);
  }

  // Write multiple files (for batch drag-and-drop)
  async function writeFiles(fileList) {
    const results = [];
    for (const file of fileList) {
      await writeFile(file.name, file);
      results.push(file.name);
    }
    return results;
  }

  return {
    init,
    writeFile,
    readFile,
    readFileBuffer,
    deleteFile,
    listFiles,
    getStorageInfo,
    formatBytes,
    getFileURL,
    writeFiles,
  };
})();
