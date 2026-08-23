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

    let service: ADBService

    init(service: ADBService) {
        self.service = service
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
    }
}
