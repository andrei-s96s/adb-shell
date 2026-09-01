// Простой стор текущего выбранного устройства — экраны подписываются, чтобы
// перезагрузить свои данные при смене устройства. Без фреймворка (см.
// PLAN.md), этого достаточно для нынешнего размера интерфейса.

type Listener = (serial: string | undefined) => void;

let currentSerial: string | undefined;
const listeners: Listener[] = [];

export function getCurrentSerial(): string | undefined {
  return currentSerial;
}

export function setCurrentSerial(serial: string | undefined): void {
  currentSerial = serial;
  for (const listener of listeners) listener(serial);
}

export function onDeviceChanged(listener: Listener): void {
  listeners.push(listener);
}
