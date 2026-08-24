import Foundation
import AppKit

/// Извлекает и кеширует реальные иконки приложений из APK через `aapt2 dump
/// badging` (тот же aapt2, что и Android Gradle Plugin — вшит в .app сборкой
/// build_app.sh, Apache-2.0): подтягивает APK с устройства (`pm path` + pull),
/// узнаёт у aapt2 путь к иконке внутри архива и вытаскивает именно этот файл
/// через `unzip -p`, не распаковывая весь APK.
///
/// Не поддерживается: adaptive icons без legacy PNG-фолбэка (когда путь к
/// иконке — XML вроде `res/mipmap-anydpi-v26/ic_launcher.xml`, а не растровая
/// картинка) — в этом случае просто остаётся иконка-плейсхолдер в списке,
/// полноценный рендеринг векторных/layered иконок не реализован.
@MainActor
final class IconService: ObservableObject {
    @Published private(set) var icons: [String: NSImage] = [:]

    private var attempted: Set<String> = []
    private var activeCount = 0
    private let maxConcurrent = 3
    private var pendingQueue: [() -> Void] = []

    /// nonisolated — не трогает актор-изолированное состояние (только Bundle/
    /// FileManager), а вызывается и извне (ApkInspectorService), где await
    /// на каждый вызов был бы лишним.
    nonisolated static func locateAapt2() -> String? {
        guard let bundled = Bundle.main.resourceURL?.appendingPathComponent("aapt2").path,
              FileManager.default.isExecutableFile(atPath: bundled) else { return nil }
        return bundled
    }

    func icon(for packageName: String) -> NSImage? { icons[packageName] }

    /// Лениво запускает извлечение иконки (вызывается при появлении строки в
    /// списке) — не больше `maxConcurrent` одновременно, чтобы не забить adb
    /// параллельными pull'ами целых APK, и не больше одного раза за сессию на
    /// пакет (успех кладётся в память+на диск, неудача просто не повторяется).
    func loadIfNeeded(serial: String, packageName: String, service: ADBService) {
        guard icons[packageName] == nil, !attempted.contains(packageName) else { return }
        attempted.insert(packageName)

        if let cached = Self.loadFromDiskCache(packageName: packageName) {
            icons[packageName] = cached
            return
        }
        guard Self.locateAapt2() != nil else { return }

        enqueue { [weak self] in
            guard let self else { return }
            Task {
                await self.fetch(serial: serial, packageName: packageName, service: service)
                self.finishOne()
            }
        }
    }

    private func fetch(serial: String, packageName: String, service: ADBService) async {
        guard let aapt2 = Self.locateAapt2() else { return }
        do {
            let paths = try await service.apkPaths(serial: serial, packageName: packageName)
            guard let apkRemotePath = paths.first(where: { $0.hasSuffix("base.apk") }) ?? paths.first else { return }

            let tmpApk = FileManager.default.temporaryDirectory
                .appendingPathComponent("adbshell-icon-\(UUID().uuidString).apk")
            try await service.pull(serial: serial, remotePath: apkRemotePath, localPath: tmpApk.path)
            defer { try? FileManager.default.removeItem(at: tmpApk) }

            guard let iconEntry = try await Self.resolveIconEntry(aapt2: aapt2, apkPath: tmpApk.path),
                  !iconEntry.lowercased().hasSuffix(".xml") else { return }

            guard let data = try await Self.extractEntry(apkPath: tmpApk.path, entryPath: iconEntry),
                  let image = NSImage(data: data) else { return }

            icons[packageName] = image
            Self.saveToDiskCache(packageName: packageName, data: data)
        } catch {
            // Иконка необязательна для работы приложения — молча оставляем плейсхолдер.
        }
    }

    private func enqueue(_ work: @escaping () -> Void) {
        if activeCount < maxConcurrent {
            activeCount += 1
            work()
        } else {
            pendingQueue.append(work)
        }
    }

