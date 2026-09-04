// Порт DeviceSnapshot из Sources/AdbShell/Models/DeviceSnapshot.swift —
// имя файла кодирует метку устройства и число приложений, чтобы список
// снапшотов можно было показать без распаковки каждого .zip.

const PREFIX = 'AdbShell-Snapshot';

/** Заменяет всё, кроме букв (любого языка) и цифр, на "-", схлопывает
 * повторные "-" и обрезает по краям. Порт CharacterSet.alphanumerics-based
 * sanitize(_:) — \p{L}/\p{Nd} соответствуют letters/decimalDigits Swift. */
export function sanitizeDeviceLabel(label: string): string {
  let result = Array.from(label)
    .map((ch) => (/[\p{L}\p{Nd}]/u.test(ch) ? ch : '-'))
    .join('');
  while (result.includes('--')) result = result.split('--').join('-');
  result = result.replace(/^-+|-+$/g, '');
  return result.length === 0 ? 'device' : result;
}

export function makeSnapshotFilename(deviceLabel: string, appCount: number, uniqueSuffix: string): string {
  const sanitized = sanitizeDeviceLabel(deviceLabel);
  return `${PREFIX}_${sanitized}_${appCount}apps_${uniqueSuffix}.zip`;
}

export interface ParsedSnapshotName {
  label: string;
  appCount: number;
}

export function parseSnapshotFilename(filename: string): ParsedSnapshotName | undefined {
  const base = filename.replace(/\.[^./]+$/, '');
  const parts = base.split('_');
  if (parts.length < 3 || parts[0] !== PREFIX) return undefined;
  const label = parts[1].split('-').join(' ');
  const appCount = Number(parts[2].replace(/[^0-9]/g, '')) || 0;
  return { label, appCount };
}
