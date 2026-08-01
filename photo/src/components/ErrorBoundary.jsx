import { Component } from 'react';

// ErrorBoundary.jsx — one route falling over shouldn't take the surface with it.
//
// This app runs a WASM CAR parser, a WASM OCR engine and DuckDB-Wasm loaded from
// a CDN. Any of them can throw on a malformed repo, an unsupported browser, or a
// bad network day, and without a boundary that throw unmounts the whole tree and
// leaves a white page with no way back — not even to the other tools.
//
// A boundary per route means a failure in the explorer is a message inside the
// explorer, and the landing page and every other tool still work.

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The console is the only reporting channel here — there's no backend, and
    // shipping errors somewhere would mean shipping the user's data with them.
    console.error(`[ATPhoto] ${this.props.name || 'route'} crashed:`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="route-error">
        <h2>{this.props.name || 'This tool'} hit an error.</h2>
        <p className="route-error-msg">{String(this.state.error?.message || this.state.error)}</p>
        <p className="route-error-hint">
          Nothing was uploaded and nothing was lost — this all runs locally. Reloading
          usually clears it; if the repo is very large, a desktop browser has more
          memory to work with.
        </p>
        <div className="route-error-actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="route-error-home" href="#/">Back to all tools</a>
        </div>
      </div>
    );
  }
}
