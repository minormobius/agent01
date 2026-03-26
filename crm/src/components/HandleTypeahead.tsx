import { useState, useRef, useCallback, useEffect } from "react";

const API = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead";
const DEBOUNCE = 200;
const LIMIT = 6;

interface Actor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (actor: Actor) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function HandleTypeahead({
  value,
  onChange,
  onSelect,
  placeholder = "handle.bsky.social",
  disabled,
  id,
}: Props) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback((q: string) => {
    if (q.length < 2) {
      setActors([]);
      setOpen(false);
      return;
    }
    fetch(`${API}?q=${encodeURIComponent(q)}&limit=${LIMIT}`)
      .then((r) => r.json())
      .then((data) => {
        const results: Actor[] = data.actors || [];
        setActors(results);
        setActiveIdx(-1);
        setOpen(results.length > 0);
      })
      .catch(() => {});
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);
      clearTimeout(timerRef.current);
      const q = val.trim().replace(/^@/, "");
      timerRef.current = setTimeout(() => search(q), DEBOUNCE);
    },
    [onChange, search]
  );

  const select = useCallback(
    (actor: Actor) => {
      onChange(actor.handle);
      setOpen(false);
      setActors([]);
      inputRef.current?.focus();
      onSelect?.(actor);
    },
    [onChange, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, actors.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        e.stopPropagation();
        select(actors[activeIdx]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, actors, activeIdx, select]
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 120);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="bsky-ta-wrap">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <div className="bsky-ta-drop">
          {actors.map((a, i) => (
            <div
              key={a.did}
              className={`bsky-ta-item${i === activeIdx ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(a);
              }}
            >
              {a.avatar ? (
                <img className="bsky-ta-av" src={a.avatar} alt="" loading="lazy" />
              ) : (
                <div className="bsky-ta-av-ph" />
              )}
              <div className="bsky-ta-info">
                {a.displayName && (
                  <div className="bsky-ta-name">{a.displayName}</div>
                )}
                <div className="bsky-ta-handle">@{a.handle}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
