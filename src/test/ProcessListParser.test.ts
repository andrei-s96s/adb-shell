import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProcessList } from '../main/adb/parsers/ProcessListParser';

test('parses process rows', () => {
  const output = ['PID   PPID  USER     RSS NAME', '1     0     root     1200 init', '1234  1     u0_a123  54000 com.example.app'].join(
    '\n'
  );
  const processes = parseProcessList(output);
  assert.equal(processes.length, 2);
  assert.equal(processes[1].pid, 1234);
  assert.equal(processes[1].ppid, 1);
  assert.equal(processes[1].user, 'u0_a123');
  assert.equal(processes[1].rssKB, 54000);
  assert.equal(processes[1].name, 'com.example.app');
});

test('skips malformed lines', () => {
  const output = 'not a process line\nPID PPID USER RSS NAME';
  assert.deepEqual(parseProcessList(output), []);
});

test('empty output produces empty list', () => {
  assert.deepEqual(parseProcessList(''), []);
});
