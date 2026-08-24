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

    func revealInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([directoryURL])
    }
}
