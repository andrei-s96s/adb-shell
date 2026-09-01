// Порт Sources/AdbShell/Models/Device.swift

export type DeviceState = 'device' | 'offline' | 'unauthorized' | 'noPermissions' | 'unknown';

export interface Device {
  serial: string;
  state: DeviceState;
  model?: string;
  product?: string;
  transportId?: string;
}

export function isNetworkDevice(device: Device): boolean {
  return device.serial.includes(':');
}

export function isReadyState(state: DeviceState): boolean {
  return state === 'device';
}

/** Имя для отображения — модель (с "_" заменённым на пробел) или serial, если модели нет. */
export function displayName(device: Device): string {
  return device.model ? device.model.replace(/_/g, ' ') : device.serial;
}
