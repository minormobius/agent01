/* storage.js — localStorage wrapper for settings, positions, bookshelf */

const Storage = (() => {
  const PREFIX = 'read:';

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch { /* quota exceeded, ignore */ }
  }

  const DEFAULT_SETTINGS = {
    mode: 'scroll',
    fontSize: 19,
    theme: 'dark',
    rsvp: { wpm: 300, bionic: false, colorFrames: false, minChars: 0 },
    crawl: { speed: 1.0 }
  };

  return {
    getSettings() {
      return { ...DEFAULT_SETTINGS, ...get('settings', {}), rsvp: { ...DEFAULT_SETTINGS.rsvp, ...get('settings', {}).rsvp }, crawl: { ...DEFAULT_SETTINGS.crawl, ...get('settings', {}).crawl } };
    },
    saveSettings(s) { set('settings', s); },

    getPosition(bookId) {
      return get(`pos:${bookId}`, { chapterIndex: 0, wordIndex: 0, scrollTop: 0 });
    },
    savePosition(bookId, pos) {
      set(`pos:${bookId}`, { ...pos, timestamp: Date.now() });
    },

    getBookshelf() { return get('bookshelf', []); },
    addToBookshelf(book) {
      const shelf = get('bookshelf', []).filter(b => b.id !== book.id);
      shelf.unshift({ id: book.id, title: book.title, author: book.author, lastRead: Date.now() });
      if (shelf.length > 20) shelf.length = 20;
      set('bookshelf', shelf);
    }
  };
})();
