import Foundation

enum ADBError: LocalizedError {
    case adbNotFound
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .adbNotFound:
            return L("error.adbNotFound")
        case .commandFailed(let message):
            return message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? L("error.commandFailed") : message
        }
    }
}

struct ProcessResult {
    let stdout: String
    let stderr: String
    let exitCode: Int32

    var combined: String {
        [stdout, stderr].filter { !$0.isEmpty }.joined(separator: "\n")
    }
}

/// Тонкая обёртка над CLI `adb`, вызывающая процесс и парсящая его вывод.
final class ADBService {
    let adbPath: String

    init() {
        self.adbPath = ADBService.locateADB()
    }

    static func locateADB() -> String {
        // 1) adb, вшитый в .app сборкой build_app.sh — так релиз не требует
        //    отдельной установки Android Platform Tools на машине пользователя.
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("adb").path,
           FileManager.default.isExecutableFile(atPath: bundled) {
            return bundled
        }
        // 2) системный adb — для `swift run` в разработке и на случай,
        //    если пользователь всё же поставил Platform Tools сам.
        let candidates = [
            "/opt/homebrew/bin/adb",
            "/usr/local/bin/adb",
            "/usr/bin/adb"
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return path
        }
        return "adb"
    }

    var isAvailable: Bool {
        FileManager.default.isExecutableFile(atPath: adbPath) || adbPath == "adb"
    }

    // MARK: - Низкоуровневый запуск

