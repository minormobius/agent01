/* reader-scroll.js — traditional scrolling text reader */

const ScrollReader = (() => {
  let container = null;
  let currentChapter = null;

  let onProgress = null;

  function render(chapter, el, opts = {}) {
    container = el;
    currentChapter = chapter;
    onProgress = opts.onProgress || null;
    const settings = Storage.getSettings();

    el.innerHTML = '';
    el.className = 'scroll-reader';

    const title = document.createElement('h2');
    title.className = 'chapter-title';
    title.textContent = chapter.title;
    el.appendChild(title);

    const paragraphs = chapter.text.split(/\n\s*\n/);
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      // Skip the chapter heading if it's the first paragraph and matches title
      if (el.children.length === 1 && trimmed === chapter.title) continue;

      const pEl = document.createElement('p');
      if (settings.rsvp.bionic) {
        pEl.innerHTML = bionicFormat(trimmed);
      } else {
        pEl.textContent = trimmed;
      }
      el.appendChild(pEl);
    }

    // Track scroll progress
    el.addEventListener('scroll', () => {
      if (!onProgress) return;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      if (scrollHeight > 0) onProgress(scrollTop / scrollHeight);
    });
  }

  function bionicFormat(text) {
    return text.replace(/\S+/g, word => {
      const mid = Math.ceil(word.length * 0.5);
      return `<b>${word.substring(0, mid)}</b>${word.substring(mid)}`;
    });
  }

  function getScrollPosition() {
    return container ? container.scrollTop : 0;
  }

  function setScrollPosition(top) {
    if (container) container.scrollTop = top;
  }

  function destroy() {
    if (container) container.innerHTML = '';
    container = null;
  }

  return { render, getScrollPosition, setScrollPosition, destroy };
})();
