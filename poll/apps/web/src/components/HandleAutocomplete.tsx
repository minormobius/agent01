import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * HandleAutocomplete — Bluesky handle input with typeahead suggestions.
 *
 * React port of /js/typeahead.js (used across the static sites).
 * Uses the public `app.bsky.actor.searchActorsTypeahead` endpoint (no auth).
 * Debounces 200ms, shows up to 6 matches.
 */

interface Suggestion {
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface HandleAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

const TYPEAHEAD_URL = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead';

export function HandleAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder = 'handle.bsky.social',
  autoFocus,
  style,
}: HandleAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const q = query.replace(/^@/, '');
      if (q.length < 2) { setSuggestions([]); return; }
      const res = await fetch(`${TYPEAHEAD_URL}?q=${encodeURIComponent(q)}&limit=6`);
      if (!res.ok) return;
      const data = await res.json() as { actors: Array<{ handle: string; displayName?: string; avatar?: string }> };
      setSuggestions(
        (data.actors || []).map(a => ({
          handle: a.handle,
          displayName: a.displayName,
          avatar: a.avatar,
        }))
      );
    } catch {
      // Silently fail — autocomplete is a convenience, not critical
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
      setShowDropdown(true);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, fetchSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSuggestion = (handle: string) => {
    onChange(handle);
    setShowDropdown(false);
    setActiveIndex(-1);
    // Focus back to input after selection
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Enter') onSubmit();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          selectSuggestion(suggestions[activeIndex].handle);
        } else {
          setShowDropdown(false);
          onSubmit();
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="handle-autocomplete" style={style}>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="handle-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.handle}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'active' : ''}
              onMouseDown={() => selectSuggestion(s.handle)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.avatar
                ? <img src={s.avatar} alt="" className="handle-avatar" loading="lazy" />
                : <div className="handle-avatar-ph" />
              }
              <div className="handle-info">
                {s.displayName && <span className="handle-display-name">{s.displayName}</span>}
                <span className="handle-id">@{s.handle}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
