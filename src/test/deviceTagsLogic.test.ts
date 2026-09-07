import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTag, removeTag, allTags } from '../main/deviceTags/deviceTagsLogic';

test('adds a trimmed tag to a serial', () => {
  const result = addTag({}, 'R58N30ABCDE', '  test-bench  ');
  assert.deepEqual(result, { R58N30ABCDE: ['test-bench'] });
});

test('adding a duplicate tag is a no-op', () => {
  const initial = { R58N30ABCDE: ['test-bench'] };
  assert.deepEqual(addTag(initial, 'R58N30ABCDE', 'test-bench'), initial);
});

test('blank tag is ignored', () => {
  assert.deepEqual(addTag({}, 'R58N30ABCDE', '   '), {});
});

test('removing the last tag drops the serial key entirely', () => {
  const result = removeTag({ R58N30ABCDE: ['test-bench'] }, 'R58N30ABCDE', 'test-bench');
  assert.deepEqual(result, {});
});

test('removing one of several tags keeps the rest', () => {
  const result = removeTag({ R58N30ABCDE: ['test-bench', 'rooted'] }, 'R58N30ABCDE', 'test-bench');
  assert.deepEqual(result, { R58N30ABCDE: ['rooted'] });
});

test('allTags is deduped and sorted', () => {
  const tags = allTags({ a: ['test-bench', 'beta'], b: ['test-bench', 'alpha'] });
  assert.deepEqual(tags, ['alpha', 'beta', 'test-bench']);
});
