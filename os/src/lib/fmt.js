// Terminal formatting utilities — ANSI colors for xterm.js

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const RED = `${ESC}31m`;
const MAGENTA = `${ESC}35m`;
const BLUE = `${ESC}34m`;
const WHITE = `${ESC}37m`;

export function bold(s) { return `${BOLD}${s}${RESET}`; }
export function dim(s) { return `${DIM}${s}${RESET}`; }
export function cyan(s) { return `${CYAN}${s}${RESET}`; }
export function green(s) { return `${GREEN}${s}${RESET}`; }
export function yellow(s) { return `${YELLOW}${s}${RESET}`; }
export function red(s) { return `${RED}${s}${RESET}`; }
export function magenta(s) { return `${MAGENTA}${s}${RESET}`; }
export function blue(s) { return `${BLUE}${s}${RESET}`; }

// Colorize JSON for terminal display
export function colorizeJSON(obj, indent = 0) {
  return _colorize(obj, indent, 0);
}

function _colorize(val, indent, depth) {
  const pad = ' '.repeat(indent);
  const innerPad = ' '.repeat(indent + 2);

  if (val === null) return `${MAGENTA}null${RESET}`;
  if (val === undefined) return `${DIM}undefined${RESET}`;
  if (typeof val === 'boolean') return `${YELLOW}${val}${RESET}`;
  if (typeof val === 'number') return `${CYAN}${val}${RESET}`;
  if (typeof val === 'string') {
    // Truncate long strings
    const display = val.length > 200 ? val.slice(0, 200) + '…' : val;
    return `${GREEN}"${escapeString(display)}"${RESET}`;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map(v => `${innerPad}${_colorize(v, indent + 2, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return '{}';
    const entries = keys.map(k => {
      const keyColor = k.startsWith('$') ? MAGENTA : k.startsWith('@') ? BLUE : WHITE;
      return `${innerPad}${keyColor}"${k}"${RESET}: ${_colorize(val[k], indent + 2, depth + 1)}`;
    });
    return `{\n${entries.join(',\n')}\n${pad}}`;
  }

  return String(val);
}

function escapeString(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

// Format a record listing as a table row
export function formatLsEntry(entry) {
  if (entry.type === 'collection') {
    return `${BLUE}${bold(entry.name)}/${RESET}`;
  }
  // Record — show rkey and a preview
  const preview = getRecordPreview(entry.value);
  return `${cyan(entry.rkey)}  ${dim(preview)}`;
}

function getRecordPreview(val) {
  if (!val) return '';
  // Try common ATProto fields
  if (val.text) return truncate(val.text, 60);
  if (val.title) return truncate(val.title, 60);
  if (val.name) return truncate(val.name, 60);
  if (val.displayName) return truncate(val.displayName, 60);
  if (val.description) return truncate(val.description, 60);
  if (val.$type) return dim(val.$type);
  return '';
}

function truncate(s, len) {
  if (typeof s !== 'string') return '';
  return s.length > len ? s.slice(0, len) + '…' : s;
}

// Format byte sizes
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Format a count with commas
export function formatCount(n) {
  return n.toLocaleString();
}
