import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIconPath } from '../main/adb/parsers/IconPathParser';

test('picks the highest-density application-icon line', () => {
  const output = [
    "application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'",
    "application-icon-320:'res/mipmap-xhdpi-v4/ic_launcher.png'",
    "application-icon-240:'res/mipmap-hdpi-v4/ic_launcher.png'",
  ].join('\n');
  assert.equal(parseIconPath(output), 'res/mipmap-xhdpi-v4/ic_launcher.png');
});

test('falls back to application: icon= when no application-icon- lines exist', () => {
  const output = "application: label='My App' icon='res/mipmap/ic_launcher.png'";
  assert.equal(parseIconPath(output), 'res/mipmap/ic_launcher.png');
});

test('prefers density-specific icon over the application: fallback', () => {
  const output = [
    "application: label='My App' icon='res/mipmap/ic_launcher.png'",
    "application-icon-320:'res/mipmap-xhdpi-v4/ic_launcher.png'",
  ].join('\n');
  assert.equal(parseIconPath(output), 'res/mipmap-xhdpi-v4/ic_launcher.png');
});

test('no icon information produces undefined', () => {
  assert.equal(parseIconPath('package: name=\'com.x\''), undefined);
});
