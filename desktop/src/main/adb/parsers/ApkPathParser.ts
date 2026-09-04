// Порт разбора вывода `pm path <package>` из ADBService.apkPaths(serial:packageName:)
// в Sources/AdbShell/Services/ADBService.swift.

export function parseApkPaths(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('package:'))
    .map((line) => line.slice('package:'.length));
}

/** Путь к base.apk, если есть, иначе первый из списка -- то, что реально
 * содержит манифест/код приложения (split APK может иметь ещё
 * config.*.apk для ресурсов конкретной плотности/языка, они не нужны для
 * переустановки на другом устройстве той же архитектуры). */
export function primaryApkPath(paths: string[]): string | undefined {
  return paths.find((p) => p.endsWith('base.apk')) ?? paths[0];
}
