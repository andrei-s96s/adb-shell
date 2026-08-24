import Foundation

@MainActor
final class DeviceCompareViewModel: ObservableObject {
    @Published var otherDevices: [Device] = []
    @Published var selectedOtherSerial: String?
    @Published var result: PackageDiffResult?
    @Published var isLoading = false
    @Published var errorMessage: String?

    let service: ADBService

    init(service: ADBService) {
        self.service = service
    }

    func loadOtherDevices(excluding serial: String) async {
        let all = (try? await service.listDevices())?.filter { $0.state.isReady && $0.serial != serial } ?? []
        otherDevices = all
        if selectedOtherSerial == nil {
            selectedOtherSerial = all.first?.serial
        }
    }

    func compare(currentSerial: String) async {
        guard let otherSerial = selectedOtherSerial else { return }
        isLoading = true
        errorMessage = nil
        result = nil
        defer { isLoading = false }
        do {
            async let appsA = service.listApps(serial: currentSerial)
            async let appsB = service.listApps(serial: otherSerial)
            let (a, b) = try await (appsA, appsB)
            result = PackageDiff.compare(a: a.map(\.packageName), b: b.map(\.packageName))
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
