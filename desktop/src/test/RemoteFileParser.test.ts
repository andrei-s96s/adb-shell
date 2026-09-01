import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemoteFiles } from '../main/adb/parsers/RemoteFileParser';
import { joinRemotePath } from '../main/adb/types/RemoteFile';

test('parses files and directories', () => {
  const output = [
    'total 24',
    'drwxrwx--x 4 root sdcard_rw 4096 2024-05-01 10:00 Download',
    '-rw-rw---- 1 root sdcard_rw 1024 2024-05-02 11:30 notes.txt',
  ].join('\n');
  const entries = parseRemoteFiles(output, '/sdcard');
  assert.equal(entries.length, 2);

  const dir = entries.find((e) => e.name === 'Download');
  assert.equal(dir?.isDirectory, true);
  assert.equal(dir?.path, '/sdcard/Download');

  const file = entries.find((e) => e.name === 'notes.txt');
  assert.equal(file?.isDirectory, false);
  assert.equal(file?.sizeBytes, 1024);
  assert.equal(file?.path, '/sdcard/notes.txt');
});

test('directories sort before files alphabetically', () => {
  const output = [
    '-rw-rw---- 1 root root 10 2024-05-01 10:00 zzz.txt',
    'drwxrwx--x 4 root root 4096 2024-05-01 10:00 aaa_folder',
    '-rw-rw---- 1 root root 10 2024-05-01 10:00 bbb.txt',
  ].join('\n');
  const entries = parseRemoteFiles(output, '/sdcard');
  assert.deepEqual(
    entries.map((e) => e.name),
    ['aaa_folder', 'bbb.txt', 'zzz.txt']
  );
});

test('skips dot, dotdot, and total line', () => {
  const output = [
    'total 8',
    'drwxr-xr-x 2 root root 4096 2024-05-01 10:00 .',
    'drwxr-xr-x 2 root root 4096 2024-05-01 10:00 ..',
    '-rw-r--r-- 1 root root  100 2024-05-01 10:00 file.txt',
  ].join('\n');
  const entries = parseRemoteFiles(output, '/sdcard');
  assert.deepEqual(
    entries.map((e) => e.name),
    ['file.txt']
  );
});

test('symlink target is stripped from name', () => {
  const output = 'lrwxrwxrwx 1 root root 12 2024-05-01 10:00 current -> /data/app/1';
  const entries = parseRemoteFiles(output, '/data');
  assert.equal(entries[0]?.name, 'current');
  assert.equal(entries[0]?.isSymlink, true);
});

test('garbage lines are ignored', () => {
  const output = ['ls: /root: Permission denied', 'opendir failed, Permission denied'].join('\n');
  assert.deepEqual(parseRemoteFiles(output, '/root'), []);
});

test('joinRemotePath handles trailing slash', () => {
  assert.equal(joinRemotePath('/sdcard', 'file.txt'), '/sdcard/file.txt');
  assert.equal(joinRemotePath('/sdcard/', 'file.txt'), '/sdcard/file.txt');
  assert.equal(joinRemotePath('/', 'file.txt'), '/file.txt');
});
