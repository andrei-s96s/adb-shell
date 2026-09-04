import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkThresholds, initialArmState } from '../main/monitoring/alertThresholdLogic';

const settings = { enabled: true, cpuThreshold: 90, batteryThreshold: 15 };

test('disabled settings never fire', () => {
  const result = checkThresholds(initialArmState(), { cpuPercent: 99, isCharging: false }, { ...settings, enabled: false });
  assert.equal(result.cpuAlertFired, undefined);
});

test('cpu fires once on crossing, then re-arms below threshold', () => {
  let state = initialArmState();
  let result = checkThresholds(state, { cpuPercent: 95, isCharging: false }, settings);
  assert.deepEqual(result.cpuAlertFired, { cpuPercent: 95 });
  state = result.armState;

  // Держится выше порога -- второй раз не должно сработать (armed уже false).
  result = checkThresholds(state, { cpuPercent: 96, isCharging: false }, settings);
  assert.equal(result.cpuAlertFired, undefined);
  state = result.armState;

  // Падает ниже порога -- взводится заново.
  result = checkThresholds(state, { cpuPercent: 50, isCharging: false }, settings);
  assert.equal(result.cpuAlertFired, undefined);
  assert.equal(result.armState.cpuArmed, true);
  state = result.armState;

  // Пересекает порог снова -- срабатывает повторно.
  result = checkThresholds(state, { cpuPercent: 91, isCharging: false }, settings);
  assert.deepEqual(result.cpuAlertFired, { cpuPercent: 91 });
});

test('battery fires only when not charging, at or below threshold', () => {
  const chargingResult = checkThresholds(initialArmState(), { batteryLevel: 5, isCharging: true }, settings);
  assert.equal(chargingResult.batteryAlertFired, undefined);

  const dischargingResult = checkThresholds(initialArmState(), { batteryLevel: 15, isCharging: false }, settings);
  assert.deepEqual(dischargingResult.batteryAlertFired, { batteryLevel: 15 });
});

test('missing samples do not touch the other metric arm state', () => {
  const result = checkThresholds(initialArmState(), { isCharging: false }, settings);
  assert.equal(result.cpuAlertFired, undefined);
  assert.equal(result.batteryAlertFired, undefined);
  assert.deepEqual(result.armState, initialArmState());
});
