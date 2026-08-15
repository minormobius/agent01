// workflow-triggers.mjs — read what wakes a workflow up.
//
// 135 of this repo's workflows are triggered by a push, and 39 of them write
// back to the repo. That is a graph, and nothing in the repo could read it: a
// push trigger has only ever been checked by a human squinting at YAML, which
// is how deploy-lab.yml came to be armed on a branch that would republish a
// surface with half its sites missing, and how lab-build.yml came within one
// squash merge of rebuilding forty strangers' websites weeks late.
//
// An unattended loop that commits makes this the load-bearing question:
// **whose workflow does my next commit start?**
//
// A TARGETED EXTRACTOR, NOT A YAML PARSER. This repo has no dependencies and
// will not grow one for this. The workflows here are regular — `on:` at column
// 0, `push:` under it, `branches:`/`paths:` under that, in inline or block
// form — and a parser that understands exactly that shape and REPORTS WHEN IT
// DOES NOT is safer than a general one that quietly returns a wrong answer. So
// anything unrecognised sets `parsed: false`, and the caller is expected to
// treat an unparsed workflow as "might fire" rather than "does not fire".

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GitHub Actions filter-pattern → RegExp.
 *
 * Per GitHub's docs on filter patterns: `*` matches zero or more characters
 * but NOT `/`; `**` matches zero or more of any character including `/`. Both
 * are anchored to the whole path. `?` matches one non-slash character.
 *
 * The trailing-`/**` case is the one that matters most here and the one an
 * eyeballed regex usually gets wrong: `loop/**` must match `loop/a` and
 * `loop/a/b`, and by GitHub's "zero or more" it also matches `loop/` itself.
 */
export function filterToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

export const pathMatches = (pattern, path) => filterToRegExp(pattern).test(path);

/** Does any pattern in the list match the path? */
export const anyMatch = (patterns, path) => patterns.some((p) => pathMatches(p, path));

/** Branch filters use the same syntax, over branch names. */
export const branchMatches = (patterns, branch) => patterns.some((p) => pathMatches(p, branch));

// ------------------------------------------------------------- extraction --

/** Strip a YAML scalar's quotes and trailing comment. Values here are simple
 *  strings; anything with an embedded '#' inside quotes keeps it. */
function scalar(raw) {
  let s = raw.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  const hash = s.indexOf(' #');
  if (hash !== -1) s = s.slice(0, hash).trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function inlineList(raw) {
  const s = raw.trim();
  if (!s.startsWith('[')) return null;
  const inner = s.slice(1, s.lastIndexOf(']'));
  if (!inner.trim()) return [];
  return inner.split(',').map((x) => scalar(x)).filter(Boolean);
}

const indentOf = (line) => line.match(/^(\s*)/)[1].length;
const isBlank = (line) => !line.trim() || /^\s*#/.test(line);

/**
 * Read a `key:` whose value is either inline (`key: [a, b]`) or a block list
 * beneath it. Returns null when the key is absent — which is NOT the same as
 * an empty list: an absent `paths:` means "every path fires this", and
 * conflating the two is precisely the mistake that makes a firewall useless.
 */
function readList(lines, start, end, key, atIndent) {
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isBlank(line)) continue;
    if (indentOf(line) !== atIndent) continue;
    const m = line.match(/^\s*([\w-]+):(.*)$/);
    if (!m || m[1] !== key) continue;
    const inline = inlineList(m[2]);
    if (inline) return inline;
    if (m[2].trim()) return [scalar(m[2])];
    const out = [];
    for (let j = i + 1; j < end; j++) {
      const l = lines[j];
      if (isBlank(l)) continue;
      if (indentOf(l) <= atIndent) break;
      const item = l.match(/^\s*-\s*(.+)$/);
      if (item) out.push(scalar(item[1]));
      else break;
    }
    return out;
  }
  return null;
}

/** The line range of a mapping key's block: from the line after it, to the
 *  next line at or below its indent. */
function blockRange(lines, key, atIndent, from = 0, to = lines.length) {
  for (let i = from; i < to; i++) {
    const line = lines[i];
    if (isBlank(line)) continue;
    if (indentOf(line) !== atIndent) continue;
    const m = line.match(/^\s*([\w-]+):/);
    if (!m || m[1] !== key) continue;
    let end = to;
    for (let j = i + 1; j < to; j++) {
      if (isBlank(lines[j])) continue;
      if (indentOf(lines[j]) <= atIndent) { end = j; break; }
    }
    return { head: i, start: i + 1, end };
  }
  return null;
}

