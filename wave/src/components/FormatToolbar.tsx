import { useCallback } from 'react';

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextChange: (text: string) => void;
}

type FormatAction = {
  label: string;
  title: string;
  wrap?: [string, string];   // wrap selection: [prefix, suffix]
  prefix?: string;           // line prefix (for headings, lists)
  insert?: string;           // insert at cursor if no selection
};

const ACTIONS: FormatAction[] = [
  { label: 'B', title: 'Bold', wrap: ['**', '**'] },
  { label: 'I', title: 'Italic', wrap: ['*', '*'] },
  { label: 'S', title: 'Strikethrough', wrap: ['~~', '~~'] },
  { label: '`', title: 'Inline code', wrap: ['`', '`'] },
  { label: 'H1', title: 'Heading 1', prefix: '# ' },
  { label: 'H2', title: 'Heading 2', prefix: '## ' },
  { label: 'H3', title: 'Heading 3', prefix: '### ' },
  { label: '•', title: 'Bullet list', prefix: '- ' },
  { label: '1.', title: 'Numbered list', prefix: '1. ' },
  { label: '☐', title: 'Task', prefix: '- [ ] ' },
  { label: '>', title: 'Quote', prefix: '> ' },
  { label: '—', title: 'Horizontal rule', insert: '\n---\n' },
  { label: '🔗', title: 'Link', insert: '[text](url)' },
  { label: '```', title: 'Code block', insert: '\n```\n\n```\n' },
  { label: '[[', title: 'Wiki link', insert: '[[page]]' },
];

export function FormatToolbar({ textareaRef, onTextChange }: Props) {
  const applyAction = useCallback((action: FormatAction) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.slice(start, end);

    let newText: string;
    let cursorPos: number;

    if (action.wrap && selected) {
      // Wrap selection
      const [pre, suf] = action.wrap;
      newText = text.slice(0, start) + pre + selected + suf + text.slice(end);
      cursorPos = end + pre.length + suf.length;
    } else if (action.wrap && !selected) {
      // Insert wrap markers with cursor inside
      const [pre, suf] = action.wrap;
      newText = text.slice(0, start) + pre + suf + text.slice(end);
      cursorPos = start + pre.length;
    } else if (action.prefix) {
      // Find line start
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      newText = text.slice(0, lineStart) + action.prefix + text.slice(lineStart);
      cursorPos = start + action.prefix.length;
    } else if (action.insert) {
      newText = text.slice(0, start) + action.insert + text.slice(end);
      cursorPos = start + action.insert.length;
    } else {
      return;
    }

    onTextChange(newText);
    // Restore focus and cursor position after React re-renders
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }, [textareaRef, onTextChange]);

  return (
    <div className="wave-format-toolbar">
      {ACTIONS.map(action => (
        <button
          key={action.title}
          className="wave-format-btn"
          title={action.title}
          onMouseDown={e => {
            e.preventDefault(); // prevent blur on textarea
            applyAction(action);
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
