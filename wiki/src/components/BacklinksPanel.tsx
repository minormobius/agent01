import type { NoteStub } from '../lib/types';

interface Props {
  backlinks: NoteStub[];
  onNavigate: (rkey: string) => void;
}

export function BacklinksPanel({ backlinks, onNavigate }: Props) {
  if (backlinks.length === 0) {
    return (
      <div className="wiki-backlinks">
        <h3>Backlinks</h3>
        <p className="wiki-backlinks-empty">No notes link here yet.</p>
      </div>
    );
  }

  return (
    <div className="wiki-backlinks">
      <h3>Backlinks ({backlinks.length})</h3>
      <ul>
        {backlinks.map(b => (
          <li key={b.rkey}>
            <button className="wiki-backlink-item" onClick={() => onNavigate(b.rkey)}>
              {b.title || 'Untitled'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