/**
 * Parse one workflow's triggers.
 *
 * Returns:
 *   { file, events: [...], push: {branches, paths, pathsIgnore} | null, parsed }
 *
 * `push.branches === null` means the workflow fires on a push to ANY branch.
 * `push.paths === null` means ANY path. Both are the dangerous defaults and
 * both are represented as null rather than as `[]` so a caller cannot treat
 * "unfiltered" as "matches nothing" by accident.
 */
export function parseWorkflowTriggers(text, file = '<inline>') {
  const lines = text.split('\n');
  // `on:` at the top level. YAML 1.1 turns a bare `on` into the boolean true,
  // which is why some repos quote it — accept both spellings.
  const onBlock = blockRange(lines, 'on', 0) ?? blockRange(lines, '"on"', 0) ?? blockRange(lines, "'on'", 0);
  if (!onBlock) {
    // An inline mapping (`on: [push]`) or a shape we do not know. Either way we
    // cannot say what wakes it, so say so.
    const inline = lines.find((l) => /^\s*['"]?on['"]?:\s*\S/.test(l));
    if (inline) {
      const val = inline.slice(inline.indexOf(':') + 1);
      const list = inlineList(val) ?? [scalar(val)];
      return { file, events: list, push: list.includes('push') ? { branches: null, paths: null, pathsIgnore: null } : null, parsed: true };
    }
    return { file, events: [], push: null, parsed: false };
  }

  const evIndent = (() => {
    for (let i = onBlock.start; i < onBlock.end; i++) {
      if (!isBlank(lines[i])) return indentOf(lines[i]);
    }
    return 2;
  })();

  const events = [];
  for (let i = onBlock.start; i < onBlock.end; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) !== evIndent) continue;
    const m = lines[i].match(/^\s*([\w-]+):/);
    if (m) events.push(m[1]);
  }

  const pushBlock = blockRange(lines, 'push', evIndent, onBlock.start, onBlock.end);
  if (!events.includes('push')) return { file, events, push: null, parsed: true };

  if (!pushBlock || pushBlock.start >= pushBlock.end) {
    // `push:` with no body = every branch, every path.
    return { file, events, push: { branches: null, paths: null, pathsIgnore: null }, parsed: true };
  }
  const filterIndent = (() => {
    for (let i = pushBlock.start; i < pushBlock.end; i++) {
      if (!isBlank(lines[i])) return indentOf(lines[i]);
    }
    return evIndent + 2;
  })();

  return {
    file,
    events,
    push: {
      branches: readList(lines, pushBlock.start, pushBlock.end, 'branches', filterIndent),
      paths: readList(lines, pushBlock.start, pushBlock.end, 'paths', filterIndent),
      pathsIgnore: readList(lines, pushBlock.start, pushBlock.end, 'paths-ignore', filterIndent),
    },
    parsed: true,
  };
}

/** Every workflow in .github/workflows, parsed. */
export function loadWorkflows(root) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => parseWorkflowTriggers(readFileSync(join(dir, f), 'utf8'), f));
}

/**
 * Would a push of `files` to `branch` wake this workflow?
 *
 * FAILS TOWARDS "YES". An unparsed workflow, an absent branch filter and an
 * absent path filter all return true. A firewall that guesses "no" is worse
 * than no firewall, because it is believed.
 */
export function wouldFire(wf, branch, files) {
  if (!wf.parsed) return { fires: true, why: 'triggers could not be parsed — treated as firing' };
  if (!wf.push) return { fires: false, why: 'no push trigger' };

  const { branches, paths, pathsIgnore } = wf.push;
  if (branches && !branchMatches(branches, branch)) {
    return { fires: false, why: `branch ${branch} not in [${branches.join(', ')}]` };
  }
  if (!paths) {
    if (pathsIgnore) {
      const live = files.filter((f) => !anyMatch(pathsIgnore, f));
      return live.length
        ? { fires: true, why: `no paths filter; ${live[0]} survives paths-ignore` }
        : { fires: false, why: 'every file matched paths-ignore' };
    }
    return { fires: true, why: 'no paths filter — any push to this branch fires it' };
  }
  const hit = files.find((f) => anyMatch(paths, f) && !(pathsIgnore && anyMatch(pathsIgnore, f)));
  return hit
    ? { fires: true, why: `${hit} matches ${paths.find((p) => pathMatches(p, hit))}` }
    : { fires: false, why: 'no file matched paths' };
}
