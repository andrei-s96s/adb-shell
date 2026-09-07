import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSteps,
  addMacro,
  updateMacro,
  removeMacro,
  mergeImportedMacros,
  addMacroTag,
  removeMacroTag,
  allMacroTags,
} from '../main/macros/macrosLogic';
import { Macro } from '../main/adb/types/Macro';

let nextId = 0;
const makeId = () => `id-${nextId++}`;

/** addMacro/updateMacro теперь принимают уже готовый MacroStep[] (структурный
 * редактор в macros.ts строит его сам), а не сырой текст -- разбор текста в
 * шаги остаётся отдельной чистой функцией (parseSteps), которую в этих
 * тестах достаточно вызывать один раз здесь, а не дублировать в каждом
 * тесте ниже. */
const steps = (rawText: string) => parseSteps(rawText, makeId);

test('parseSteps keeps only adb-prefixed lines, case-insensitively', () => {
  const raw = ['@echo off', 'adb root', 'ADB shell pm list packages', 'pause', 'chcp 1251', ''].join('\n');
  const parsed = parseSteps(raw, makeId);
  assert.deepEqual(
    parsed.map((s) => s.argsLine),
    ['root', 'shell pm list packages']
  );
});

test('parseSteps strips -d/-e device-selection flags', () => {
  const parsed = parseSteps(['adb -d shell foo', 'adb -e install x.apk'].join('\n'), makeId);
  assert.deepEqual(
    parsed.map((s) => s.argsLine),
    ['shell foo', 'install x.apk']
  );
});

test('parseSteps strips -s <serial> and the serial token itself', () => {
  const parsed = parseSteps('adb -s R58N30ABCDE shell foo', makeId);
  assert.deepEqual(parsed.map((s) => s.argsLine), ['shell foo']);
});

test('parseSteps drops a step that is only -s <serial> with nothing after', () => {
  assert.deepEqual(parseSteps('adb -s R58N30ABCDE', makeId), []);
});

test('parseSteps skips blank lines and non-adb noise entirely', () => {
  assert.deepEqual(parseSteps(['', '   ', 'ipconfig', 'ifconfig'].join('\n'), makeId), []);
});

test('parseSteps handles CRLF line endings from pasted .bat scripts', () => {
  const parsed = parseSteps('adb root\r\nadb remount\r\n', makeId);
  assert.deepEqual(
    parsed.map((s) => s.argsLine),
    ['root', 'remount']
  );
});

test('addMacro requires both a non-blank name and at least one meaningful step', () => {
  assert.deepEqual(addMacro([], '  ', steps('adb root'), false, false, makeId), []);
  assert.deepEqual(addMacro([], 'Name', steps('not an adb line'), false, false, makeId), []);
  const macros = addMacro([], 'Flash', steps('adb root\nadb remount'), true, true, makeId);
  assert.equal(macros.length, 1);
  assert.equal(macros[0].name, 'Flash');
  assert.equal(macros[0].steps.length, 2);
  assert.equal(macros[0].autorunOnConnect, true);
  assert.equal(macros[0].abortOnFirstFailure, true);
});

test('addMacro trims command text and drops empty command steps, but keeps delay steps as-is', () => {
  const macros = addMacro(
    [],
    'Flash',
    [
      { id: 's1', argsLine: '  root  ' },
      { id: 's2', argsLine: '   ' },
      { id: 's3', argsLine: '', isDelay: true, delayMs: 500 },
    ],
    false,
    false,
    makeId
  );
  assert.deepEqual(
    macros[0].steps.map((s) => ({ argsLine: s.argsLine, isDelay: s.isDelay, delayMs: s.delayMs })),
    [
      { argsLine: 'root', isDelay: undefined, delayMs: undefined },
      { argsLine: '', isDelay: true, delayMs: 500 },
    ]
  );
});

test('addMacro clamps an out-of-range delay to [0, MAX_MACRO_STEP_DELAY_MS]', () => {
  const macros = addMacro(
    [],
    'Flash',
    [
      { id: 's1', argsLine: '', isDelay: true, delayMs: -50 },
      { id: 's2', argsLine: '', isDelay: true, delayMs: 999_999 },
      { id: 's3', argsLine: '', isDelay: true, delayMs: Number.NaN },
    ],
    false,
    false,
    makeId
  );
  assert.deepEqual(
    macros[0].steps.map((s) => s.delayMs),
    [0, 300_000, 0]
  );
});

