import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variableNames, resolveVariables } from '../main/macros/macroRunnerLogic';
import { Macro } from '../main/adb/types/Macro';

// Тестовые кейсы зеркалят Tests/AdbShellTests/MacroRunnerTests.swift.

function macro(argsLines: string[]): Macro {
  return {
    id: 'm1',
    name: 'Test',
    steps: argsLines.map((argsLine, i) => ({ id: `s${i}`, argsLine })),
    autorunOnConnect: false,
    abortOnFirstFailure: false,
  };
}

test('extracts variable names in order without duplicates', () => {
  const m = macro(['connect ${IP}:${PORT}', 'shell pm install ${IP}']);
  assert.deepEqual(variableNames(m), ['IP', 'PORT']);
});

test('no variables returns empty', () => {
  assert.deepEqual(variableNames(macro(['root'])), []);
});

test('resolve substitutes known variables', () => {
  const resolved = resolveVariables('connect ${IP}:${PORT}', { IP: '192.168.1.5', PORT: '5555' });
  assert.equal(resolved, 'connect 192.168.1.5:5555');
});

test('resolve leaves unknown variables untouched', () => {
  const resolved = resolveVariables('shell echo ${MISSING}', {});
  assert.equal(resolved, 'shell echo ${MISSING}');
});
