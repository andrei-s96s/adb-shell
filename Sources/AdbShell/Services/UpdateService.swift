import Foundation
#if canImport(AppKit)
import AppKit
#endif

/// Текущая версия приложения — держать в паре с CFBundleShortVersionString в Resources/Info.plist.
enum AppVersion {
    static let current = "1.3.0"
}

private struct GitHubRelease: Decodable {
    let tag_name: String
    let html_url: String
    let assets: [Asset]

    struct Asset: Decodable {
        let name: String
        let browser_download_url: String
    }
}

enum UpdateState: Equatable {
    case idle
    case checking
    case upToDate
    case available(version: String, downloadURL: URL, releaseURL: URL)
    case downloading(progress: Double)
    case installing
    case error(String)
}

/// Проверка новых версий на GitHub Releases и самообновление приложения:
/// скачивает zip с собранным .app, распаковывает, подменяет текущий бандл и
/// перезапускается. Работает только когда приложение запущено как .app
/// (собрано через build_app.sh), не из `swift run`.
@MainActor
final class UpdateService: ObservableObject {
    @Published private(set) var state: UpdateState = .idle

    private let repo = "andrei-s96s/adb-shell"
    private var apiURL: URL { URL(string: "https://api.github.com/repos/\(repo)/releases/latest")! }

    var canSelfInstall: Bool {
        Bundle.main.bundlePath.hasSuffix(".app") && !Bundle.main.bundlePath.contains("/.build/")
    }

    func checkForUpdates() async {
        state = .checking
        do {
            var request = URLRequest(url: apiURL)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                state = .error("Нет ответа от GitHub")
                return
            }
            if http.statusCode == 404 {
                // В репозитории ещё нет ни одного опубликованного релиза — это не ошибка.
                state = .upToDate
                return
            }
            guard http.statusCode == 200 else {
                state = .error("GitHub вернул ошибку \(http.statusCode) при проверке обновлений")
                return
            }
            let release = try JSONDecoder().decode(GitHubRelease.self, from: data)
            let remoteVersion = release.tag_name.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))

            guard Self.isNewer(remoteVersion, than: AppVersion.current) else {
                state = .upToDate
                return
            }
            guard let asset = release.assets.first(where: { $0.name.hasSuffix(".zip") }),
                  let assetURL = URL(string: asset.browser_download_url),
                  let releaseURL = URL(string: release.html_url) else {
                state = .error("В релизе \(release.tag_name) нет .zip вложения")
                return
            }
            state = .available(version: remoteVersion, downloadURL: assetURL, releaseURL: releaseURL)
        } catch {
            state = .error("Не удалось проверить обновления: \(error.localizedDescription)")
        }
    }

    func openReleasePage(_ url: URL) {
        #if canImport(AppKit)
        NSWorkspace.shared.open(url)
        #endif
    }

    /// Скачивает .zip релиза, распаковывает и заменяет текущий .app, затем перезапускает.
    func downloadAndInstall(from url: URL) async {
        guard canSelfInstall else {
            state = .error("Автообновление доступно только для собранного .app (см. build_app.sh)")
            return
        }
        do {
            state = .downloading(progress: 0)
            let (tempZip, _) = try await URLSession.shared.download(from: url)

            let workDir = FileManager.default.temporaryDirectory.appendingPathComponent("AdbShellUpdate-\(UUID().uuidString)")
            try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
            let zipPath = workDir.appendingPathComponent("update.zip")
            try FileManager.default.moveItem(at: tempZip, to: zipPath)

            state = .installing

            try await run("/usr/bin/ditto", ["-x", "-k", zipPath.path, workDir.path])

            let extracted = try FileManager.default.contentsOfDirectory(at: workDir, includingPropertiesForKeys: nil)
                .first { $0.pathExtension == "app" }
            guard let newApp = extracted else {
                state = .error("В архиве не найден .app")
                return
            }

            // Снимаем карантин, если он всё же был проставлен при скачивании.
            try? await run("/usr/bin/xattr", ["-cr", newApp.path])
            // Ad-hoc подпись, как в build_app.sh — иначе Gatekeeper может отказать в запуске.
            try? await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", newApp.path])

            let currentAppPath = Bundle.main.bundlePath
            let currentAppURL = URL(fileURLWithPath: currentAppPath)
            let backupURL = currentAppURL.deletingLastPathComponent()
                .appendingPathComponent(currentAppURL.lastPathComponent + ".bak")

            if FileManager.default.fileExists(atPath: backupURL.path) {
                try? FileManager.default.removeItem(at: backupURL)
            }
            try FileManager.default.moveItem(at: currentAppURL, to: backupURL)
            do {
                try FileManager.default.moveItem(at: newApp, to: currentAppURL)
            } catch {
                // Откатываемся, если подмена не удалась.
                try? FileManager.default.moveItem(at: backupURL, to: currentAppURL)
                throw error
            }
            try? FileManager.default.removeItem(at: backupURL)
            try? FileManager.default.removeItem(at: workDir)

            relaunch(at: currentAppPath)
        } catch {
            state = .error("Обновление не удалось: \(error.localizedDescription)")
        }
    }

    private func relaunch(at path: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = [path]
        try? process.run()
        #if canImport(AppKit)
        NSApp.terminate(nil)
        #else
        exit(0)
        #endif
    }

    private func run(_ launchPath: String, _ args: [String]) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: launchPath)
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
                continuation.resume(throwing: ADBError.commandFailed(err.isEmpty ? "\(launchPath) завершился с ошибкой" : err))
            }
        }
    }

    /// Простое сравнение версий вида "1.2.3".
    nonisolated static func isNewer(_ remote: String, than local: String) -> Bool {
        func parts(_ s: String) -> [Int] {
            s.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 }
        }
        let r = parts(remote)
        let l = parts(local)
        for i in 0..<max(r.count, l.count) {
            let rv = i < r.count ? r[i] : 0
            let lv = i < l.count ? l[i] : 0
            if rv != lv { return rv > lv }
        }
        return false
    }
}
