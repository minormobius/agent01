import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import type { Note } from '../lib/types';
import { parseWikiLinks } from '../lib/notes';

interface Props {
  note: Note;
  titleIndex: Map<string, string>;
  onSave: (rkey: string, title: string, content: string, tags: string[]) => Promise<void>;
  onDelete: (rkey: string) => Promise<void>;
  onNavigate: (title: string) => void;
}

export function Editor({ note, titleIndex, onSave, onDelete, onNavigate }: Props) {
  const [title, setTitle] = useState(note.record.title);
  const [content, setContent] = useState(note.record.content);
  const [tags, setTags] = useState(note.record.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Reset when switching notes
  useEffect(() => {
    setTitle(note.record.title);
    setContent(note.record.content);
    setTags(note.record.tags.join(', '));
    setDirty(false);
  }, [note.rkey]);

  const parseTags = (raw: string): string[] =>
    raw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);

  const doSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    try {
      await onSave(note.rkey, title, content, parseTags(tags));
      setDirty(false);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [note.rkey, title, content, tags, onSave]);

  // Auto-save 2s after last edit
  const scheduleAutoSave = useCallback(() => {
    setDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 2000);
  }, [doSave]);

  // Save on unmount / note switch if dirty
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Ctrl+S to save immediately
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSave]);

  // Render markdown preview with wikilinks
  const renderedHtml = useMemo(() => {
    // Replace [[wikilinks]] with clickable spans before markdown parsing
    const wikiLinks = parseWikiLinks(content, titleIndex);
    let processed = content;
    // Process in reverse to preserve offsets
    for (let i = wikiLinks.length - 1; i >= 0; i--) {
      const link = wikiLinks[i];
      const exists = link.rkey !== null;
      const cls = exists ? 'wiki-link' : 'wiki-link wiki-link-missing';
      const html = `<a class="${cls}" data-wiki-title="${link.title.replace(/"/g, '&quot;')}">${link.title}</a>`;
      processed = processed.slice(0, link.start) + html + processed.slice(link.end);
    }
    return marked.parse(processed, { gfm: true, breaks: true }) as string;
  }, [content, titleIndex]);

  // Handle clicks on wikilinks in preview
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('wiki-link')) {
        e.preventDefault();
        const wikiTitle = target.getAttribute('data-wiki-title');
        if (wikiTitle) onNavigate(wikiTitle);
      }
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [onNavigate]);

  const handleDelete = async () => {
    if (!confirm(`Delete "${title}"?`)) return;
    await onDelete(note.rkey);
  };

  return (
    <div className="wiki-editor">
      <div className="wiki-editor-toolbar">
        <input
          className="wiki-editor-title"
          value={title}
          onChange={e => { setTitle(e.target.value); scheduleAutoSave(); }}
          placeholder="Note title"
        />
        <div className="wiki-editor-status">
          {saving ? 'Saving...' : dirty ? 'Unsaved' : 'Saved'}
        </div>
        <button className="wiki-btn-sm" onClick={doSave} disabled={saving}>Save</button>
        <button className="wiki-btn-sm wiki-btn-danger" onClick={handleDelete}>Delete</button>
      </div>

      <div className="wiki-editor-tags">
        <input
          value={tags}
          onChange={e => { setTags(e.target.value); scheduleAutoSave(); }}
          placeholder="Tags (comma-separated)"
        />
      </div>

      <div className="wiki-editor-split">
        <textarea
          className="wiki-editor-source"
          value={content}
          onChange={e => { setContent(e.target.value); scheduleAutoSave(); }}
          placeholder="Write markdown... Use [[Note Title]] to link notes."
          spellCheck={false}
        />
        <div
          className="wiki-editor-preview"
          ref={previewRef}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>
  );
}
