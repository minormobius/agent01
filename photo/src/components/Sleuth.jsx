import { useState, useCallback, useRef, useEffect } from 'react';
import { resolveHandle } from '../lib/resolve.js';
import { fetchRecentPosts, TextIndex } from '../lib/posts.js';
import { detectProvider, getProviders, streamChat, buildRAGMessages } from '../lib/llm.js';
import { generateDossier } from '../lib/dossier.js';
import HandleTypeahead from './HandleTypeahead.jsx';
import Dossier from './Dossier.jsx';

export default function Sleuth({ themeToggle }) {
  const [handle, setHandle] = useState('');
  const [repoStatus, setRepoStatus] = useState('idle');
  const [repoError, setRepoError] = useState(null);
  const [repoProgress, setRepoProgress] = useState('');
  const [postCount, setPostCount] = useState(0);
  const [userDid, setUserDid] = useState('');

  const [mode, setMode] = useState('search');

  // Search + chat
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');

  // Dossier
  const [dossierData, setDossierData] = useState(null);
  const [dossierStatus, setDossierStatus] = useState('idle');
  const [dossierProgress, setDossierProgress] = useState('');

  // LLM config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('sleuth_api_key') || '');
  const [provider, setProvider] = useState(() => localStorage.getItem('sleuth_provider') || '');
  const [showSettings, setShowSettings] = useState(false);

  const indexRef = useRef(new TextIndex());
  const chatEndRef = useRef(null);
  const abortRef = useRef(null);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamText]);

  useEffect(() => {
    const m = window.location.hash.match(/^#\/sleuth\/(.+)$/);
    if (m) setHandle(decodeURIComponent(m[1]));
  }, []);

  // Fetch posts via API — no CAR, no WASM, no model
  const loadPosts = useCallback(async () => {
    if (!handle.trim()) return;
    setRepoStatus('loading');
    setRepoError(null);
    setRepoProgress('Resolving handle...');
    indexRef.current = new TextIndex();
    setChatHistory([]);
    setResults([]);
    setDossierData(null);
    setDossierStatus('idle');

    try {
      const { did, pdsUrl } = await resolveHandle(handle.trim());
      setUserDid(did);

      setRepoProgress('Fetching posts...');
      const posts = await fetchRecentPosts(pdsUrl, did, {
        maxPosts: 1000,
        onProgress: ({ fetched, calls }) => {
          setRepoProgress(`Fetching posts: ${fetched} (${calls} API calls)`);
        },
      });

      setPostCount(posts.length);

      // Build text index for instant search
      indexRef.current.build(posts);

      setRepoStatus('ready');
      setRepoProgress(`${posts.length.toLocaleString()} posts indexed`);
    } catch (err) {
      setRepoError(err.message);
      setRepoStatus('error');
    }
  }, [handle]);

  // Dossier — uses TextIndex docs + LLM (no embeddings needed)
  const startDossier = useCallback(async () => {
    if (!apiKey || !provider) return;
    setDossierStatus('generating');
    setDossierProgress('Starting analysis...');
    setMode('dossier');

    try {
      const docs = indexRef.current.docs;
      const data = await generateDossier({
        docs,
        vectors: null, // no embeddings — dossier will sample chronologically
        handle: handle.trim(),
        streamChat,
        provider,
        apiKey,
        onProgress: ({ step, detail }) => setDossierProgress(detail),
      });

      setDossierData(data);
      setDossierStatus('done');
    } catch (err) {
      console.error('Dossier failed:', err);
      setDossierStatus('error');
      setDossierProgress(`Failed: ${err.message}`);
    }
  }, [apiKey, provider, handle]);

  // Search via TF-IDF index
  const doSearch = useCallback((q) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setSearching(true);
    const hits = indexRef.current.search(searchQuery, 20);
    setResults(hits);
    setSearching(false);
  }, [query]);

  // Chat with RAG (keyword-retrieved context)
  const doChat = useCallback(async () => {
    if (!query.trim() || !apiKey) return;
    const userQuery = query.trim();
    setQuery('');

    const hits = indexRef.current.search(userQuery, 15);
    setResults(hits);

    const messages = buildRAGMessages(userQuery, hits, chatHistory);
    setChatHistory(h => [...h, { role: 'user', content: userQuery }]);

    setStreaming(true);
    setStreamText('');
    abortRef.current = new AbortController();

    try {
      let fullText = '';
      for await (const chunk of streamChat({
        provider, apiKey, messages,
        signal: abortRef.current.signal,
      })) {
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
  }, [query, apiKey, provider, chatHistory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (apiKey && provider) doChat();
    else doSearch(query);
  };

  const hasLLM = apiKey && provider;
  const canDossier = repoStatus === 'ready' && hasLLM;

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

      {repoStatus !== 'ready' && (
        <div className="sleuth-load">
          <form onSubmit={(e) => { e.preventDefault(); loadPosts(); }} className="sleuth-load-form">
            <HandleTypeahead
              value={handle}
              onChange={setHandle}
              onSubmit={loadPosts}
              disabled={repoStatus === 'loading'}
              autoFocus
            />
            <button type="submit" disabled={repoStatus === 'loading' || !handle.trim()}>
              {repoStatus === 'loading' ? 'Loading...' : 'Load'}
            </button>
          </form>
          {repoProgress && <div className="sleuth-progress">{repoProgress}</div>}
          {repoError && <div className="sleuth-error">{repoError}</div>}
        </div>
      )}

      {repoStatus === 'ready' && (
        <>
          <div className="sleuth-status-bar">
            <span className="sleuth-stat">{postCount.toLocaleString()} posts</span>
            <span className="sleuth-stat ready">indexed</span>
            {hasLLM && <span className="sleuth-stat ready">AI on</span>}
            <button
              className="sleuth-reload"
              onClick={() => { setRepoStatus('idle'); setHandle(''); }}
            >
              Switch user
            </button>
          </div>

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
              title={!canDossier ? 'Needs API key' : 'Generate personality dossier'}
            >
              Dossier
              {!canDossier && dossierStatus === 'idle' && (
                <span className="sleuth-tab-hint">needs API key</span>
              )}
            </button>
          </div>

          {mode === 'search' && (
            <>
              <form onSubmit={handleSubmit} className="sleuth-search">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={hasLLM ? 'Ask about your posts...' : 'Search your posts...'}
                  disabled={searching || streaming}
                  autoFocus
                />
                {streaming ? (
                  <button type="button" onClick={() => abortRef.current?.abort()} className="sleuth-stop">Stop</button>
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
                          {r.doc.createdAt}
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
                  <p>{hasLLM ? 'Ask questions about your posting history' : 'Search across your posts'}</p>
                  <div className="sleuth-suggestions">
                    {['What do I post about most?', 'My thoughts on AI', 'Links I\'ve shared'].map(s => (
                      <button key={s} onClick={() => setQuery(s)} className="sleuth-suggestion">{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'dossier' && (
            <>
              {dossierStatus === 'generating' && (
                <div className="sleuth-dossier-loading">
                  <div className="sleuth-dossier-spinner" />
                  <div className="sleuth-dossier-step">{dossierProgress}</div>
                  <p className="sleuth-dossier-explain">
                    Analyzing themes, tracing narrative arcs, synthesizing profile.
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
                  <p>Dossier requires an API key</p>
                  <p style={{ color: '#888', fontSize: '0.9em' }}>Click ⚙️ above to add your OpenAI or Anthropic key</p>
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
