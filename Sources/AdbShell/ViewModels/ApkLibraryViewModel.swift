import Foundation
import SwiftUI
#if canImport(AppKit)
import AppKit
#endif

/// Локальный каталог, куда пользователь складывает .apk файлы —
/// перетаскиванием из Finder или кнопкой "Добавить...". Приложение
/// показывает его содержимое и умеет ставить любой файл на устройство.
/// Путь к каталогу настраиваемый и сохраняется между запусками.
@MainActor
final class ApkLibraryViewModel: ObservableObject {
    @Published var files: [ApkFile] = []
    @Published var errorMessage: String?
    @Published var installingPath: String?
    @Published var lastInstallMessage: String?
    @Published private(set) var directoryURL: URL
    /// Обновления с F-Droid для файлов библиотеки, ключ — ApkFile.path.
    /// Только для пользовательских решений: ничего не скачивается и не
    /// подменяется без явного нажатия кнопки.
    @Published var fdroidUpdates: [String: FDroidUpdateInfo] = [:]
    @Published var isCheckingFDroidUpdates = false
    @Published var updatingPath: String?

    private static let defaultsKey = "apkLibraryPath"

    init() {
        if let saved = UserDefaults.standard.string(forKey: Self.defaultsKey) {
            self.directoryURL = URL(fileURLWithPath: saved, isDirectory: true)
        } else {
            let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                ?? FileManager.default.homeDirectoryForCurrentUser
            self.directoryURL = base.appendingPathComponent("AdbShell/APK", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        refresh()
    }

    /// Открывает диалог выбора папки и переключает библиотеку на неё.
    func chooseDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.directoryURL = directoryURL
        panel.prompt = L("common.choose")
        panel.message = L("library.chooseFolder.message")
        guard panel.runModal() == .OK, let url = panel.url else { return }
        setDirectory(url)
    }

    func setDirectory(_ url: URL) {
        directoryURL = url
        UserDefaults.standard.set(url.path, forKey: Self.defaultsKey)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        fdroidUpdates.removeAll()
        refresh()
    }

    func refresh() {
        do {
            let items = try FileManager.default.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles]
            )
            files = items
                .filter { $0.pathExtension.lowercased() == "apk" }
                .map { url -> ApkFile in
                    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
                    return ApkFile(
                        path: url.path,
                        name: url.lastPathComponent,
                        sizeBytes: Int64(values?.fileSize ?? 0),
                        modified: values?.contentModificationDate ?? .distantPast
                    )
                }
                .sorted { $0.modified > $1.modified }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func importFiles(_ urls: [URL]) {
        for src in urls where src.pathExtension.lowercased() == "apk" {
            let dest = directoryURL.appendingPathComponent(src.lastPathComponent)
            do {
                if dest.path == src.path { continue }
                if FileManager.default.fileExists(atPath: dest.path) {
                    try FileManager.default.removeItem(at: dest)
                }
                if src.startAccessingSecurityScopedResource() {
                    defer { src.stopAccessingSecurityScopedResource() }
                    try FileManager.default.copyItem(at: src, to: dest)
                } else {
                    try FileManager.default.copyItem(at: src, to: dest)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        refresh()
    }

    func delete(_ file: ApkFile) {
        do {
            try FileManager.default.removeItem(at: file.url)
            fdroidUpdates.removeValue(forKey: file.path)
            refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func install(_ file: ApkFile, to serial: String, service: ADBService) async {
        installingPath = file.path
        defer { installingPath = nil }
        do {
            let result = try await service.install(serial: serial, apkPath: file.path)
            lastInstallMessage = result.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? L("library.installed", file.name) : result
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Ставит один APK сразу на все подключённые и готовые устройства,
    /// последовательно, чтобы прогресс/сообщения об ошибках были по одному устройству за раз.
    func installToAllDevices(_ file: ApkFile, service: ADBService) async {
        installingPath = file.path
        defer { installingPath = nil }
        let devices = (try? await service.listDevices())?.filter { $0.state.isReady } ?? []
        guard !devices.isEmpty else {
            errorMessage = L("library.install.noDevices")
            return
        }
        var successCount = 0
        var failures: [String] = []
        for device in devices {
            do {
                _ = try await service.install(serial: device.serial, apkPath: file.path)
                successCount += 1
            } catch {
                failures.append("\(device.displayName): \(error.localizedDescription)")
            }
        }
        if failures.isEmpty {
            lastInstallMessage = L("library.install.allDevices.success", file.name, successCount)
        } else {
            errorMessage = L("library.install.allDevices.partial", successCount, devices.count) + "\n" + failures.joined(separator: "\n")
        }
        NotificationService.notify(
            title: L("notify.installAll.title"),
            body: failures.isEmpty
                ? L("library.install.allDevices.success", file.name, successCount)
                : L("library.install.allDevices.partial", successCount, devices.count)
        )
    }

    /// Скачивает .apk по прямой ссылке в текущую библиотеку. Не проверяет
    /// Content-Type (некоторые CI/artifact-серверы отдают его неправильно) —
    /// полагается на то, что ссылка действительно отдаёт APK, и просто
    /// сохраняет файл под именем из URL (или переданным явно).
    func downloadFromURL(_ urlString: String, filename: String?) async {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespaces)), url.scheme != nil else {
            errorMessage = L("library.download.invalidURL")
            return
        }
        let name = (filename?.trimmingCharacters(in: .whitespaces)).flatMap { $0.isEmpty ? nil : $0 }
            ?? url.lastPathComponent
        let finalName = name.lowercased().hasSuffix(".apk") ? name : name + ".apk"
        let destination = directoryURL.appendingPathComponent(finalName)

        installingPath = "downloading:\(urlString)"
        defer { installingPath = nil }
        do {
            let (tmpURL, response) = try await URLSession.shared.download(from: url)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw NSError(domain: "ApkDownload", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: L("library.download.httpError", http.statusCode)])
            }
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: tmpURL, to: destination)
            refresh()
            lastInstallMessage = L("library.download.success", finalName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func revealInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([directoryURL])
    }

    /// Читает манифест каждого .apk в библиотеке через вшитый aapt2 (без
    /// устройства) и сверяет versionCode с каталогом F-Droid. Только
    /// обнаруживает доступные обновления — ничего не скачивает сама.
    func checkFDroidUpdatesInBackground() async {
        guard !isCheckingFDroidUpdates else { return }
        isCheckingFDroidUpdates = true
        defer { isCheckingFDroidUpdates = false }

        let currentFiles = files
        let maxConcurrent = 4
        await withTaskGroup(of: (String, FDroidUpdateInfo?).self) { group in
            var iterator = currentFiles.makeIterator()
            func addNext() {
                guard let file = iterator.next() else { return }
                group.addTask {
                    guard let info = try? await ApkInspectorService.inspect(apkPath: file.path),
                          let packageName = info.packageName,
                          let versionCodeString = info.versionCode,
                          let versionCode = Int(versionCodeString) else {
                        return (file.path, nil)
                    }
                    return (file.path, await FDroidUpdateChecker.checkUpdate(packageName: packageName, installedVersionCode: versionCode))
                }
            }
            for _ in 0..<maxConcurrent { addNext() }
            while let (path, info) = await group.next() {
                if let info {
                    fdroidUpdates[path] = info
                }
                addNext()
            }
        }
    }

    /// Скачивает более новую версию с F-Droid в библиотеку и удаляет старый
    /// файл. Выполняется только по явному нажатию кнопки пользователем —
    /// никогда автоматически.
    func downloadFDroidUpdate(for file: ApkFile) async {
        guard let update = fdroidUpdates[file.path] else { return }
        updatingPath = file.path
        defer { updatingPath = nil }
        do {
            let (tmpURL, response) = try await URLSession.shared.download(from: update.downloadURL)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                errorMessage = L("library.fdroid.downloadFailed")
                return
            }
            let destName = "\(update.packageName)_\(update.latestVersionCode).apk"
            let destination = directoryURL.appendingPathComponent(destName)
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: tmpURL, to: destination)
            if destination.path != file.path {
                try? FileManager.default.removeItem(at: file.url)
            }
            fdroidUpdates.removeValue(forKey: file.path)
            refresh()
            lastInstallMessage = L("library.fdroid.updated", update.latestVersionName ?? "\(update.latestVersionCode)")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
