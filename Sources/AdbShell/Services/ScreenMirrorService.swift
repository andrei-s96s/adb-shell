import Foundation
import AppKit

enum MirrorError: LocalizedError {
    case scrcpyNotFound
    case launchFailed(String)

    var errorDescription: String? {
        switch self {
        case .scrcpyNotFound:
            return L("mirror.error.notFound")
        case .launchFailed(let message):
            return message
        }
    }
}

/// Зеркалирование экрана устройства через `scrcpy`
/// (https://github.com/Genymobile/scrcpy, Apache-2.0) — вшит в `.app` сборкой
/// build_app.sh, как и adb, отдельно ставить не нужно (в `swift run` — берётся
/// системный, если поставлен через Homebrew).
///
/// Полноценный live-видеопоток с вводом мыши/клавиатуры — отдельный движок
/// (H.264-декодирование + сервер на устройстве), который scrcpy уже решает надёжно
/// и открыто; переизобретать его в ADB Shell смысла нет. Здесь мы только находим
/// бинарник и запускаем его для нужного serial как внешний процесс — своё окно
/// scrcpy рисует сам.
@MainActor
final class ScreenMirrorService: ObservableObject {
    @Published private(set) var runningSerials: Set<String> = []

    private var processes: [String: Process] = [:]

    static func locateScrcpy() -> String? {
        // 1) scrcpy, вшитый в .app сборкой build_app.sh (официальный self-contained
        //    релиз с GitHub Genymobile/scrcpy) — как и с adb, отдельно ставить не нужно.
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("scrcpy").path,
           FileManager.default.isExecutableFile(atPath: bundled) {
            return bundled
        }
        // 2) системный scrcpy — для `swift run` и на случай, если пользователь
        //    поставил его сам (brew install scrcpy).
        let candidates = [
            "/opt/homebrew/bin/scrcpy",
            "/usr/local/bin/scrcpy",
            "/opt/local/bin/scrcpy"
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return path
        }
        return nil
    }

    /// Путь к вшитому `scrcpy-server` (для `SCRCPY_SERVER_PATH`). Если scrcpy
    /// системный — nil, он сам найдёт свой server рядом с собой.
    static func locateBundledServer() -> String? {
        guard let path = Bundle.main.resourceURL?.appendingPathComponent("scrcpy-server").path,
              FileManager.default.fileExists(atPath: path) else { return nil }
        return path
    }

    var isAvailable: Bool { Self.locateScrcpy() != nil }

    func isRunning(_ serial: String) -> Bool {
        runningSerials.contains(serial)
    }

    /// Запускает `scrcpy -s <serial>`, указывая ему на уже вшитый `adb` (переменная
    /// `ADB`) и вшитый `scrcpy-server` (`SCRCPY_SERVER_PATH`), чтобы не тянуть
    /// системные копии. Если для этого serial уже есть запущенный процесс — не
    /// открывает второе окно поверх него.
    func launch(serial: String, adbPath: String, windowFrame: (x: Int, y: Int, width: Int, height: Int)? = nil, recordPath: String? = nil) throws {
        guard let scrcpyPath = Self.locateScrcpy() else {
            throw MirrorError.scrcpyNotFound
        }
        guard processes[serial] == nil else { return }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: scrcpyPath)
        var args = ["-s", serial, "--window-title", serial]
        if let recordPath {
            args += ["--record", recordPath]
        }
        if let windowFrame {
            args += [
                "--window-x", String(windowFrame.x),
                "--window-y", String(windowFrame.y),
                "--window-width", String(windowFrame.width),
                "--window-height", String(windowFrame.height)
            ]
        }
        process.arguments = args

        var environment = ProcessInfo.processInfo.environment
        environment["ADB"] = adbPath
        if let serverPath = Self.locateBundledServer() {
            environment["SCRCPY_SERVER_PATH"] = serverPath
        }
        process.environment = environment

        process.terminationHandler = { [weak self] _ in
            Task { @MainActor in
                self?.processes[serial] = nil
                self?.runningSerials.remove(serial)
            }
        }

        do {
            try process.run()
        } catch {
            throw MirrorError.launchFailed(error.localizedDescription)
        }

        processes[serial] = process
        runningSerials.insert(serial)
    }

    /// Запускает scrcpy для каждого устройства и раскладывает их окна плиткой
    /// по видимой области главного экрана — так несколько зеркал не открываются
    /// друг поверх друга. Устройства, для которых зеркалирование уже идёт, пропускаются.
    func launchGrid(serials: [String], adbPath: String) {
        let targets = serials.filter { !isRunning($0) }
        guard !targets.isEmpty else { return }

        let screen = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 0, width: 1440, height: 900)
        let cols = max(1, Int(ceil(sqrt(Double(targets.count)))))
        let rows = max(1, Int(ceil(Double(targets.count) / Double(cols))))
        let tileWidth = Int(screen.width) / cols
        let tileHeight = Int(screen.height) / rows

        for (index, serial) in targets.enumerated() {
            let col = index % cols
            let row = index / cols
            let x = Int(screen.minX) + col * tileWidth
            let y = Int(screen.minY) + row * tileHeight
            try? launch(serial: serial, adbPath: adbPath, windowFrame: (x, y, tileWidth, tileHeight))
        }
    }
}
