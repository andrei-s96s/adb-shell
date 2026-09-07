import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLocale, getLocale } from '../main/i18n';

test('defaults to ru and returns the input text unchanged', () => {
  setLocale('ru');
  assert.equal(getLocale(), 'ru');
  assert.equal(t('Сохранить файл'), 'Сохранить файл');
});

test('en locale returns the dictionary translation when one exists', () => {
  setLocale('en');
  assert.equal(t('Сохранить файл'), 'Save file');
  setLocale('ru');
});

test('en locale falls back to the ru text unchanged when no translation exists', () => {
  setLocale('en');
  assert.equal(t('Совершенно неизвестная фраза'), 'Совершенно неизвестная фраза');
  setLocale('ru');
});

test('interpolates {var} placeholders after picking the translation', () => {
  setLocale('ru');
  assert.equal(t('Установлено: {name}', { name: 'foo.apk' }), 'Установлено: foo.apk');
});

test('leaves an unmatched placeholder token as-is instead of throwing', () => {
  assert.equal(t('Привет, {name}!', { other: 'x' }), 'Привет, {name}!');
});

test('setLocale/getLocale round-trip', () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  setLocale('ru');
  assert.equal(getLocale(), 'ru');
});
