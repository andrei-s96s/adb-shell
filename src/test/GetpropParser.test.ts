import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGetprop } from '../main/adb/parsers/GetpropParser';

test('parses simple key-value lines', () => {
  const output = ['[ro.build.version.release]: [14]', '[ro.product.model]: [Pixel 7]'].join('\n');
  const props = parseGetprop(output);
  assert.equal(props.length, 2);
  assert.ok(props.some((p) => p.key === 'ro.build.version.release' && p.value === '14'));
  assert.ok(props.some((p) => p.key === 'ro.product.model' && p.value === 'Pixel 7'));
});

test('handles empty value brackets', () => {
  const props = parseGetprop('[persist.sys.locale]: []');
  assert.equal(props.length, 1);
  assert.equal(props[0].value, '');
});

test('result is sorted by key', () => {
  const output = ['[zzz.last]: [1]', '[aaa.first]: [2]'].join('\n');
  const props = parseGetprop(output);
  assert.deepEqual(
    props.map((p) => p.key),
    ['aaa.first', 'zzz.last']
  );
});

test('skips malformed lines', () => {
  const output = ['this is not a property line', '[valid.key]: [value]'].join('\n');
  const props = parseGetprop(output);
  assert.equal(props.length, 1);
  assert.equal(props[0].key, 'valid.key');
});

test('empty output produces empty list', () => {
  assert.deepEqual(parseGetprop(''), []);
});
