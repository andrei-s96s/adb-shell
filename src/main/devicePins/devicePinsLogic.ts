// Порт togglePin(_:)/isPinned(_:) из
// Sources/AdbShell/ViewModels/DevicesViewModel.swift. В оригинале pinnedSerials
// хранится только в памяти (@Published без персистентности) и сбрасывается
// при перезапуске приложения — в порту это сознательно исправлено:
// DevicePinStore.ts сохраняет список в userData/pinned-devices.json тем же
// способом, что и остальные настройки. Порядок закрепления сохраняется
// (append, не re-sort) — так порядок чипов в pinned-strip совпадает с
// порядком, в котором устройства были закреплены.

export function togglePin(pinnedSerials: string[], serial: string): string[] {
  const index = pinnedSerials.indexOf(serial);
  if (index >= 0) {
    return [...pinnedSerials.slice(0, index), ...pinnedSerials.slice(index + 1)];
  }
  return [...pinnedSerials, serial];
}
