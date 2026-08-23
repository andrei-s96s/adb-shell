import Foundation
import SwiftUI

@MainActor
final class AppsViewModel: ObservableObject {
    @Published var apps: [InstalledApp] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText: String = ""
    @Published var showSystemApps: Bool = false
    @Published var selectedPackage: String?

    @Published var isSelectionMode = false
    @Published var selectedForBatch: Set<String> = []
    @Published var isBatchWorking = false
    @Published var batchProgressText: String?

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
        selectedPackage = nil
        errorMessage = nil
        isSelectionMode = false
        selectedForBatch.removeAll()
    }

    func toggleSelectionMode() {
        isSelectionMode.toggle()
        if !isSelectionMode { selectedForBatch.removeAll() }
    }

    func toggleSelection(_ packageName: String) {
        if selectedForBatch.contains(packageName) {
            selectedForBatch.remove(packageName)
        } else {
            selectedForBatch.insert(packageName)
        }
    }

    func deleteSelected(serial: String) async {
        guard !selectedForBatch.isEmpty else { return }
        isBatchWorking = true
        defer { isBatchWorking = false; batchProgressText = nil }
        let packages = Array(selectedForBatch)
        for (idx, pkg) in packages.enumerated() {
            batchProgressText = "Удаление \(idx + 1)/\(packages.count): \(pkg)"
            try? await service.uninstall(serial: serial, packageName: pkg)
        }
        selectedForBatch.removeAll()
        isSelectionMode = false
        await load(serial: serial)
    }

    /// Устанавливает несколько APK по очереди, публикуя прогресс через callback
    /// (используется для отображения статуса каждого файла в UI).
    func installBatch(urls: [URL], serial: String, onFile: @escaping (URL, Result<String, Error>) -> Void) async {
        isBatchWorking = true
        defer { isBatchWorking = false; batchProgressText = nil }
        for (idx, url) in urls.enumerated() {
            batchProgressText = "Установка \(idx + 1)/\(urls.count): \(url.lastPathComponent)"
            do {
                let result = try await service.install(serial: serial, apkPath: url.path)
                onFile(url, .success(result))
            } catch {
                onFile(url, .failure(error))
            }
        }
        await load(serial: serial)
    }
}