test('updateMacro replaces name/steps/flags for the matching id, leaves others untouched', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  macros = addMacro(macros, 'Other', steps('adb remount'), false, false, makeId);
  const targetId = macros[0].id;
  macros = updateMacro(macros, targetId, 'Renamed', steps('adb reboot'), true, false);
  assert.equal(macros[0].name, 'Renamed');
  assert.deepEqual(
    macros[0].steps.map((s) => s.argsLine),
    ['reboot']
  );
  assert.equal(macros[0].autorunOnConnect, true);
  assert.equal(macros[1].name, 'Other');
});

test('addMacro stores an optional hotkeyAccelerator, undefined when omitted', () => {
  const withHotkey = addMacro([], 'Flash', steps('adb root'), false, false, makeId, 'CommandOrControl+Alt+M');
  assert.equal(withHotkey[0].hotkeyAccelerator, 'CommandOrControl+Alt+M');
  const withoutHotkey = addMacro([], 'Other', steps('adb root'), false, false, makeId);
  assert.equal(withoutHotkey[0].hotkeyAccelerator, undefined);
});

test('updateMacro can change or clear an existing hotkeyAccelerator', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId, 'CommandOrControl+Alt+M');
  const id = macros[0].id;
  macros = updateMacro(macros, id, 'Flash', steps('adb root'), false, false, 'CommandOrControl+Alt+N');
  assert.equal(macros[0].hotkeyAccelerator, 'CommandOrControl+Alt+N');
  macros = updateMacro(macros, id, 'Flash', steps('adb root'), false, false);
  assert.equal(macros[0].hotkeyAccelerator, undefined);
});

test('removeMacro deletes by id', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  macros = removeMacro(macros, macros[0].id);
  assert.deepEqual(macros, []);
});

test('addMacroTag adds a trimmed tag to the matching macro only', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  macros = addMacro(macros, 'Other', steps('adb remount'), false, false, makeId);
  const targetId = macros[0].id;
  macros = addMacroTag(macros, targetId, '  work  ');
  assert.deepEqual(macros[0].tags, ['work']);
  assert.equal(macros[1].tags, undefined);
});

test('addMacroTag ignores a blank tag and a duplicate of an existing one', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  const id = macros[0].id;
  macros = addMacroTag(macros, id, '   ');
  assert.equal(macros[0].tags, undefined);
  macros = addMacroTag(macros, id, 'work');
  macros = addMacroTag(macros, id, 'work');
  assert.deepEqual(macros[0].tags, ['work']);
});

test('removeMacroTag drops the tags field entirely once the last tag is removed', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  const id = macros[0].id;
  macros = addMacroTag(macros, id, 'work');
  macros = removeMacroTag(macros, id, 'work');
  assert.equal(macros[0].tags, undefined);
});

test('removeMacroTag removing one of several tags keeps the rest', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  const id = macros[0].id;
  macros = addMacroTag(macros, id, 'work');
  macros = addMacroTag(macros, id, 'test');
  macros = removeMacroTag(macros, id, 'work');
  assert.deepEqual(macros[0].tags, ['test']);
});

test('allMacroTags is deduped and sorted across all macros', () => {
  let macros = addMacro([], 'Flash', steps('adb root'), false, false, makeId);
  macros = addMacro(macros, 'Other', steps('adb remount'), false, false, makeId);
  macros = addMacroTag(macros, macros[0].id, 'work');
  macros = addMacroTag(macros, macros[0].id, 'beta');
  macros = addMacroTag(macros, macros[1].id, 'work');
  macros = addMacroTag(macros, macros[1].id, 'alpha');
  assert.deepEqual(allMacroTags(macros), ['alpha', 'beta', 'work']);
});

test('mergeImportedMacros does not duplicate on repeated import', () => {
  const imported: Macro[] = [
    { id: 'shared', name: 'X', steps: [{ id: 's1', argsLine: 'root' }], autorunOnConnect: false, abortOnFirstFailure: false },
  ];
  let macros = mergeImportedMacros([], imported);
  macros = mergeImportedMacros(macros, imported);
  assert.equal(macros.length, 1);
});
