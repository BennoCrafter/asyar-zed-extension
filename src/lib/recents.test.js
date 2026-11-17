import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchFromHead, cleanError, filterItems, toRecentItems } from './recents.js';

test('cleanError extracts the AppleScript message', () => {
  assert.equal(cleanError('0:12: execution error: No Finder window open. (-2700)'), 'No Finder window open.');
  assert.equal(cleanError('something else'), 'something else');
});

test('recents: single and multi-folder workspaces', () => {
  const items = toRecentItems([{ paths: '/Users/me/code/app/' }, { paths: '/Users/me/a\n/opt/b' }]);
  assert.deepEqual(items[0], { id: '/Users/me/code/app/', title: 'app', subtitle: '~/code', argv: ['/Users/me/code/app/'] });
  assert.equal(items[1].title, 'a +1');
  assert.equal(items[1].subtitle, '~');
  assert.deepEqual(items[1].argv, ['/Users/me/a', '/opt/b']);
});

test('recents: Linux and Windows paths', () => {
  const [linux, windows] = toRecentItems([{ paths: '/home/me/coding/zed' }, { paths: 'C:\\Users\\me\\coding\\zed' }]);
  assert.deepEqual([linux.title, linux.subtitle], ['zed', '~/coding']);
  assert.deepEqual([windows.title, windows.subtitle], ['zed', '~\\coding']);
});

test('branchFromHead: branch, detached, garbage', () => {
  assert.equal(branchFromHead('ref: refs/heads/feat/app-running-indicator\n'), 'feat/app-running-indicator');
  assert.equal(branchFromHead('716492005f459cdaf36d4153da1f1edcb1ebb18b\n'), '7164920');
  assert.equal(branchFromHead(''), null);
});

test('filter matches every word across title and every path', () => {
  const items = toRecentItems([{ paths: '/Users/me/dotfiles' }, { paths: '/Users/me/coding/zed\n/opt/extra' }]);
  assert.deepEqual(filterItems(items, 'coding ze').map((i) => i.title), ['zed +1']);
  assert.deepEqual(filterItems(items, 'extra').map((i) => i.title), ['zed +1']);
  assert.equal(filterItems(items, '').length, 2);
});
