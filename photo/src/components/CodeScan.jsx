import { useState, useCallback, useRef, useEffect } from 'react';
import { scanImage, findCodes } from '../lib/codescan.js';

// CodeScan — drop/snap an image, pull the text (e.g. an activation code) out of
// it. OCR runs entirely in the browser via Rust/WASM (see lib/codescan.js).

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CodeScan({ themeToggle }) {
  const [status, setStatus] = useState('idle'); // idle | loading-model | scanning | ready | error
  const [progress, setProgress] = useState(null); // { stage, received, total }
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // object URL
  const [result, setResult] = useState(null); // { text, lines }
  const [codes, setCodes] = useState([]);
  const [copied, setCopied] = useState(null); // value just copied
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const previewRef = useRef(null);

  // Revoke the previous object URL when it changes / on unmount.
  useEffect(() => {
    return () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); };
  }, []);

  const run = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That doesn’t look like an image. Try a PNG, JPEG, or WebP.');
      setStatus('error');
      return;
    }
    setError(null);
    setResult(null);
    setCodes([]);
    setProgress(null);

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);

    try {
      const out = await scanImage(file, {
        onProgress: (p) => {
          setStatus(p.stage === 'init' ? 'scanning' : 'loading-model');
          setProgress(p);
        },
      });
      setStatus('scanning');
      setProgress(null);
      setResult(out);
      setCodes(findCodes(out.text));
      setStatus('ready');
    } catch (err) {
      setError(err.message || String(err));
      setStatus('error');
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) run(file);
  }, [run]);

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) run(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [run]);

  const copy = useCallback((value) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1400);
    });
  }, []);

  const busy = status === 'loading-model' || status === 'scanning';

  let statusLine = null;
  if (status === 'loading-model') {
    const label = progress?.stage === 'recognition' ? 'recognition' : 'detection';
    const pct = progress?.total ? Math.round((progress.received / progress.total) * 100) : null;
    statusLine = `Loading ${label} model… ${pct != null ? pct + '%' : fmtBytes(progress?.received)} (one-time, then cached)`;
  } else if (status === 'scanning') {
    statusLine = 'Reading the image…';
  }

  return (
    <div className="photo">
      <header className="photo-header">
        <div className="photo-title">
          <h1>CodeScan</h1>
          <span className="photo-subtitle">read text off an image</span>
          <a href="#/" className="photo-nav-link">Gallery</a>
        </div>
        <div className="photo-header-right">{themeToggle}</div>
      </header>

      <div className="codescan">
        <div
          className={`codescan-drop${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !busy && fileRef.current?.click()}
        >
          {preview ? (
            <img className="codescan-preview" src={preview} alt="to scan" />
          ) : (
            <div className="codescan-hint">
              <div className="codescan-hint-big">Drop an image here</div>
              <div className="codescan-hint-sub">or click to choose · paste from clipboard · snap a photo</div>
            </div>
          )}
          {busy && (
            <div className="codescan-overlay">
              <div className="codescan-spinner" />
              <div className="codescan-status">{statusLine}</div>
            </div>
          )}
        </div>

        <div className="codescan-actions">
          <button onClick={() => fileRef.current?.click()} disabled={busy}>Choose image</button>
          <button onClick={() => cameraRef.current?.click()} disabled={busy}>Take photo</button>
          {result && (
            <button className="codescan-secondary" onClick={() => copy(result.text)} disabled={!result.text}>
              {copied === result.text ? 'Copied!' : 'Copy all text'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; run(f); }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; run(f); }} />
        </div>

        {error && <div className="codescan-error">{error}</div>}

        {status === 'ready' && codes.length > 0 && (
          <div className="codescan-section">
            <h2>Likely codes</h2>
            <div className="codescan-codes">
              {codes.map((code) => (
                <button key={code} className="codescan-code" onClick={() => copy(code)} title="Click to copy">
                  <span>{code}</span>
                  <span className="codescan-code-copy">{copied === code ? '✓' : '⧉'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="codescan-section">
            <h2>All text {result?.lines?.length ? `(${result.lines.length} line${result.lines.length === 1 ? '' : 's'})` : ''}</h2>
            {result?.text ? (
              <pre className="codescan-text">{result.text}</pre>
            ) : (
              <div className="codescan-empty">No text found. Try a sharper, better-lit, or more cropped shot.</div>
            )}
          </div>
        )}

        <p className="codescan-footnote">
          Runs entirely in your browser · OCR by <a href="https://github.com/robertknight/ocrs" target="_blank" rel="noreferrer">ocrs</a> (Rust→WASM) · images never leave your device
        </p>
      </div>
    </div>
  );
}