    private func finishOne() {
        activeCount -= 1
        guard !pendingQueue.isEmpty else { return }
        let next = pendingQueue.removeFirst()
        activeCount += 1
        next()
    }

    // MARK: - aapt2 / unzip — статические и nonisolated, чтобы сам запуск
    // процесса шёл в фоновом потоке и не подвешивал UI на MainActor.

    nonisolated private static func resolveIconEntry(aapt2: String, apkPath: String) async throws -> String? {
        let output = try await runCapturingStdout(aapt2, ["dump", "badging", apkPath])
        guard let text = String(data: output, encoding: .utf8) else { return nil }
        return parseIconPath(fromBadging: text)
    }

    nonisolated private static func extractEntry(apkPath: String, entryPath: String) async throws -> Data? {
        let data = try await runCapturingStdout("/usr/bin/unzip", ["-p", apkPath, entryPath])
        return data.isEmpty ? nil : data
    }

    nonisolated private static func runCapturingStdout(_ executable: String, _ args: [String]) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: executable)
                process.arguments = args
                let outPipe = Pipe()
                process.standardOutput = outPipe
                process.standardError = Pipe()
                do {
                    try process.run()
                } catch {
                    continuation.resume(throwing: error)
                    return
                }
                // Сначала дочитываем stdout до EOF и только потом ждём завершения —
                // в обратном порядке крупный вывод (иконка на сотни КБ через
                // unzip -p) может переполнить буфер пайпа и подвесить процесс,
                // пока никто его не вычитывает.
                let data = outPipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                continuation.resume(returning: data)
            }
        }
    }

    /// Парсит вывод `aapt2 dump badging`: строки вида
    /// `application-icon-320:'res/mipmap-xhdpi-v4/ic_launcher.png'` — берёт
    /// путь с максимальной плотностью; если таких строк нет — падает на
    /// `icon='...'` из строки `application: label='...' icon='...'`.
    nonisolated private static func parseIconPath(fromBadging output: String) -> String? {
        var best: (density: Int, path: String)?
        var fallback: String?
        for rawLine in output.split(whereSeparator: \.isNewline) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("application-icon-") {
                let afterPrefix = line.dropFirst("application-icon-".count)
                guard let colonIdx = afterPrefix.firstIndex(of: ":"),
                      let density = Int(afterPrefix[..<colonIdx]),
                      let path = quotedValue(after: afterPrefix[afterPrefix.index(after: colonIdx)...]) else { continue }
                if best == nil || density > best!.density {
                    best = (density, path)
                }
            } else if line.hasPrefix("application:"), let range = line.range(of: "icon='") {
                let after = line[range.upperBound...]
                if let endQuote = after.firstIndex(of: "'") {
                    fallback = String(after[..<endQuote])
                }
            }
        }
        return best?.path ?? fallback
    }

    nonisolated private static func quotedValue(after substring: Substring) -> String? {
        guard let firstQuote = substring.firstIndex(of: "'") else { return nil }
        let rest = substring[substring.index(after: firstQuote)...]
        guard let secondQuote = rest.firstIndex(of: "'") else { return nil }
        return String(rest[..<secondQuote])
    }

    // MARK: - Дисковый кеш (~/Library/Caches/AdbShell/icons) — ключ по package
    // name; версия приложения не учитывается (лишний dumpsys на каждый пакет
    // только ради ключа кеша не стоит того), поэтому после смены иконки в
    // новой версии приложения на устройстве картинка обновится не раньше,
    // чем очистится кеш Mac.

    nonisolated private static var cacheDir: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("AdbShell/icons", isDirectory: true)
    }

    nonisolated private static func loadFromDiskCache(packageName: String) -> NSImage? {
        let url = cacheDir.appendingPathComponent("\(packageName).png")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return NSImage(data: data)
    }

    nonisolated private static func saveToDiskCache(packageName: String, data: Data) {
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        let url = cacheDir.appendingPathComponent("\(packageName).png")
        try? data.write(to: url)
    }
}
