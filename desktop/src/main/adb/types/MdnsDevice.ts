// Порт Sources/AdbShell/Models/MdnsDevice.swift

export interface MdnsDevice {
  name: string;
  type: string;
  address: string;
}

/** `_adb-tls-pairing._tcp` — экран «сопряжение по коду», нужен код.
 * `_adb-tls-connect._tcp` — уже сопряжённое устройство, можно `adb connect` сразу. */
export function mdnsNeedsPairing(device: MdnsDevice): boolean {
  return device.type.includes('pairing');
}
