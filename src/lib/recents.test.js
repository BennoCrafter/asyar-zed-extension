import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanError, filterItems, toRecentItems } from './recents.js';

test('cleanError extracts the AppleScript message', () => {
  assert.equal(cleanError('0:12: execution error: No Finder window open. (-2700)'), 'No Finder window open.');
  assert.equal(cleanError('something else'), 'something else');
});

test('recents: single and multi-folder workspaces', () => {
  const items = toRecentItems([{ paths: '/Users/me/code/app/' }, { paths: '/Users/me/a\n/opt/b' }]);
  assert.deepEqual(items[0], { id: '/Users/me/code/app/', title: 'app', subtitle: '~/code/app/', argv: ['/Users/me/code/app/'] });
  assert.equal(items[1].title, 'a +1');
  assert.equal(items[1].subtitle, '~/a, /opt/b');
  assert.deepEqual(items[1].argv, ['/Users/me/a', '/opt/b']);
});

test('filter matches every word across title and subtitle', () => {
  const items = toRecentItems([{ paths: '/Users/me/dotfiles' }, { paths: '/Users/me/coding/zed' }]);
  assert.deepEqual(filterItems(items, 'coding ze').map((i) => i.title), ['zed']);
  assert.equal(filterItems(items, '').length, 2);
});
