import Foundation

enum ApkInspectorError: LocalizedError {
    case aapt2NotFound

    var errorDescription: String? {
        switch self {
        case .aapt2NotFound: return L("apkInfo.error.aapt2NotFound")
        }
    }
}

/// Читает манифест локального .apk-файла через вшитый `aapt2 dump badging` —
/// без установки на устройство. Используется библиотекой APK для "Инфо".
enum ApkInspectorService {
    static func inspect(apkPath: String) async throws -> ApkManifestInfo {
        guard let aapt2 = IconService.locateAapt2() else {
            throw ApkInspectorError.aapt2NotFound
        }
        let output = try await runCapturingStdout(aapt2, ["dump", "badging", apkPath])
        guard let text = String(data: output, encoding: .utf8) else {
            return ApkBadgingParser.parse("")
        }
        return ApkBadgingParser.parse(text)
    }

    private static func runCapturingStdout(_ executable: String, _ args: [String]) async throws -> Data {
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
                let data = outPipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                continuation.resume(returning: data)
            }
        }
    }
}
