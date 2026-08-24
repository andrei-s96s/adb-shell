import Foundation

/// Тонкая обёртка над `/usr/bin/ditto` для zip/unzip — без внешних зависимостей,
/// тот же инструмент уже используется в build_app.sh и UpdateService.
enum ZipUtil {
    static func zipContents(of directory: URL, to destinationZip: URL) async throws {
        try await run(["-c", "-k", "--sequesterRsrc", directory.path, destinationZip.path])
    }

    static func unzip(archive: URL, to destinationDir: URL) async throws {
        try? FileManager.default.createDirectory(at: destinationDir, withIntermediateDirectories: true)
        try await run(["-x", "-k", archive.path, destinationDir.path])
    }

    private static func run(_ args: [String]) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
            process.arguments = args
            let errPipe = Pipe()
            process.standardError = errPipe
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
                return
            }
            process.waitUntilExit()
            if process.terminationStatus == 0 {
                continuation.resume(returning: ())
            } else {
                let err = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                continuation.resume(throwing: ADBError.commandFailed(err.isEmpty ? "ditto завершился с ошибкой" : err))
            }
        }
    }
}
