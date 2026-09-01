import Foundation

@MainActor
final class DevicePropertiesViewModel: ObservableObject {
    @Published var properties: [DeviceProperty] = []
    @Published var searchText = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    let service: ADBService

    init(service: ADBService) {
        self.service = service
    }

    var filtered: [DeviceProperty] {
        guard !searchText.isEmpty else { return properties }
        return properties.filter {
            $0.key.localizedCaseInsensitiveContains(searchText) || $0.value.localizedCaseInsensitiveContains(searchText)
        }
    }

    func load(serial: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            properties = try await service.allProperties(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
