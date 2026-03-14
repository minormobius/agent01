/* app.js — main orchestrator */

const App = (() => {
  let chapters = [];
  let currentBook = null;
  let chapterIndex = 0;
  let activeMode = 'scroll';

  // DOM refs
  const $ = id => document.getElementById(id);
  const searchView = $('search-view');
  const readerView = $('reader-view');
  const readingArea = $('reading-area');
  const chapterSelect = $('chapter-select');
  const progressFill = $('progress-fill');
  const readerTitle = $('reader-title');
  const searchInput = $('search-input');
  const searchBtn = $('search-btn');
  const searchResults = $('search-results');
  const bookshelfEl = $('bookshelf');
  const settingsDialog = $('settings-dialog');

  // Setting controls
  const modeScroll = $('mode-scroll');
  const modeRsvp = $('mode-rsvp');
  const modeCrawl = $('mode-crawl');
  const fontSlider = $('font-slider');
  const fontVal = $('font-val');
  const themeToggle = $('theme-toggle');
  const wpmSlider = $('wpm-slider');
  const wpmVal = $('wpm-val');
  const bionicToggle = $('bionic-toggle');
  const colorToggle = $('color-toggle');
  const crawlSpeedSlider = $('crawl-speed-slider');
  const crawlSpeedVal = $('crawl-speed-val');

  function init() {
    applySettings();
    bindEvents();
    Search.setOnBookSelected(loadBook);
    Search.renderBookshelf(bookshelfEl);

    // Check for saved position — auto-load last book
    const shelf = Storage.getBookshelf();
    if (shelf.length > 0) {
      // Show bookshelf but don't auto-load
    }
  }

  function applySettings() {
    const s = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme);
    document.documentElement.style.setProperty('--font-size', s.fontSize + 'px');
    activeMode = s.mode;

    // Sync controls
    if (fontSlider) { fontSlider.value = s.fontSize; fontVal.textContent = s.fontSize; }
    if (wpmSlider) { wpmSlider.value = s.rsvp.wpm; wpmVal.textContent = s.rsvp.wpm; }
    if (crawlSpeedSlider) { crawlSpeedSlider.value = s.crawl.speed * 10; crawlSpeedVal.textContent = s.crawl.speed.toFixed(1); }
    if (bionicToggle) bionicToggle.classList.toggle('on', s.rsvp.bionic);
    if (colorToggle) colorToggle.classList.toggle('on', s.rsvp.colorFrames);
    if (themeToggle) themeToggle.classList.toggle('on', s.theme === 'light');

    updateModeButtons();
    updateModeSettings();
  }

  function updateModeButtons() {
    [modeScroll, modeRsvp, modeCrawl].forEach(b => b && b.classList.remove('active'));
    if (activeMode === 'scroll' && modeScroll) modeScroll.classList.add('active');
    if (activeMode === 'rsvp' && modeRsvp) modeRsvp.classList.add('active');
    if (activeMode === 'crawl' && modeCrawl) modeCrawl.classList.add('active');
  }

  function updateModeSettings() {
    const rsvpSettings = document.querySelector('.rsvp-settings');
    const crawlSettings = document.querySelector('.crawl-settings');
    if (rsvpSettings) rsvpSettings.classList.toggle('visible', activeMode === 'rsvp');
    if (crawlSettings) crawlSettings.classList.toggle('visible', activeMode === 'crawl');
  }

  function bindEvents() {
    // Search
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    // Demo button
    $('demo-btn').addEventListener('click', () => {
      loadBook({ id: 2701, title: 'Moby Dick; Or, The Whale', author: 'Herman Melville' });
    });

    // Reader header
    $('btn-back').addEventListener('click', showSearch);
    $('btn-settings').addEventListener('click', () => settingsDialog.showModal());
    $('btn-prev').addEventListener('click', () => navigateChapter(-1));
    $('btn-next').addEventListener('click', () => navigateChapter(1));

    chapterSelect.addEventListener('change', () => {
      goToChapter(parseInt(chapterSelect.value));
    });

    // Settings dialog close on backdrop click
    settingsDialog.addEventListener('click', e => {
      if (e.target === settingsDialog) settingsDialog.close();
    });

    // Mode buttons
    modeScroll.addEventListener('click', () => switchMode('scroll'));
    modeRsvp.addEventListener('click', () => switchMode('rsvp'));
    modeCrawl.addEventListener('click', () => switchMode('crawl'));

    // Font size
    fontSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.fontSize = parseInt(fontSlider.value);
      fontVal.textContent = s.fontSize;
      document.documentElement.style.setProperty('--font-size', s.fontSize + 'px');
      Storage.saveSettings(s);
    });

    // Theme
    themeToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
      themeToggle.classList.toggle('on', s.theme === 'light');
      document.documentElement.setAttribute('data-theme', s.theme);
      Storage.saveSettings(s);
    });

    // WPM
    wpmSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.rsvp.wpm = parseInt(wpmSlider.value);
      wpmVal.textContent = s.rsvp.wpm;
      Storage.saveSettings(s);
    });

    // Bionic toggle
    bionicToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.rsvp.bionic = !s.rsvp.bionic;
      bionicToggle.classList.toggle('on', s.rsvp.bionic);
      Storage.saveSettings(s);
      if (activeMode === 'scroll' && chapters.length) renderCurrentChapter();
    });

    // Color frames toggle
    colorToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.rsvp.colorFrames = !s.rsvp.colorFrames;
      colorToggle.classList.toggle('on', s.rsvp.colorFrames);
      Storage.saveSettings(s);
    });

    // Crawl speed
    crawlSpeedSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.crawl.speed = parseInt(crawlSpeedSlider.value) / 10;
      crawlSpeedVal.textContent = s.crawl.speed.toFixed(1);
      Storage.saveSettings(s);
    });

    // Play button
    $('btn-play').addEventListener('click', () => {
      if (activeMode === 'rsvp') RSVPReader.toggle();
      else if (activeMode === 'crawl') CrawlReader.toggle();
      else if (activeMode === 'scroll') {
        // In scroll mode, auto-scroll
        const area = readingArea.querySelector('.scroll-reader');
        if (area) area.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);

    // Save position periodically
    setInterval(savePosition, 5000);
  }

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchResults.innerHTML = '<p class="search-loading">Searching...</p>';
    try {
      const data = await Search.search(q);
      Search.renderResults(data, searchResults);
    } catch (err) {
      searchResults.innerHTML = '<p class="search-empty">Search failed. Try again.</p>';
    }
  }

  async function loadBook(book) {
    currentBook = book;
    readerTitle.textContent = book.title;

    readingArea.innerHTML = '<p class="search-loading" style="padding:2rem">Loading...</p>';
    showReader();

    try {
      const text = await Gutenberg.fetchBook(book.id);
      chapters = Gutenberg.parseChapters(text);

      // Build chapter dropdown
      chapterSelect.innerHTML = '';
      chapters.forEach((ch, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = ch.title.substring(0, 50);
        chapterSelect.appendChild(opt);
      });

      // Restore position
      const pos = Storage.getPosition(book.id);
      chapterIndex = Math.min(pos.chapterIndex, chapters.length - 1);
      chapterSelect.value = chapterIndex;

      Storage.addToBookshelf(book);
      renderCurrentChapter(pos);
    } catch (err) {
      readingArea.innerHTML = `<p class="search-empty">Failed to load book: ${err.message}</p>`;
    }
  }

  function renderCurrentChapter(savedPos) {
    destroyReaders();
    const chapter = chapters[chapterIndex];
    if (!chapter) return;

    const s = Storage.getSettings();
    activeMode = s.mode;

    if (activeMode === 'scroll') {
      ScrollReader.render(chapter, readingArea, {
        onProgress: frac => setProgress(frac)
      });
      if (savedPos && savedPos.scrollTop) {
        requestAnimationFrame(() => ScrollReader.setScrollPosition(savedPos.scrollTop));
      }
    } else if (activeMode === 'rsvp') {
      const wordIdx = savedPos ? savedPos.wordIndex || 0 : 0;
      RSVPReader.init(chapter, readingArea, {
        wordIndex: wordIdx,
        onProgress: (wi, total) => setProgress(wi / total),
        onFinished: () => navigateChapter(1)
      });
    } else if (activeMode === 'crawl') {
      CrawlReader.render(chapter, readingArea, {
        scrollPos: savedPos ? savedPos.crawlPos || 0 : 0,
        onProgress: frac => setProgress(frac),
        onFinished: () => navigateChapter(1)
      });
    }

    setProgress(0);
  }

  function destroyReaders() {
    ScrollReader.destroy();
    RSVPReader.destroy();
    CrawlReader.destroy();
  }

  function switchMode(mode) {
    savePosition();
    const s = Storage.getSettings();
    s.mode = mode;
    activeMode = mode;
    Storage.saveSettings(s);
    updateModeButtons();
    updateModeSettings();
    renderCurrentChapter();
  }

  function goToChapter(idx) {
    if (idx < 0 || idx >= chapters.length) return;
    savePosition();
    chapterIndex = idx;
    chapterSelect.value = idx;
    renderCurrentChapter();
  }

  function navigateChapter(dir) {
    goToChapter(chapterIndex + dir);
  }

  function setProgress(frac) {
    if (progressFill) progressFill.style.width = (frac * 100) + '%';
  }

  function savePosition() {
    if (!currentBook || !chapters.length) return;
    const pos = {
      chapterIndex,
      wordIndex: RSVPReader.getWordIndex(),
      scrollTop: ScrollReader.getScrollPosition(),
      crawlPos: CrawlReader.getScrollPos()
    };
    Storage.savePosition(currentBook.id, pos);
  }

  function showReader() {
    searchView.style.display = 'none';
    readerView.classList.add('active');
  }

  function showSearch() {
    savePosition();
    destroyReaders();
    readerView.classList.remove('active');
    searchView.style.display = '';
    Search.renderBookshelf(bookshelfEl);
  }

  function handleKeydown(e) {
    if (!readerView.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (activeMode === 'rsvp') {
      if (e.code === 'Space') { e.preventDefault(); RSVPReader.toggle(); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); RSVPReader.adjustWPM(25); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); RSVPReader.adjustWPM(-25); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); RSVPReader.skipBack(15); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); RSVPReader.skipForward(15); }
    } else if (activeMode === 'crawl') {
      if (e.code === 'Space') { e.preventDefault(); CrawlReader.toggle(); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); CrawlReader.adjustSpeed(0.2); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); CrawlReader.adjustSpeed(-0.2); }
    }

    if (e.code === 'BracketLeft') navigateChapter(-1);
    if (e.code === 'BracketRight') navigateChapter(1);
    if (e.code === 'Escape') {
      if (settingsDialog.open) settingsDialog.close();
      else showSearch();
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
