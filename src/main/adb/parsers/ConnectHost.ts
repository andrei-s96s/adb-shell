// Порт DevicesViewModel.performConnect(_:) из
// Sources/AdbShell/ViewModels/DevicesViewModel.swift — во всех путях
// подключения (ручной ввод, профиль, автоконнект) хост без порта получает
// порт adb по умолчанию.

export function normalizeConnectHost(host: string): string {
  return host.includes(':') ? host : `${host}:5555`;
}
