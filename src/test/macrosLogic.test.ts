import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSteps, addMacro, updateMacro, removeMacro, mergeImportedMacros } from '../main/macros/macrosLogic';
import { Macro } from '../main/adb/types/Macro';

let nextId = 0;
const makeId = () => `id-${nextId++}`;

test('parseSteps keeps only adb-prefixed lines, case-insensitively', () => {
  const raw = ['@echo off', 'adb root', 'ADB shell pm list packages', 'pause', 'chcp 1251', ''].join('\n');
  const steps = parseSteps(raw, makeId);
  assert.deepEqual(
    steps.map((s) => s.argsLine),
    ['root', 'shell pm list packages']
  );
});

test('parseSteps strips -d/-e device-selection flags', () => {
  const steps = parseSteps(['adb -d shell foo', 'adb -e install x.apk'].join('\n'), makeId);
  assert.deepEqual(
    steps.map((s) => s.argsLine),
    ['shell foo', 'install x.apk']
  );
});

test('parseSteps strips -s <serial> and the serial token itself', () => {
  const steps = parseSteps('adb -s R58N30ABCDE shell foo', makeId);
  assert.deepEqual(steps.map((s) => s.argsLine), ['shell foo']);
});

test('parseSteps drops a step that is only -s <serial> with nothing after', () => {
  assert.deepEqual(parseSteps('adb -s R58N30ABCDE', makeId), []);
});

test('parseSteps skips blank lines and non-adb noise entirely', () => {
  assert.deepEqual(parseSteps(['', '   ', 'ipconfig', 'ifconfig'].join('\n'), makeId), []);
});

test('parseSteps handles CRLF line endings from pasted .bat scripts', () => {
  const steps = parseSteps('adb root\r\nadb remount\r\n', makeId);
  assert.deepEqual(
    steps.map((s) => s.argsLine),
    ['root', 'remount']
  );
});

test('addMacro requires both a non-blank name and at least one parsed step', () => {
  assert.deepEqual(addMacro([], '  ', 'adb root', false, false, makeId), []);
  assert.deepEqual(addMacro([], 'Name', 'not an adb line', false, false, makeId), []);
  const macros = addMacro([], 'Flash', 'adb root\nadb remount', true, true, makeId);
  assert.equal(macros.length, 1);
  assert.equal(macros[0].name, 'Flash');
  assert.equal(macros[0].steps.length, 2);
  assert.equal(macros[0].autorunOnConnect, true);
  assert.equal(macros[0].abortOnFirstFailure, true);
});

test('updateMacro replaces name/steps/flags for the matching id, leaves others untouched', () => {
  let macros = addMacro([], 'Flash', 'adb root', false, false, makeId);
  macros = addMacro(macros, 'Other', 'adb remount', false, false, makeId);
  const targetId = macros[0].id;
  macros = updateMacro(macros, targetId, 'Renamed', 'adb reboot', true, false, makeId);
  assert.equal(macros[0].name, 'Renamed');
  assert.deepEqual(
    macros[0].steps.map((s) => s.argsLine),
    ['reboot']
  );
  assert.equal(macros[0].autorunOnConnect, true);
  assert.equal(macros[1].name, 'Other');
});

test('addMacro stores an optional hotkeyAccelerator, undefined when omitted', () => {
  const withHotkey = addMacro([], 'Flash', 'adb root', false, false, makeId, 'CommandOrControl+Alt+M');
  assert.equal(withHotkey[0].hotkeyAccelerator, 'CommandOrControl+Alt+M');
  const withoutHotkey = addMacro([], 'Other', 'adb root', false, false, makeId);
  assert.equal(withoutHotkey[0].hotkeyAccelerator, undefined);
});

test('updateMacro can change or clear an existing hotkeyAccelerator', () => {
  let macros = addMacro([], 'Flash', 'adb root', false, false, makeId, 'CommandOrControl+Alt+M');
  const id = macros[0].id;
  macros = updateMacro(macros, id, 'Flash', 'adb root', false, false, makeId, 'CommandOrControl+Alt+N');
  assert.equal(macros[0].hotkeyAccelerator, 'CommandOrControl+Alt+N');
  macros = updateMacro(macros, id, 'Flash', 'adb root', false, false, makeId);
  assert.equal(macros[0].hotkeyAccelerator, undefined);
});

test('removeMacro deletes by id', () => {
  let macros = addMacro([], 'Flash', 'adb root', false, false, makeId);
  macros = removeMacro(macros, macros[0].id);
  assert.deepEqual(macros, []);
});

test('mergeImportedMacros does not duplicate on repeated import', () => {
  const imported: Macro[] = [
    { id: 'shared', name: 'X', steps: [{ id: 's1', argsLine: 'root' }], autorunOnConnect: false, abortOnFirstFailure: false },
  ];
  let macros = mergeImportedMacros([], imported);
  macros = mergeImportedMacros(macros, imported);
  assert.equal(macros.length, 1);
});
