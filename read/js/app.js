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
  const serifToggle = $('serif-toggle');
  const wpmSlider = $('wpm-slider');
  const wpmVal = $('wpm-val');
  const bionicToggle = $('bionic-toggle');
  const colorToggle = $('color-toggle');
  const crawlSpeedSlider = $('crawl-speed-slider');
  const crawlSpeedVal = $('crawl-speed-val');
  const mincharsSlider = $('minchars-slider');
  const mincharsVal = $('minchars-val');
  const speedLabel = $('speed-label');
  const btnSlower = $('btn-slower');
  const btnFaster = $('btn-faster');

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

  function applyFontSize(size) {
    document.documentElement.style.setProperty('--font-size', size + 'px');
    // Scale RSVP and crawl fonts proportionally (base 19px)
    const scale = size / 19;
    document.documentElement.style.setProperty(
      '--rsvp-font-size',
      `clamp(${(2 * scale).toFixed(2)}rem, ${(6 * scale).toFixed(1)}vw, ${(3.5 * scale).toFixed(2)}rem)`
    );
    document.documentElement.style.setProperty(
      '--crawl-font-size',
      `clamp(${(1 * scale).toFixed(2)}rem, ${(3 * scale).toFixed(1)}vw, ${(1.4 * scale).toFixed(2)}rem)`
    );
  }

  function applySettings() {
    const s = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme);
    applyFontSize(s.fontSize);
    activeMode = s.mode;

    // Sync controls
    if (fontSlider) { fontSlider.value = s.fontSize; fontVal.textContent = s.fontSize; }
    if (wpmSlider) { wpmSlider.value = s.rsvp.wpm; wpmVal.textContent = s.rsvp.wpm; }
    if (crawlSpeedSlider) { crawlSpeedSlider.value = s.crawl.speed * 10; crawlSpeedVal.textContent = s.crawl.speed.toFixed(1); }
    if (bionicToggle) bionicToggle.classList.toggle('on', s.bionic);
    if (colorToggle) colorToggle.classList.toggle('on', s.rsvp.colorFrames);
    if (themeToggle) themeToggle.classList.toggle('on', s.theme === 'light');
    if (serifToggle) serifToggle.classList.toggle('on', s.serif !== false);
    document.documentElement.setAttribute('data-font', s.serif !== false ? 'serif' : 'sans');
    if (mincharsSlider) { mincharsSlider.value = s.rsvp.minChars; mincharsVal.textContent = s.rsvp.minChars; }

    updateModeButtons();
    updateModeSettings();
    updateSpeedLabel();
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
    const scrollCrawlSettings = document.querySelectorAll('.scroll-crawl-setting');
    if (rsvpSettings) rsvpSettings.classList.toggle('visible', activeMode === 'rsvp');
    if (crawlSettings) crawlSettings.classList.toggle('visible', activeMode === 'crawl');
    scrollCrawlSettings.forEach(el => el.classList.toggle('visible', activeMode !== 'rsvp'));
  }

  function updateSpeedLabel() {
    if (!speedLabel) return;
    if (activeMode === 'rsvp') {
      speedLabel.textContent = RSVPReader.getWPM() + ' wpm';
    } else if (activeMode === 'crawl') {
      speedLabel.textContent = CrawlReader.getSpeed().toFixed(1) + 'x';
    } else {
      speedLabel.textContent = '';
    }
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

    // Font size — live updates across all modes
    fontSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.fontSize = parseInt(fontSlider.value);
      fontVal.textContent = s.fontSize;
      applyFontSize(s.fontSize);
      Storage.saveSettings(s);
      if (activeMode === 'rsvp') RSVPReader.refit();
      if (activeMode === 'crawl') CrawlReader.remeasure();
    });

    // Theme
    themeToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
      themeToggle.classList.toggle('on', s.theme === 'light');
      document.documentElement.setAttribute('data-theme', s.theme);
      Storage.saveSettings(s);
    });

    // Serif toggle
    serifToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.serif = s.serif === false ? true : false;
      serifToggle.classList.toggle('on', s.serif);
      document.documentElement.setAttribute('data-font', s.serif ? 'serif' : 'sans');
      Storage.saveSettings(s);
      if ((activeMode === 'scroll' || activeMode === 'crawl') && chapters.length) renderCurrentChapter();
    });

    // WPM
    wpmSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.rsvp.wpm = parseInt(wpmSlider.value);
      wpmVal.textContent = s.rsvp.wpm;
      Storage.saveSettings(s);
      updateSpeedLabel();
    });

    // Bionic toggle — shared across all modes
    bionicToggle.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.bionic = !s.bionic;
      bionicToggle.classList.toggle('on', s.bionic);
      Storage.saveSettings(s);
      if ((activeMode === 'scroll' || activeMode === 'crawl') && chapters.length) renderCurrentChapter();
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
      updateSpeedLabel();
    });

    // Min chunk length
    mincharsSlider.addEventListener('input', () => {
      const s = Storage.getSettings();
      s.rsvp.minChars = parseInt(mincharsSlider.value);
      mincharsVal.textContent = s.rsvp.minChars;
      Storage.saveSettings(s);
    });

    // Inline speed +/- buttons
    btnSlower.addEventListener('click', () => {
      if (activeMode === 'rsvp') { RSVPReader.adjustWPM(-25); syncWpmSlider(); }
      else if (activeMode === 'crawl') { CrawlReader.adjustSpeed(-0.2); syncCrawlSlider(); }
      updateSpeedLabel();
    });
    btnFaster.addEventListener('click', () => {
      if (activeMode === 'rsvp') { RSVPReader.adjustWPM(25); syncWpmSlider(); }
      else if (activeMode === 'crawl') { CrawlReader.adjustSpeed(0.2); syncCrawlSlider(); }
      updateSpeedLabel();
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
      // Clear stale state so old book data doesn't persist
      chapters = [];
      chapterIndex = 0;
      chapterSelect.innerHTML = '';
      readingArea.innerHTML = `<div class="load-error">
        <p>Failed to load book.</p>
        <p class="load-error-detail">${err.message}</p>
        <button class="load-error-back" onclick="document.getElementById('btn-back').click()">Back to search</button>
      </div>`;
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
    updateSpeedLabel();
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

  function syncWpmSlider() {
    const wpm = RSVPReader.getWPM();
    if (wpmSlider) { wpmSlider.value = wpm; wpmVal.textContent = wpm; }
  }

  function syncCrawlSlider() {
    const spd = CrawlReader.getSpeed();
    if (crawlSpeedSlider) { crawlSpeedSlider.value = Math.round(spd * 10); crawlSpeedVal.textContent = spd.toFixed(1); }
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
      else if (e.code === 'ArrowUp') { e.preventDefault(); RSVPReader.adjustWPM(25); syncWpmSlider(); updateSpeedLabel(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); RSVPReader.adjustWPM(-25); syncWpmSlider(); updateSpeedLabel(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); RSVPReader.skipBack(15); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); RSVPReader.skipForward(15); }
    } else if (activeMode === 'crawl') {
      if (e.code === 'Space') { e.preventDefault(); CrawlReader.toggle(); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); CrawlReader.adjustSpeed(0.2); syncCrawlSlider(); updateSpeedLabel(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); CrawlReader.adjustSpeed(-0.2); syncCrawlSlider(); updateSpeedLabel(); }
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
