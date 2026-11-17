// Pure helpers, plain JS so `node --test` runs them without a TS toolchain.

/** @typedef {{ id: string, title: string, subtitle?: string, argv: string[] }} Item */

/** "…execution error: No Finder window open. (-2700)" → "No Finder window open." */
export function cleanError(stderr) {
  const m = stderr.match(/execution error: (.*?)(?: \(-?\d+\))?$/m);
  return (m ? m[1] : stderr).trim();
}

// Home folders on macOS, Linux and Windows.
const tilde = (p) => p.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~');
const trim = (p) => p.replace(/[/\\]+$/, '');
const basename = (p) => trim(p).split(/[/\\]/).pop() || p;
const dirname = (p) => trim(p).replace(/[/\\][^/\\]*$/, '') || p;

/**
 * Rows from Zed's `workspaces` table (`sqlite3 -json`). `paths` holds one
 * folder per line; multi-folder workspaces open together.
 * @returns {Item[]}
 */
export function toRecentItems(rows) {
  return rows.map(({ paths }) => {
    const argv = paths.split('\n').filter(Boolean);
    const more = argv.length > 1 ? ` +${argv.length - 1}` : '';
    return { id: paths, title: basename(argv[0]) + more, subtitle: tilde(dirname(argv[0])), argv };
  });
}

/** Contents of .git/HEAD → branch name, or the short hash when detached. */
export function branchFromHead(head) {
  const text = head.trim();
  const ref = text.match(/^ref: refs\/heads\/(.+)$/);
  return ref ? ref[1] : /^[0-9a-f]{40}$/.test(text) ? text.slice(0, 7) : null;
}

/** Every whitespace-separated word must appear in the title or one of the paths. */
export function filterItems(items, query, limit = 200) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const item of items) {
    const hay = `${item.title} ${item.argv.map(tilde).join(' ')}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
