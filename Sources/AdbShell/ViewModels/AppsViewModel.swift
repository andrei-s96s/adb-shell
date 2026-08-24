import Foundation
import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class AppsViewModel: ObservableObject {
    @Published var apps: [InstalledApp] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText: String = ""
    @Published var showSystemApps: Bool = false

    /// Мультивыбор в духе Finder: обычный клик выбирает одну строку, ⌘-клик
    /// добавляет/убирает, ⇧-клик выделяет диапазон от последнего клика — без
    /// отдельного режима "Выбрать", который раньше приходилось включать вручную.
    @Published var selectedForBatch: Set<String> = []
    var lastClickedPackage: String?

    @Published var isBatchWorking = false
    @Published var batchProgressText: String?
    @Published var bundleResults: [BundleOperationResult] = []

    /// Обновления, найденные в каталоге F-Droid для установленных пакетов —
    /// считается в фоне после загрузки списка, ничего не скачивает сама.
    @Published var fdroidUpdates: [String: FDroidUpdateInfo] = [:]
    @Published var isCheckingFDroidUpdates = false

    let service: ADBService

    init(service: ADBService) {
        self.service = service
        self.showSystemApps = UserDefaults.standard.bool(forKey: "defaultShowSystemApps")
    }

    var filteredApps: [InstalledApp] {
        apps
            .filter { showSystemApps || !$0.isSystem }
            .filter { searchText.isEmpty || $0.packageName.localizedCaseInsensitiveContains(searchText) }
    }

    /// Пакет, чьи детали показывать справа — только когда выбран ровно один.
    var focusedPackage: String? {
        selectedForBatch.count == 1 ? selectedForBatch.first : nil
    }

    func load(serial: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            apps = try await service.listApps(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reset() {
        apps = []
        selectedForBatch.removeAll()
        lastClickedPackage = nil
        errorMessage = nil
        fdroidUpdates.removeAll()
    }

    // MARK: - Выбор строк (⌘/⇧, как в Finder)

    func handleRowClick(_ packageName: String, modifiers: NSEvent.ModifierFlags) {
        if modifiers.contains(.command) {
            if selectedForBatch.contains(packageName) {
                selectedForBatch.remove(packageName)
            } else {
                selectedForBatch.insert(packageName)
            }
            lastClickedPackage = packageName
        } else if modifiers.contains(.shift), let anchor = lastClickedPackage {
            let order = filteredApps.map(\.packageName)
            if let anchorIdx = order.firstIndex(of: anchor), let clickedIdx = order.firstIndex(of: packageName) {
                let range = order[min(anchorIdx, clickedIdx)...max(anchorIdx, clickedIdx)]
                selectedForBatch.formUnion(range)
            } else {
                selectedForBatch = [packageName]
                lastClickedPackage = packageName
            }
        } else {
            selectedForBatch = [packageName]
            lastClickedPackage = packageName
        }
    }

    func clearSelection() {
        selectedForBatch.removeAll()
        lastClickedPackage = nil
    }

    func deleteSelected(serial: String) async {
        guard !selectedForBatch.isEmpty else { return }
        isBatchWorking = true
        defer { isBatchWorking = false; batchProgressText = nil }
        let packages = Array(selectedForBatch).sorted()
        for (idx, pkg) in packages.enumerated() {
            batchProgressText = L("apps.deleting.progress", idx + 1, packages.count, pkg)
            try? await service.uninstall(serial: serial, packageName: pkg)
        }
        clearSelection()
        await load(serial: serial)
        if packages.count > 1 {
            NotificationService.notify(title: L("notify.batchDelete.title"), body: L("notify.batchDelete.body", packages.count))
        }
    }

    /// Устанавливает несколько APK по очереди, публикуя прогресс через callback
    /// (используется для отображения статуса каждого файла в UI).
    func installBatch(urls: [URL], serial: String, onFile: @escaping (URL, Result<String, Error>) -> Void) async {
        isBatchWorking = true
        defer { isBatchWorking = false; batchProgressText = nil }
        for (idx, url) in urls.enumerated() {
            batchProgressText = L("apps.installing.progress", idx + 1, urls.count, url.lastPathComponent)
            do {
                let result = try await service.install(serial: serial, apkPath: url.path)
                onFile(url, .success(result))
            } catch {
                onFile(url, .failure(error))
            }
        }
        await load(serial: serial)
        if urls.count > 1 {
            NotificationService.notify(title: L("notify.batchInstall.title"), body: L("notify.batchInstall.body", urls.count))
        }
    }

    // MARK: - Обновления через F-Droid

    /// Сверяет установленные пользовательские приложения с каталогом F-Droid в
    /// фоне: один bulk-запрос versionCode со всего устройства, дальше — сетевые
    /// запросы к F-Droid с ограничением параллелизма, чтобы не заваливать сеть.
    /// Ничего не скачивает и не ставит — только заполняет fdroidUpdates.
    func checkFDroidUpdatesInBackground(serial: String) async {
        guard !isCheckingFDroidUpdates else { return }
        isCheckingFDroidUpdates = true
        defer { isCheckingFDroidUpdates = false }

        guard let versionCodes = try? await service.installedVersionCodes(serial: serial) else { return }
        let candidates = apps.filter { !$0.isSystem }.compactMap { app -> (String, Int)? in
            guard let code = versionCodes[app.packageName] else { return nil }
            return (app.packageName, code)
        }

        let maxConcurrent = 4
        await withTaskGroup(of: (String, FDroidUpdateInfo?).self) { group in
            var iterator = candidates.makeIterator()

            func addNext() {
                guard let (pkg, code) = iterator.next() else { return }
                group.addTask {
                    (pkg, await FDroidUpdateChecker.checkUpdate(packageName: pkg, installedVersionCode: code))
                }
            }
            for _ in 0..<maxConcurrent { addNext() }

            while let (pkg, info) = await group.next() {
                if let info { fdroidUpdates[pkg] = info }
                addNext()
            }
        }
    }

    // MARK: - Наборы приложений (экспорт/импорт с разрешениями)

    /// Экспортирует выбранные приложения вместе с их выданными runtime-разрешениями
    /// в один .zip: apk каждого приложения + manifest.json со списком разрешений.
    /// На другом устройстве такой .zip можно поставить через importBundle —
    /// приложения установятся и получат те же разрешения без ручной настройки.
    func exportSelected(serial: String) async {
        guard !selectedForBatch.isEmpty else { return }

        let panel = NSSavePanel()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        panel.nameFieldStringValue = "apps-export-\(formatter.string(from: Date())).zip"
        panel.allowedContentTypes = [.zip]
        guard panel.runModal() == .OK, let destinationZip = panel.url else { return }

        isBatchWorking = true
        bundleResults = []
        defer { isBatchWorking = false; batchProgressText = nil }

        let workDir = FileManager.default.temporaryDirectory.appendingPathComponent("AdbShellExport-\(UUID().uuidString)")
        let apksDir = workDir.appendingPathComponent(AppBundleManifest.apksSubdirectory)
        try? FileManager.default.createDirectory(at: apksDir, withIntermediateDirectories: true)

        var entries: [AppBundleManifest.Entry] = []
        let packages = Array(selectedForBatch).sorted()

        for (idx, pkg) in packages.enumerated() {
            batchProgressText = L("apps.export.progress", idx + 1, packages.count, pkg)
            do {
                let detail = try await service.appDetail(serial: serial, packageName: pkg)
                let apkPaths = try await service.apkPaths(serial: serial, packageName: pkg)
                guard let basePath = apkPaths.first(where: { $0.hasSuffix("base.apk") }) ?? apkPaths.first else {
                    bundleResults.append(BundleOperationResult(packageName: pkg, success: false, message: L("apps.export.noApk")))
                    continue
                }
                let fileName = "\(pkg).apk"
                let localApk = apksDir.appendingPathComponent(fileName)
                try await service.pull(serial: serial, remotePath: basePath, localPath: localApk.path)

                let grantedRuntime = detail.permissions.filter { $0.isRuntime && $0.granted }.map(\.name)
                entries.append(
                    AppBundleManifest.Entry(
                        packageName: pkg,
                        apkFileName: fileName,
                        versionName: detail.versionName,
                        permissions: grantedRuntime
                    )
                )
                bundleResults.append(
                    BundleOperationResult(packageName: pkg, success: true, message: L("apps.export.permCount", grantedRuntime.count))
                )
            } catch {
                bundleResults.append(BundleOperationResult(packageName: pkg, success: false, message: error.localizedDescription))
            }
        }

        guard !entries.isEmpty else {
            errorMessage = L("apps.export.nothingExported")
            try? FileManager.default.removeItem(at: workDir)
            return
        }

        do {
            let manifest = AppBundleManifest(exportedAt: Date(), sourceDeviceModel: nil, entries: entries)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(manifest)
            try data.write(to: workDir.appendingPathComponent(AppBundleManifest.manifestFileName))

            if FileManager.default.fileExists(atPath: destinationZip.path) {
                try FileManager.default.removeItem(at: destinationZip)
            }
            try await ZipUtil.zipContents(of: workDir, to: destinationZip)
            NSWorkspace.shared.activateFileViewerSelecting([destinationZip])
        } catch {
            errorMessage = error.localizedDescription
        }

        try? FileManager.default.removeItem(at: workDir)
        clearSelection()
    }

    /// Устанавливает набор из .zip (см. exportSelected): каждый apk + выдача
    /// сохранённых runtime-разрешений через pm grant.
    func importBundle(from zipURL: URL, serial: String) async {
        isBatchWorking = true
        bundleResults = []
        defer { isBatchWorking = false; batchProgressText = nil }

        let workDir = FileManager.default.temporaryDirectory.appendingPathComponent("AdbShellImport-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: workDir) }

        do {
            try await ZipUtil.unzip(archive: zipURL, to: workDir)
            let manifestData = try Data(contentsOf: workDir.appendingPathComponent(AppBundleManifest.manifestFileName))
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let manifest = try decoder.decode(AppBundleManifest.self, from: manifestData)

            for (idx, entry) in manifest.entries.enumerated() {
                batchProgressText = L("apps.import.progress", idx + 1, manifest.entries.count, entry.packageName)
                let apkURL = workDir.appendingPathComponent(AppBundleManifest.apksSubdirectory).appendingPathComponent(entry.apkFileName)
                guard FileManager.default.fileExists(atPath: apkURL.path) else {
                    bundleResults.append(BundleOperationResult(packageName: entry.packageName, success: false, message: L("apps.import.apkMissing")))
                    continue
                }
                do {
                    _ = try await service.install(serial: serial, apkPath: apkURL.path)
                    var grantedCount = 0
                    for permission in entry.permissions {
                        do {
                            try await service.grantPermission(serial: serial, packageName: entry.packageName, permission: permission)
                            grantedCount += 1
                        } catch {
                            // Не все разрешения обязаны существовать на целевой версии Android — не прерываем импорт.
                        }
                    }
                    bundleResults.append(
                        BundleOperationResult(packageName: entry.packageName, success: true, message: L("apps.import.grantedCount", grantedCount, entry.permissions.count))
                    )
                } catch {
                    bundleResults.append(BundleOperationResult(packageName: entry.packageName, success: false, message: error.localizedDescription))
                }
            }
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
