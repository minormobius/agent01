import { useState, useCallback, useRef, useEffect } from 'react';
import { resolveHandle } from '../lib/resolve.js';
import { downloadRepo, parseCar } from '../lib/repo.js';
import { initDuckDB, ingestNdjson, filterPostsNdjson, query as duckQuery } from '../lib/duckdb.js';
import { initEmbeddings, embedTexts, embedQuery } from '../lib/embeddings.js';
import { VectorStore } from '../lib/vectorstore.js';
import { detectProvider, getProviders, streamChat, buildRAGMessages } from '../lib/llm.js';
import { generateDossier } from '../lib/dossier.js';
import Dossier from './Dossier.jsx';

export default function Sleuth({ themeToggle }) {
  // Repo state
  const [handle, setHandle] = useState('');
  const [repoStatus, setRepoStatus] = useState('idle'); // idle | loading | ready | error
  const [repoError, setRepoError] = useState(null);
  const [repoProgress, setRepoProgress] = useState('');
  const [postCount, setPostCount] = useState(0);
  const [userDid, setUserDid] = useState('');

  // Embedding state
  const [embedStatus, setEmbedStatus] = useState('idle'); // idle | loading-model | embedding | ready
  const [embedProgress, setEmbedProgress] = useState('');
  const [embedCount, setEmbedCount] = useState(0);

  // View mode: search | dossier
  const [mode, setMode] = useState('search');

  // Search + chat state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');

  // Dossier state
  const [dossierData, setDossierData] = useState(null);
  const [dossierStatus, setDossierStatus] = useState('idle'); // idle | generating | done | error
  const [dossierProgress, setDossierProgress] = useState('');

  // LLM config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('sleuth_api_key') || '');
  const [provider, setProvider] = useState(() => localStorage.getItem('sleuth_provider') || '');
  const [showSettings, setShowSettings] = useState(false);

  // Refs
  const storeRef = useRef(new VectorStore());
  const chatEndRef = useRef(null);
  const abortRef = useRef(null);

  // Persist API key
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('sleuth_api_key', apiKey);
      const detected = detectProvider(apiKey);
      if (detected) {
        setProvider(detected);
        localStorage.setItem('sleuth_provider', detected);
      }
    }
  }, [apiKey]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamText]);

  // Check hash for handle
  useEffect(() => {
    const m = window.location.hash.match(/^#\/sleuth\/(.+)$/);
    if (m) {
      const h = decodeURIComponent(m[1]);
      setHandle(h);
    }
  }, []);

  // Load repo and extract all post texts
  const loadRepo = useCallback(async () => {
    if (!handle.trim()) return;
    setRepoStatus('loading');
    setRepoError(null);
    setRepoProgress('Resolving handle...');
    storeRef.current.clear();
    setEmbedStatus('idle');
    setEmbedCount(0);
    setChatHistory([]);
    setResults([]);
    setDossierData(null);
    setDossierStatus('idle');

    try {
      const { did, pdsUrl } = await resolveHandle(handle.trim());
      setUserDid(did);

      setRepoProgress('Downloading repo...');
      const carBytes = await downloadRepo(pdsUrl, did, {
        onProgress: ({ received, total }) => {
          const mb = (received / 1e6).toFixed(1);
          setRepoProgress(total
            ? `Downloading: ${mb}/${(total / 1e6).toFixed(1)} MB`
            : `Downloading: ${mb} MB`);
        },
      });

      setRepoProgress('Parsing CAR...');
      const ndjson = await parseCar(carBytes, did);

      setRepoProgress('Filtering posts...');
      const { filtered, totalLines } = filterPostsNdjson(ndjson);

      setRepoProgress('Loading into DuckDB...');
      await initDuckDB();
      await ingestNdjson(filtered, did, totalLines);

      const posts = await duckQuery(`
        SELECT
          rkey,
          did,
          json_extract_string(value, '$.text') as text,
          json_extract_string(value, '$.createdAt') as created_at
        FROM records
        WHERE collection = 'app.bsky.feed.post'
          AND json_extract_string(value, '$.text') IS NOT NULL
          AND json_extract_string(value, '$.text') != ''
        ORDER BY json_extract_string(value, '$.createdAt') DESC
      `);

      setPostCount(posts.length);

      const docs = posts.map(p => ({
        text: p.text,
        rkey: p.rkey,
        did: p.did,
        createdAt: p.created_at,
      }));
      storeRef.current.docs = docs;

      setRepoStatus('ready');
      setRepoProgress(`${posts.length.toLocaleString()} posts loaded`);

      embedPosts(docs);
    } catch (err) {
      setRepoError(err.message);
      setRepoStatus('error');
    }
  }, [handle]);

  // Embed all posts
  const embedPosts = useCallback(async (docs) => {
    setEmbedStatus('loading-model');
    setEmbedProgress('Loading embedding model...');

    try {
      await initEmbeddings((p) => {
        setEmbedProgress(p.message);
      });

      setEmbedStatus('embedding');
      const texts = docs.map(d => d.text);

      const embeddings = await embedTexts(texts, {
        onProgress: ({ done, total }) => {
          setEmbedProgress(`Embedding: ${done.toLocaleString()}/${total.toLocaleString()} posts`);
          setEmbedCount(done);
        },
      });

      storeRef.current.clear();
      storeRef.current.add(embeddings, docs);

      setEmbedStatus('ready');
      setEmbedProgress(`${embeddings.length.toLocaleString()} posts embedded`);
      setEmbedCount(embeddings.length);
    } catch (err) {
      console.error('Embedding failed:', err);
      setEmbedStatus('idle');
      setEmbedProgress(`Embedding failed: ${err.message}. Using keyword search.`);
    }
  }, []);

  // Generate dossier
  const startDossier = useCallback(async () => {
    if (embedStatus !== 'ready' || !apiKey || !provider) return;
    setDossierStatus('generating');
    setDossierProgress('Starting analysis...');
    setMode('dossier');

    try {
      const data = await generateDossier({
        docs: storeRef.current.docs,
        vectors: storeRef.current.vectors,
        handle: handle.trim(),
        streamChat,
        provider,
        apiKey,
        onProgress: ({ step, detail }) => {
          setDossierProgress(detail);
        },
      });

      setDossierData(data);
      setDossierStatus('done');
    } catch (err) {
      console.error('Dossier failed:', err);
      setDossierStatus('error');
      setDossierProgress(`Failed: ${err.message}`);
    }
  }, [embedStatus, apiKey, provider, handle]);

  // Search
  const doSearch = useCallback(async (q) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      let hits;
      if (embedStatus === 'ready') {
        const qVec = await embedQuery(searchQuery);
        hits = storeRef.current.search(qVec, 20);
      } else {
        hits = storeRef.current.keywordSearch(searchQuery, 20);
      }
      setResults(hits);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [query, embedStatus]);

  // Chat with RAG
  const doChat = useCallback(async () => {
    if (!query.trim() || !apiKey) return;
    const userQuery = query.trim();
    setQuery('');

    let hits;
    if (embedStatus === 'ready') {
      const qVec = await embedQuery(userQuery);
      hits = storeRef.current.search(qVec, 15);
    } else {
      hits = storeRef.current.keywordSearch(userQuery, 15);
    }
    setResults(hits);

    const messages = buildRAGMessages(userQuery, hits, chatHistory);
    const newHistory = [...chatHistory, { role: 'user', content: userQuery }];
    setChatHistory(newHistory);

    setStreaming(true);
    setStreamText('');
    abortRef.current = new AbortController();

    try {
      let fullText = '';
      const gen = streamChat({
        provider,
        apiKey,
        messages,
        signal: abortRef.current.signal,
      });

      for await (const chunk of gen) {
        fullText += chunk;
        setStreamText(fullText);
      }

      setChatHistory(h => [...h, { role: 'assistant', content: fullText }]);
      setStreamText('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setChatHistory(h => [...h, { role: 'assistant', content: `Error: ${err.message}` }]);
      }
      setStreamText('');
    } finally {
      setStreaming(false);
    }
  }, [query, apiKey, provider, chatHistory, embedStatus]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (apiKey && provider) {
      doChat();
    } else {
      doSearch(query);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const hasLLM = apiKey && provider;
  const canDossier = embedStatus === 'ready' && hasLLM;

  return (
    <div className="sleuth">
      <header className="sleuth-header">
        <a href="#/" className="sleuth-back" title="Gallery">&larr;</a>
        <h1>Sleuth</h1>
        <span className="sleuth-subtitle">Search & analyze your Bluesky posts</span>
        <button
          className="sleuth-settings-btn"
          onClick={() => setShowSettings(s => !s)}
          title="API Settings"
        >
          {hasLLM ? '🔑' : '⚙️'}
        </button>
        {themeToggle}
      </header>

      {showSettings && (
        <div className="sleuth-settings">
          <label>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... (OpenAI) or sk-ant-... (Anthropic)"
              spellCheck={false}
            />
          </label>
          {provider && (
            <div className="sleuth-provider-badge">
              {getProviders()[provider]?.name} detected
            </div>
          )}
          <p className="sleuth-settings-hint">
            Required for Dossier and AI chat. Your key stays in your browser.
          </p>
        </div>
      )}

      {/* Repo loading */}
      {repoStatus !== 'ready' && (
        <div className="sleuth-load">
          <form onSubmit={(e) => { e.preventDefault(); loadRepo(); }} className="sleuth-load-form">
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Enter a Bluesky handle"
              disabled={repoStatus === 'loading'}
            />
            <button type="submit" disabled={repoStatus === 'loading' || !handle.trim()}>
              {repoStatus === 'loading' ? 'Loading...' : 'Load'}
            </button>
          </form>
          {repoProgress && <div className="sleuth-progress">{repoProgress}</div>}
          {repoError && <div className="sleuth-error">{repoError}</div>}
        </div>
      )}

      {/* Main interface once repo is loaded */}
      {repoStatus === 'ready' && (
        <>
          <div className="sleuth-status-bar">
            <span className="sleuth-stat">{postCount.toLocaleString()} posts</span>
            <span className={`sleuth-stat ${embedStatus === 'ready' ? 'ready' : ''}`}>
              {embedStatus === 'ready'
                ? `${embedCount.toLocaleString()} embedded`
                : embedStatus === 'idle'
                  ? 'keyword search'
                  : embedProgress}
            </span>
            {hasLLM && <span className="sleuth-stat ready">AI on</span>}
            <button
              className="sleuth-reload"
              onClick={() => { setRepoStatus('idle'); setHandle(''); }}
            >
              Switch user
            </button>
          </div>

          {/* Mode tabs */}
          <div className="sleuth-tabs">
            <button
              className={`sleuth-tab ${mode === 'search' ? 'active' : ''}`}
              onClick={() => setMode('search')}
            >
              Search
            </button>
            <button
              className={`sleuth-tab ${mode === 'dossier' ? 'active' : ''}`}
              onClick={() => {
                setMode('dossier');
                if (dossierStatus === 'idle' && canDossier) startDossier();
              }}
              disabled={!canDossier && dossierStatus === 'idle'}
              title={!canDossier ? 'Needs embeddings + API key' : 'Generate personality dossier'}
            >
              Dossier
              {!canDossier && dossierStatus === 'idle' && (
                <span className="sleuth-tab-hint">needs API key + embeddings</span>
              )}
            </button>
          </div>

          {/* Search mode */}
          {mode === 'search' && (
            <>
              <form onSubmit={handleSubmit} className="sleuth-search">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={hasLLM
                    ? 'Ask about your posts...'
                    : 'Search your posts...'}
                  disabled={searching || streaming}
                  autoFocus
                />
                {streaming ? (
                  <button type="button" onClick={stopStreaming} className="sleuth-stop">Stop</button>
                ) : (
                  <button type="submit" disabled={!query.trim() || searching}>
                    {hasLLM ? 'Ask' : 'Search'}
                  </button>
                )}
              </form>

              {chatHistory.length > 0 && (
                <div className="sleuth-chat">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`sleuth-msg sleuth-msg-${msg.role}`}>
                      <div className="sleuth-msg-role">{msg.role === 'user' ? 'You' : 'Sleuth'}</div>
                      <div className="sleuth-msg-text">{msg.content}</div>
                    </div>
                  ))}
                  {streamText && (
                    <div className="sleuth-msg sleuth-msg-assistant">
                      <div className="sleuth-msg-role">Sleuth</div>
                      <div className="sleuth-msg-text">{streamText}<span className="sleuth-cursor">▊</span></div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {results.length > 0 && (
                <div className="sleuth-results">
                  <h3>
                    {hasLLM ? 'Context' : 'Results'}
                    <span className="sleuth-results-count">{results.length} posts</span>
                  </h3>
                  {results.map((r, i) => (
                    <div key={i} className="sleuth-result">
                      <div className="sleuth-result-score">
                        {(r.score * 100).toFixed(0)}%
                      </div>
                      <div className="sleuth-result-body">
                        <div className="sleuth-result-text">{r.doc.text}</div>
                        <div className="sleuth-result-meta">
                          {r.doc.createdAt && new Date(r.doc.createdAt).toLocaleDateString()}
                          {r.doc.rkey && (
                            <a
                              href={`https://bsky.app/profile/${r.doc.did}/post/${r.doc.rkey}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sleuth-result-link"
                            >
                              view
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {results.length === 0 && chatHistory.length === 0 && (
                <div className="sleuth-empty">
                  <div className="sleuth-empty-icon">🔍</div>
                  <p>
                    {hasLLM
                      ? 'Ask questions about your posting history'
                      : 'Search across all your posts'}
                  </p>
                  <div className="sleuth-suggestions">
                    {['What do I post about most?', 'My thoughts on AI', 'Links I\'ve shared'].map(s => (
                      <button key={s} onClick={() => { setQuery(s); }} className="sleuth-suggestion">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Dossier mode */}
          {mode === 'dossier' && (
            <>
              {dossierStatus === 'generating' && (
                <div className="sleuth-dossier-loading">
                  <div className="sleuth-dossier-spinner" />
                  <div className="sleuth-dossier-step">{dossierProgress}</div>
                  <p className="sleuth-dossier-explain">
                    Clustering topics, tracing narrative arcs, and synthesizing your profile.
                    This takes 30-60 seconds.
                  </p>
                </div>
              )}

              {dossierStatus === 'error' && (
                <div className="sleuth-dossier-error">
                  <p>{dossierProgress}</p>
                  <button onClick={startDossier}>Retry</button>
                </div>
              )}

              {dossierStatus === 'done' && dossierData && (
                <Dossier data={dossierData} />
              )}

              {dossierStatus === 'idle' && !canDossier && (
                <div className="sleuth-empty">
                  <div className="sleuth-empty-icon">📋</div>
                  <p>Dossier needs two things:</p>
                  <ol style={{ textAlign: 'left', display: 'inline-block', color: '#999' }}>
                    <li style={{ color: embedStatus === 'ready' ? '#6f6' : '#f66' }}>
                      Embeddings {embedStatus === 'ready' ? '(done)' : '(loading...)'}
                    </li>
                    <li style={{ color: hasLLM ? '#6f6' : '#f66' }}>
                      API key {hasLLM ? '(set)' : '(click ⚙️ above)'}
                    </li>
                  </ol>
                </div>
              )}

              {dossierStatus === 'idle' && canDossier && (
                <div className="sleuth-empty">
                  <div className="sleuth-empty-icon">📋</div>
                  <p>Ready to generate your personality dossier</p>
                  <button className="sleuth-dossier-start" onClick={startDossier}>
                    Generate Dossier
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
