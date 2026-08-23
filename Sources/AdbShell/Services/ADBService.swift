import Foundation

enum ADBError: LocalizedError {
    case adbNotFound
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .adbNotFound:
            return "Не найден исполняемый файл adb. Установите Android Platform Tools (brew install android-platform-tools)."
        case .commandFailed(let message):
            return message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Команда adb завершилась с ошибкой." : message
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

    private static func locateADB() -> String {
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
                    continuation.resume(throwing: ADBError.commandFailed("Не удалось запустить adb: \(error.localizedDescription)"))
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

    // MARK: - Прочее

    func shell(serial: String, command: String) async throws -> String {
        let result = try await run(["shell", command], serial: serial)
        return result.combined
    }

    func reboot(serial: String) async throws {
        try await run(["reboot"], serial: serial)
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
