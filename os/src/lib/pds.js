// PDS filesystem abstraction
// Maps unix paths to ATProto repo structure:
//   /                          → repo root
//   /app.bsky.feed.post/       → collection
//   /app.bsky.feed.post/3k...  → record (by rkey)

export class PDSFilesystem {
  constructor(xrpc, did) {
    this.xrpc = xrpc;
    this.did = did;
    this.cwd = '/';
    this._collectionsCache = null;
    this._collectionsCacheTime = 0;
  }

  // Parse a path into { collection, rkey }
  resolve(path) {
    const abs = this._toAbsolute(path);
    const parts = abs.split('/').filter(Boolean);

    if (parts.length === 0) return { collection: null, rkey: null };
    if (parts.length === 1) return { collection: parts[0], rkey: null };
    return { collection: parts[0], rkey: parts.slice(1).join('/') };
  }

  cd(path) {
    const abs = this._toAbsolute(path);
    const parts = abs.split('/').filter(Boolean);
    if (parts.length > 1) throw new Error('Cannot cd into a record');
    this.cwd = parts.length === 0 ? '/' : `/${parts[0]}`;
  }

  pwd() {
    return this.cwd;
  }

  // List collections at root, or records in a collection
  async *ls(path, { limit } = {}) {
    const { collection, rkey } = this.resolve(path || '.');
    if (rkey) {
      // Single record — just yield it
      const record = await this.xrpc.call('com.atproto.repo.getRecord', {
        repo: this.did, collection, rkey
      });
      yield { type: 'record', rkey, collection, value: record.value, uri: record.uri };
      return;
    }

    if (!collection) {
      // Root — list collections via describeRepo
      const desc = await this.xrpc.call('com.atproto.repo.describeRepo', { repo: this.did });
      const collections = desc.collections || [];
      for (const c of collections) {
        yield { type: 'collection', name: c };
      }
      return;
    }

    // List records in collection — paginated
    let count = 0;
    for await (const record of this.xrpc.paginate('com.atproto.repo.listRecords', {
      repo: this.did, collection
    })) {
      const rk = record.uri.split('/').pop();
      yield { type: 'record', rkey: rk, collection, value: record.value, uri: record.uri };
      count++;
      if (limit && count >= limit) return;
    }
  }

  async cat(path) {
    const { collection, rkey } = this.resolve(path);
    if (!collection || !rkey) throw new Error('cat: must specify a record path');
    const result = await this.xrpc.call('com.atproto.repo.getRecord', {
      repo: this.did, collection, rkey
    });
    return result;
  }

  async write(path, value) {
    const { collection, rkey } = this.resolve(path);
    if (!collection) throw new Error('write: must specify a collection');
    if (rkey) {
      // Put (update existing)
      return this.xrpc.call('com.atproto.repo.putRecord', {}, {
        method: 'POST',
        body: { repo: this.did, collection, rkey, record: value }
      });
    } else {
      // Create new
      return this.xrpc.call('com.atproto.repo.createRecord', {}, {
        method: 'POST',
        body: { repo: this.did, collection, record: value }
      });
    }
  }

  async rm(path) {
    const { collection, rkey } = this.resolve(path);
    if (!collection || !rkey) throw new Error('rm: must specify a record path');
    return this.xrpc.call('com.atproto.repo.deleteRecord', {}, {
      method: 'POST',
      body: { repo: this.did, collection, rkey }
    });
  }

  async uploadBlob(data, mimeType) {
    return this.xrpc.call('com.atproto.repo.uploadBlob', {}, {
      method: 'POST',
      body: data instanceof Uint8Array ? data : new Uint8Array(data)
    });
  }

  async describeRepo() {
    return this.xrpc.call('com.atproto.repo.describeRepo', { repo: this.did });
  }

  _toAbsolute(path) {
    if (!path || path === '.') return this.cwd;
    if (path === '..') {
      const parts = this.cwd.split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/');
    }
    if (path === '/') return '/';
    if (path.startsWith('/')) return path;
    // Relative to cwd
    const base = this.cwd === '/' ? '' : this.cwd;
    return `${base}/${path}`;
  }
}
