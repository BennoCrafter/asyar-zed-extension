// Pure helpers, plain JS so `node --test` runs them without a TS toolchain.

/** @typedef {{ id: string, title: string, subtitle?: string, argv: string[] }} Item */

/** "…execution error: No Finder window open. (-2700)" → "No Finder window open." */
export function cleanError(stderr) {
  const m = stderr.match(/execution error: (.*?)(?: \(-?\d+\))?$/m);
  return (m ? m[1] : stderr).trim();
}

const tilde = (p) => p.replace(/^\/Users\/[^/]+/, '~');
const basename = (p) => p.replace(/\/+$/, '').split('/').pop() || p;

/**
 * Rows from Zed's `workspaces` table (`sqlite3 -json`). `paths` holds one
 * folder per line; multi-folder workspaces open together.
 * @returns {Item[]}
 */
export function toRecentItems(rows) {
  return rows.map(({ paths }) => {
    const argv = paths.split('\n').filter(Boolean);
    const more = argv.length > 1 ? ` +${argv.length - 1}` : '';
    return { id: paths, title: basename(argv[0]) + more, subtitle: argv.map(tilde).join(', '), argv };
  });
}

/** Every whitespace-separated word must appear in title or subtitle. */
export function filterItems(items, query, limit = 200) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const item of items) {
    const hay = `${item.title} ${item.subtitle ?? ''}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
