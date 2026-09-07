import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleQuoted, tokenizeArgs } from '../main/adb/parsers/ShellQuoting';

test('wraps plain text in single quotes', () => {
  assert.equal(singleQuoted('hello'), "'hello'");
});

test('empty string produces empty quotes', () => {
  assert.equal(singleQuoted(''), "''");
});

test('embedded single quote is escaped', () => {
  assert.equal(singleQuoted("it's"), "'it'\\''s'");
});

test('unicode/emoji pass through untouched', () => {
  assert.equal(singleQuoted('привет 🎉'), "'привет 🎉'");
});

test('tokenizeArgs splits plain space-separated tokens', () => {
  assert.deepEqual(tokenizeArgs('shell pm list packages'), ['shell', 'pm', 'list', 'packages']);
});

test('tokenizeArgs keeps a double-quoted argument as one token, drops the quotes', () => {
  assert.deepEqual(tokenizeArgs('shell am start --es text "hello world"'), ['shell', 'am', 'start', '--es', 'text', 'hello world']);
});

test('tokenizeArgs keeps a single-quoted path with spaces as one token', () => {
  assert.deepEqual(tokenizeArgs("push '/Users/andrei/My Apps/app.apk' /sdcard/"), ['push', '/Users/andrei/My Apps/app.apk', '/sdcard/']);
});

test('tokenizeArgs resolves a substituted variable value that itself contains a space, inside quotes', () => {
  assert.deepEqual(tokenizeArgs('push "/Users/andrei/My Apps/app.apk" /sdcard/'), ['push', '/Users/andrei/My Apps/app.apk', '/sdcard/']);
});

test('tokenizeArgs handles escaped quotes inside a double-quoted token', () => {
  assert.deepEqual(tokenizeArgs('shell echo "say \\"hi\\""'), ['shell', 'echo', 'say "hi"']);
});

test('tokenizeArgs treats a backslash outside quotes as escaping the next character', () => {
  assert.deepEqual(tokenizeArgs('push a\\ b.apk /sdcard/'), ['push', 'a b.apk', '/sdcard/']);
});

test('tokenizeArgs collapses repeated whitespace and trims edges', () => {
  assert.deepEqual(tokenizeArgs('  shell   pm  list  '), ['shell', 'pm', 'list']);
});

test('tokenizeArgs on an unterminated quote still returns the accumulated token instead of throwing', () => {
  assert.deepEqual(tokenizeArgs('shell echo "unterminated'), ['shell', 'echo', 'unterminated']);
});

test('tokenizeArgs preserves unicode/emoji inside a quoted token', () => {
  assert.deepEqual(tokenizeArgs('shell echo "привет 🎉"'), ['shell', 'echo', 'привет 🎉']);
});

test('tokenizeArgs on an empty string returns no tokens', () => {
  assert.deepEqual(tokenizeArgs(''), []);
});

test('tokenizeArgs on a lone empty quoted pair returns one empty-string token', () => {
  assert.deepEqual(tokenizeArgs('adb push "" /sdcard/'), ['adb', 'push', '', '/sdcard/']);
});
