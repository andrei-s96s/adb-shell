import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleQuoted } from '../main/adb/parsers/ShellQuoting';

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
