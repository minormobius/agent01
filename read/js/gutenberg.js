/* gutenberg.js — fetch, strip, parse Gutenberg texts */

const Gutenberg = (() => {
  function stripBoilerplate(raw) {
    const startMarkers = [
      '*** START OF THE PROJECT GUTENBERG EBOOK',
      '*** START OF THIS PROJECT GUTENBERG EBOOK',
      '***START OF THE PROJECT GUTENBERG EBOOK'
    ];
    const endMarkers = [
      '*** END OF THE PROJECT GUTENBERG EBOOK',
      '*** END OF THIS PROJECT GUTENBERG EBOOK',
      '***END OF THE PROJECT GUTENBERG EBOOK'
    ];
    let text = raw;
    for (const m of startMarkers) {
      const i = text.indexOf(m);
      if (i !== -1) { text = text.substring(text.indexOf('\n', i) + 1); break; }
    }
    for (const m of endMarkers) {
      const i = text.indexOf(m);
      if (i !== -1) { text = text.substring(0, i); break; }
    }
    return text.trim();
  }

  function parseChapters(text) {
    // Try common chapter patterns
    const patterns = [
      /^(CHAPTER|Chapter)\s+[IVXLCDM\d]+[.\s—\-:].*/m,
      /^(CHAPTER|Chapter)\s+[IVXLCDM\d]+\s*$/m,
      /^(BOOK|Book)\s+[IVXLCDM\d]+[.\s—\-:].*/m,
      /^(CANTO|Canto)\s+[IVXLCDM\d]+/m,
      /^(ACT|Act)\s+[IVXLCDM\d]+/m,
      /^(PART|Part)\s+[IVXLCDM\d]+/m,
      /^(SECTION|Section)\s+[IVXLCDM\d]+/m,
    ];

    for (const pat of patterns) {
      const regex = new RegExp(pat.source, 'gm');
      const matches = [...text.matchAll(regex)];
      if (matches.length >= 2) {
        return splitAtMatches(text, matches);
      }
    }

    // Fallback: split on 3+ blank lines
    const sections = text.split(/\n{4,}/);
    if (sections.length >= 3) {
      return sections.map((s, i) => {
        const lines = s.trim().split('\n');
        const title = lines[0].substring(0, 60) || `Section ${i + 1}`;
        return { title, text: s.trim() };
      });
    }

    return [{ title: 'Full Text', text }];
  }

  function splitAtMatches(text, matches) {
    const chapters = [];

    // Detect duplicate titles (TOC + real chapters). Keep only the last
    // occurrence of each title — the real chapter, not the TOC entry.
    const seen = new Map();
    for (let i = 0; i < matches.length; i++) {
      const title = matches[i][0].trim();
      seen.set(title, i); // last occurrence wins
    }
    const realIndices = new Set(seen.values());

    // Content before the first real chapter (preface, etymology, etc.)
    const firstRealIdx = Math.min(...realIndices);
    const preface = text.substring(0, matches[firstRealIdx].index).trim();
    if (preface.length > 500) {
      chapters.push({ title: 'Preface', text: preface });
    }

    const sorted = [...realIndices].sort((a, b) => a - b);
    for (let k = 0; k < sorted.length; k++) {
      const i = sorted[k];
      const start = matches[i].index;
      // End at the next real chapter (not the next TOC entry)
      const end = k + 1 < sorted.length ? matches[sorted[k + 1]].index : text.length;
      const chunk = text.substring(start, end).trim();
      const title = matches[i][0].trim();
      chapters.push({ title, text: chunk });
    }
    return chapters;
  }

  function tokenize(text) {
    const words = [];
    const raw = text.split(/\s+/).filter(w => w.length > 0);
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i];
      const lastChar = w[w.length - 1];
      words.push({
        word: w,
        length: w.length,
        isSentenceEnd: '.!?'.includes(lastChar),
        isClause: ',;:'.includes(lastChar),
        isParagraph: false // set below
      });
    }
    // Mark paragraph boundaries by checking original text
    const lines = text.split('\n');
    let wordIdx = 0;
    for (let li = 0; li < lines.length; li++) {
      const lineWords = lines[li].trim().split(/\s+/).filter(w => w.length > 0);
      wordIdx += lineWords.length;
      // If next line is blank, mark last word as paragraph end
      if (li + 1 < lines.length && lines[li + 1].trim() === '' && wordIdx > 0 && wordIdx <= words.length) {
        words[wordIdx - 1].isParagraph = true;
      }
    }
    return words;
  }

  async function fetchBook(id) {
    // Try CORS proxy first (Cloudflare Pages Function)
    const proxyUrl = `/gutenberg-proxy?id=${id}`;
    try {
      const resp = await fetch(proxyUrl);
      if (resp.ok) return stripBoilerplate(await resp.text());
    } catch { /* proxy not available, try fallback */ }

    // Try direct (works if same-origin or CORS allowed)
    const directUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
    try {
      const resp = await fetch(directUrl);
      if (resp.ok) return stripBoilerplate(await resp.text());
    } catch { /* blocked by CORS */ }

    // Fallback to bundled text
    if (id === 2701) {
      const resp = await fetch('texts/moby-dick.txt');
      if (resp.ok) return stripBoilerplate(await resp.text());
    }

    throw new Error(`Could not load book ${id}`);
  }

  return { fetchBook, stripBoilerplate, parseChapters, tokenize };
})();
