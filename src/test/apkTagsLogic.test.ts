import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTag, removeTag, allTags } from '../main/apkLibrary/apkTagsLogic';

test('adds a trimmed tag to a path', () => {
  const result = addTag({}, '/a.apk', '  work  ');
  assert.deepEqual(result, { '/a.apk': ['work'] });
});

test('adding a duplicate tag is a no-op', () => {
  const initial = { '/a.apk': ['work'] };
  assert.deepEqual(addTag(initial, '/a.apk', 'work'), initial);
});

test('blank tag is ignored', () => {
  assert.deepEqual(addTag({}, '/a.apk', '   '), {});
});

test('removing the last tag drops the path key entirely', () => {
  const result = removeTag({ '/a.apk': ['work'] }, '/a.apk', 'work');
  assert.deepEqual(result, {});
});

test('removing one of several tags keeps the rest', () => {
  const result = removeTag({ '/a.apk': ['work', 'test'] }, '/a.apk', 'work');
  assert.deepEqual(result, { '/a.apk': ['test'] });
});

test('allTags is deduped and sorted', () => {
  const tags = allTags({ '/a.apk': ['work', 'beta'], '/b.apk': ['work', 'alpha'] });
  assert.deepEqual(tags, ['alpha', 'beta', 'work']);
});