    @discardableResult
    func run(_ args: [String], serial: String? = nil, timeout: TimeInterval? = nil) async throws -> ProcessResult {
        let adbPath = self.adbPath
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                var allArgs: [String] = []
                if let serial {
                    allArgs += ["-s", serial]
                }
                allArgs += args

                let process = Process()
                process.executableURL = URL(fileURLWithPath: adbPath.hasPrefix("/") ? adbPath : "/usr/bin/env")
                process.arguments = adbPath.hasPrefix("/") ? allArgs : (["adb"] + allArgs)

                let outPipe = Pipe()
                let errPipe = Pipe()
                process.standardOutput = outPipe
                process.standardError = errPipe

                do {
                    try process.run()
                } catch {
                    continuation.resume(throwing: ADBError.commandFailed(L("error.adbLaunchFailed", error.localizedDescription)))
                    return
                }

                process.waitUntilExit()

                let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
                let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
                let out = String(data: outData, encoding: .utf8) ?? ""
                let err = String(data: errData, encoding: .utf8) ?? ""

                continuation.resume(returning: ProcessResult(stdout: out, stderr: err, exitCode: process.terminationStatus))
            }
        }
    }

    // MARK: - Устройства

    func listDevices() async throws -> [Device] {
        let result = try await run(["devices", "-l"])
        return Self.parseDevices(from: result.stdout)
    }

    /// Парсинг вывода `adb devices -l` — вынесено в чистую функцию для юнит-тестов.
    static func parseDevices(from output: String) -> [Device] {
        var devices: [Device] = []
        let lines = output.split(separator: "\n").map(String.init)
        for line in lines {
            if line.hasPrefix("List of devices") { continue }
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            let parts = trimmed.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
            guard parts.count >= 2 else { continue }
            let serial = parts[0]
            let stateRaw = parts[1]
            let state = Device.State(rawValue: stateRaw) ?? .unknown

            var model: String?
            var product: String?
            var transportId: String?
            for token in parts.dropFirst(2) {
                if token.hasPrefix("model:") { model = String(token.dropFirst("model:".count)) }
                if token.hasPrefix("product:") { product = String(token.dropFirst("product:".count)) }
                if token.hasPrefix("transport_id:") { transportId = String(token.dropFirst("transport_id:".count)) }
            }
            devices.append(Device(serial: serial, state: state, model: model, product: product, transportId: transportId))
        }
        return devices
    }

    func connect(host: String) async throws -> String {
        let result = try await run(["connect", host])
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
        return result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func disconnect(serial: String) async throws {
        let result = try await run(["disconnect", serial])
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    /// Сопряжение по коду для Android 11+ wireless debugging
    /// (Настройки → Для разработчиков → Отладка по Wi-Fi → Сопряжение с
    /// устройством по коду — там показаны host:port для пейринга и код).
    /// После успешного пейринга нужно ещё `connect` на отдельный порт
    /// подключения, который Android покажет на том же экране.
    func pair(hostPort: String, code: String) async throws -> String {
        let result = try await run(["pair", hostPort, code])
        let combined = result.combined
        if result.exitCode != 0 || combined.localizedCaseInsensitiveContains("failed") {
            throw ADBError.commandFailed(combined.isEmpty ? L("error.pairFailed") : combined)
        }
        return combined
    }

    /// Устройства с включённой беспроводной отладкой (Android 11+), найденные
    /// в локальной сети через mDNS/Bonjour — без ручного ввода IP.
    func discoverMdnsDevices() async throws -> [MdnsDevice] {
        let result = try await run(["mdns", "services"])
        return MdnsParser.parse(result.stdout)
    }

    // MARK: - Приложения

    func listApps(serial: String) async throws -> [InstalledApp] {
        async let allResult = run(["shell", "pm", "list", "packages"], serial: serial)
        async let userResult = run(["shell", "pm", "list", "packages", "-3"], serial: serial)
        async let disabledResult = run(["shell", "pm", "list", "packages", "-d"], serial: serial)

        let all = try await allResult
        let user = try await userResult
        let disabled = try await disabledResult

        return Self.mergeApps(all: all.stdout, user: user.stdout, disabled: disabled.stdout)
    }

    /// Склеивает три вывода `pm list packages` в список приложений с флагами
    /// isSystem/isEnabled — вынесено в чистую функцию для юнит-тестов.
    static func mergeApps(all: String, user: String, disabled: String) -> [InstalledApp] {
        func packageSet(from output: String) -> Set<String> {
            Set(output.split(separator: "\n").compactMap { line -> String? in
                let s = line.trimmingCharacters(in: .whitespaces)
                guard s.hasPrefix("package:") else { return nil }
                return String(s.dropFirst("package:".count))
            })
        }

        let allSet = packageSet(from: all)
        let userSet = packageSet(from: user)
        let disabledSet = packageSet(from: disabled)

        return allSet.map { pkg in
            InstalledApp(packageName: pkg, isSystem: !userSet.contains(pkg), isEnabled: !disabledSet.contains(pkg))
        }.sorted { $0.packageName.lowercased() < $1.packageName.lowercased() }
    }

    func appDetail(serial: String, packageName: String) async throws -> AppDetail {
        let result = try await run(["shell", "dumpsys", "package", packageName], serial: serial)
        return DumpsysParser.parseAppDetail(packageName: packageName, output: result.stdout)
    }

    func install(serial: String, apkPath: String) async throws -> String {
        let result = try await run(["install", "-r", "-g", apkPath], serial: serial, timeout: 120)
        let combined = result.combined
        if result.exitCode != 0 || combined.contains("Failure") {
            throw ADBError.commandFailed(combined)
        }
        return combined
    }

    func uninstall(serial: String, packageName: String) async throws {
        let result = try await run(["uninstall", packageName], serial: serial)
        let combined = result.combined
        if result.exitCode != 0 || combined.contains("Failure") {
            throw ADBError.commandFailed(combined)
        }
    }

    /// Пути к APK установленного пакета (`pm path`) — может быть несколько для split APK.
    func apkPaths(serial: String, packageName: String) async throws -> [String] {
        let result = try await run(["shell", "pm", "path", packageName], serial: serial)
        let paths = result.stdout.split(separator: "\n").compactMap { line -> String? in
            let s = line.trimmingCharacters(in: .whitespaces)
            guard s.hasPrefix("package:") else { return nil }
            return String(s.dropFirst("package:".count))
        }
        guard !paths.isEmpty else {
            throw ADBError.commandFailed(result.combined.isEmpty ? L("error.apkPathNotFound") : result.combined)
        }
        return paths
    }

    // MARK: - Файлы устройства

    func listDirectory(serial: String, path: String) async throws -> [RemoteFile] {
        let result = try await run(["shell", "ls", "-la", path], serial: serial)
        if result.stdout.isEmpty && !result.stderr.isEmpty {
            throw ADBError.commandFailed(result.stderr)
        }
        return RemoteFileParser.parse(output: result.stdout, parentPath: path)
    }

    func push(serial: String, localPath: String, remotePath: String) async throws {
        let result = try await run(["push", localPath, remotePath], serial: serial, timeout: 300)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func pull(serial: String, remotePath: String, localPath: String) async throws {
        let result = try await run(["pull", remotePath, localPath], serial: serial, timeout: 300)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func makeDirectory(serial: String, path: String) async throws {
        let result = try await run(["shell", "mkdir", "-p", path], serial: serial)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func removeRemote(serial: String, path: String, recursive: Bool) async throws {
        var args = ["shell", "rm"]
        args.append(recursive ? "-rf" : "-f")
        args.append(path)
        let result = try await run(args, serial: serial)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func forceStop(serial: String, packageName: String) async throws {
        try await run(["shell", "am", "force-stop", packageName], serial: serial)
    }

    func clearData(serial: String, packageName: String) async throws {
        let result = try await run(["shell", "pm", "clear", packageName], serial: serial)
        if result.stdout.contains("Failed") {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func setEnabled(serial: String, packageName: String, enabled: Bool) async throws {
        let subcommand = enabled ? "enable" : "disable-user"
        var args = ["shell", "pm", subcommand]
        if !enabled { args += ["--user", "0"] }
        args.append(packageName)
        let result = try await run(args, serial: serial)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func grantPermission(serial: String, packageName: String, permission: String) async throws {
        let result = try await run(["shell", "pm", "grant", packageName, permission], serial: serial)
        if result.exitCode != 0 || !result.stderr.isEmpty {
            throw ADBError.commandFailed(result.combined)
        }
    }

    func revokePermission(serial: String, packageName: String, permission: String) async throws {
        let result = try await run(["shell", "pm", "revoke", packageName, permission], serial: serial)
        if result.exitCode != 0 || !result.stderr.isEmpty {
            throw ADBError.commandFailed(result.combined)
        }
    }

    /// Короткая строка вида "Android 13 · SDK 33" для шапки устройства.
    func buildFingerprint(serial: String) async throws -> String {
        async let releaseResult = run(["shell", "getprop", "ro.build.version.release"], serial: serial)
        async let sdkResult = run(["shell", "getprop", "ro.build.version.sdk"], serial: serial)
        let release = try await releaseResult.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        let sdk = try await sdkResult.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        var parts: [String] = []
        if !release.isEmpty { parts.append("Android \(release)") }
        if !sdk.isEmpty { parts.append("SDK \(sdk)") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Мониторинг

    /// Снимок CPU/памяти/батареи устройства для вкладки "Мониторинг".
    /// Три независимые shell-команды запускаются параллельно, чтобы не растягивать
    /// интервал опроса — каждая по отдельности быстрая, но последовательно давали бы заметный лаг.
    func deviceStats(serial: String) async throws -> DeviceStats {
        async let cpuResult = run(["shell", "dumpsys", "cpuinfo"], serial: serial)
        async let memResult = run(["shell", "cat", "/proc/meminfo"], serial: serial)
        async let batteryResult = run(["shell", "dumpsys", "battery"], serial: serial)
        return DeviceStatsParser.parse(
            cpuOutput: try await cpuResult.combined,
            memOutput: try await memResult.combined,
            batteryOutput: try await batteryResult.combined
        )
    }

    /// Суммарные RX/TX байты приложения с последнего сброса счётчиков netstats
    /// (обычно с загрузки устройства). Вызывающая сторона сама считает дельту
    /// между двумя опросами, чтобы получить скорость.
    func networkUsage(serial: String, uid: Int) async throws -> (rxBytes: Int64, txBytes: Int64) {
        let result = try await run(["shell", "dumpsys", "netstats", "detail"], serial: serial)
        return NetworkUsageParser.parse(output: result.combined, uid: uid)
    }

    func runningProcesses(serial: String) async throws -> [RunningProcess] {
        let result = try await run(["shell", "ps", "-A", "-o", "PID,PPID,USER,RSS,NAME"], serial: serial)
        return ProcessListParser.parse(result.combined)
    }

    /// Убивает процесс по PID. Без root работает только для процессов того же UID,
    /// что и adb shell — на остальных вернёт permission denied, это ожидаемо.
    func killProcess(serial: String, pid: Int) async throws {
        let result = try await run(["shell", "kill", "-9", String(pid)], serial: serial)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
    }

    // MARK: - ANR / tombstones

    /// Список файлов в `/data/anr/` и `/data/tombstones/`. Без root оба каталога
    /// обычно недоступны (`Permission denied`) — в этом случае просто пропускаем
    /// соответствующую директорию, а не считаем это ошибкой всей операции.
    func crashTraces(serial: String) async throws -> [CrashTraceFile] {
        async let anrResult = run(["shell", "ls", "-1", "/data/anr/"], serial: serial)
        async let tombResult = run(["shell", "ls", "-1", "/data/tombstones/"], serial: serial)

        var files: [CrashTraceFile] = []
        if let anr = try? await anrResult, anr.exitCode == 0 {
            files += parseListing(anr.stdout, dir: "/data/anr/", kind: .anr)
        }
        if let tomb = try? await tombResult, tomb.exitCode == 0 {
            files += parseListing(tomb.stdout, dir: "/data/tombstones/", kind: .tombstone)
        }
        return files
    }

    private func parseListing(_ stdout: String, dir: String, kind: CrashTraceFile.Kind) -> [CrashTraceFile] {
        stdout.split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && $0 != "." && $0 != ".." }
            .map { CrashTraceFile(path: dir + $0, name: $0, kind: kind) }
    }

    /// Хвост файла трейса — полные tombstone-файлы могут быть большими,
    /// показываем последние ~30000 байт, обычно там самое важное (стек, сигнал).
    func readCrashTrace(serial: String, path: String) async throws -> String {
        let result = try await run(["shell", "tail", "-c", "30000", path], serial: serial)
        if result.exitCode != 0 {
            throw ADBError.commandFailed(result.combined)
        }
        return result.stdout
    }

    // MARK: - Logcat

    func makeLogcatSession(serial: String) -> LogcatSession {
        LogcatSession(adbPath: adbPath, serial: serial)
    }

    // MARK: - Прочее

    func shell(serial: String, command: String) async throws -> String {
        let result = try await run(["shell", command], serial: serial)
        return result.combined
    }

    func reboot(serial: String) async throws {
        try await run(["reboot"], serial: serial)
    }

    func rebootToRecovery(serial: String) async throws {
        try await run(["reboot", "recovery"], serial: serial)
    }

    func rebootToBootloader(serial: String) async throws {
        try await run(["reboot", "bootloader"], serial: serial)
    }

    /// `adb root` перезапускает adbd с правами root на устройстве — работает
    /// только на userdebug/eng сборках, на user-сборках вернёт ошибку.
    @discardableResult
    func rootAdb(serial: String) async throws -> String {
        let result = try await run(["root"], serial: serial)
        return result.combined
    }

    /// `adb remount` — перемонтирует системные разделы в RW (после adb root).
    @discardableResult
    func remount(serial: String) async throws -> String {
        let result = try await run(["remount"], serial: serial)
        return result.combined
    }

    func screenshot(serial: String) async throws -> Data {
        let adbPath = self.adbPath
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: adbPath.hasPrefix("/") ? adbPath : "/usr/bin/env")
                var args = adbPath.hasPrefix("/") ? [String]() : ["adb"]
                args += ["-s", serial, "exec-out", "screencap", "-p"]
                process.arguments = args
                let outPipe = Pipe()
                process.standardOutput = outPipe
                process.standardError = Pipe()
                do {
                    try process.run()
                } catch {
                    continuation.resume(throwing: ADBError.commandFailed(error.localizedDescription))
                    return
                }
                let data = outPipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                continuation.resume(returning: data)
            }
        }
    }
}
