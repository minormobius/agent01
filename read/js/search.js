/* search.js — Gutendex + PoetryDB search + book/poem selection */

const Search = (() => {
  const API = 'https://gutendex.com/books';
  let onBookSelected = null;

  async function search(query) {
    const resp = await fetch(`${API}?search=${encodeURIComponent(query)}`);
    if (!resp.ok) throw new Error('Search failed');
    return resp.json();
  }

  async function searchPoetry(query) {
    return Poetry.search(query);
  }

  function renderResults(data, container) {
    container.innerHTML = '';
    if (!data.results || data.results.length === 0) {
      container.innerHTML = '<p class="search-empty">No books found.</p>';
      return;
    }

    for (const book of data.results) {
      const card = document.createElement('button');
      card.className = 'book-card';
      card.setAttribute('type', 'button');

      const author = book.authors && book.authors[0]
        ? book.authors[0].name
        : 'Unknown';

      card.innerHTML = `
        <span class="book-title">${esc(book.title)}</span>
        <span class="book-author">${esc(author)}</span>
        <span class="book-dl">${(book.download_count || 0).toLocaleString()} downloads</span>
      `;

      card.addEventListener('click', () => {
        if (onBookSelected) {
          onBookSelected({
            id: book.id,
            title: book.title,
            author,
            source: 'gutenberg'
          });
        }
      });

      container.appendChild(card);
    }
  }

  function renderPoetryResults(poems, container) {
    container.innerHTML = '';
    if (!poems || poems.length === 0) {
      container.innerHTML = '<p class="search-empty">No poems found.</p>';
      return;
    }

    for (const poem of poems) {
      const card = document.createElement('button');
      card.className = 'book-card';
      card.setAttribute('type', 'button');

      card.innerHTML = `
        <span class="book-title">${esc(poem.title)}</span>
        <span class="book-author">${esc(poem.author)}</span>
        <span class="book-dl">${poem.linecount || '?'} lines</span>
      `;

      card.addEventListener('click', () => {
        if (onBookSelected) {
          onBookSelected({
            id: `poetry:${poem.author}:${poem.title}`,
            title: poem.title,
            author: poem.author,
            source: 'poetry'
          });
        }
      });

      container.appendChild(card);
    }
  }

  function renderBookshelf(container) {
    const shelf = Storage.getBookshelf();
    container.innerHTML = '';
    if (shelf.length === 0) return;

    const heading = document.createElement('h3');
    heading.textContent = 'Recently Read';
    heading.className = 'shelf-heading';
    container.appendChild(heading);

    for (const book of shelf) {
      const card = document.createElement('button');
      card.className = 'book-card book-card--shelf';
      card.setAttribute('type', 'button');
      card.innerHTML = `
        <span class="book-title">${esc(book.title)}</span>
        <span class="book-author">${esc(book.author)}</span>
      `;
      card.addEventListener('click', () => {
        if (onBookSelected) onBookSelected(book);
      });
      container.appendChild(card);
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setOnBookSelected(fn) { onBookSelected = fn; }

  return { search, searchPoetry, renderResults, renderPoetryResults, renderBookshelf, setOnBookSelected };
})();
