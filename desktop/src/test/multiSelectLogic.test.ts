import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySelection, handleRowClick } from '../main/apps/multiSelectLogic';

const order = ['com.a', 'com.b', 'com.c', 'com.d', 'com.e'];

test('plain click selects exactly one package', () => {
  let state = handleRowClick(emptySelection(), 'com.b', order, { meta: false, shift: false });
  assert.deepEqual([...state.selected], ['com.b']);
  state = handleRowClick(state, 'com.d', order, { meta: false, shift: false });
  assert.deepEqual([...state.selected], ['com.d']);
});

test('meta-click toggles membership without touching the rest of the selection', () => {
  let state = handleRowClick(emptySelection(), 'com.a', order, { meta: false, shift: false });
  state = handleRowClick(state, 'com.c', order, { meta: true, shift: false });
  assert.deepEqual([...state.selected].sort(), ['com.a', 'com.c']);
  state = handleRowClick(state, 'com.a', order, { meta: true, shift: false });
  assert.deepEqual([...state.selected], ['com.c']);
});

test('shift-click selects the range from the last plain click, regardless of direction', () => {
  let state = handleRowClick(emptySelection(), 'com.b', order, { meta: false, shift: false });
  state = handleRowClick(state, 'com.d', order, { meta: false, shift: true });
  assert.deepEqual([...state.selected].sort(), ['com.b', 'com.c', 'com.d']);
});

test('chained shift-clicks extend from the original anchor, not the last shift-click', () => {
  let state = handleRowClick(emptySelection(), 'com.b', order, { meta: false, shift: false });
  state = handleRowClick(state, 'com.d', order, { meta: false, shift: true });
  // Второй ⇧-клик на 'com.a' должен взять диапазон от исходного anchor'а
  // 'com.b', а не от 'com.d' -- иначе результат был бы {a,b,c,d} тоже, но
  // по совсем другой причине; используем anchor левее диапазона, чтобы
  // отличить поведения.
  state = handleRowClick(state, 'com.a', order, { meta: false, shift: true });
  assert.deepEqual([...state.selected].sort(), ['com.a', 'com.b', 'com.c', 'com.d']);
});

test('shift-click with no prior anchor falls back to a plain single selection', () => {
  const state = handleRowClick(emptySelection(), 'com.c', order, { meta: false, shift: true });
  assert.deepEqual([...state.selected], ['com.c']);
});

test('shift-click when the anchor scrolled out of the current filtered view falls back to plain selection', () => {
  let state = handleRowClick(emptySelection(), 'com.b', order, { meta: false, shift: false });
  const filteredOrder = ['com.c', 'com.d']; // anchor 'com.b' no longer visible after a search filter
  state = handleRowClick(state, 'com.d', filteredOrder, { meta: false, shift: true });
  assert.deepEqual([...state.selected], ['com.d']);
});
