import Foundation

/// Управляет одним живым процессом `adb logcat`, разбирая вывод построчно.
/// Не Sendable/actor-изолирован намеренно просто — используется только с MainActor ViewModel.
final class LogcatSession {
    private let adbPath: String
    private let serial: String
    private var process: Process?
    private var buffer = Data()

    init(adbPath: String, serial: String) {
        self.adbPath = adbPath
        self.serial = serial
    }

    var isRunning: Bool { process?.isRunning ?? false }

    func start(onLine: @escaping (String) -> Void) {
        stop()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: adbPath.hasPrefix("/") ? adbPath : "/usr/bin/env")
        var args = adbPath.hasPrefix("/") ? [String]() : ["adb"]
        args += ["-s", serial, "logcat", "-v", "threadtime"]
        process.arguments = args

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let self else { return }
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self.buffer.append(data)
            let newlineByte: UInt8 = 0x0A
            while let newlineIndex = self.buffer.firstIndex(of: newlineByte) {
                let lineData = self.buffer.subdata(in: self.buffer.startIndex..<newlineIndex)
                self.buffer.removeSubrange(self.buffer.startIndex...newlineIndex)
                if let line = String(data: lineData, encoding: .utf8), !line.isEmpty {
                    onLine(line)
                }
            }
        }

        do {
            try process.run()
            self.process = process
        } catch {
            onLine("[ошибка запуска adb logcat: \(error.localizedDescription)]")
        }
    }

    func clearDeviceBuffer() {
        let clearProcess = Process()
        clearProcess.executableURL = URL(fileURLWithPath: adbPath.hasPrefix("/") ? adbPath : "/usr/bin/env")
        var args = adbPath.hasPrefix("/") ? [String]() : ["adb"]
        args += ["-s", serial, "logcat", "-c"]
        clearProcess.arguments = args
        try? clearProcess.run()
    }

    func stop() {
        process?.terminate()
        process = nil
        buffer.removeAll()
    }

    deinit {
        process?.terminate()
    }
}
