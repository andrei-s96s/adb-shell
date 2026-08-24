import Foundation

@MainActor
final class CrashTracesViewModel: ObservableObject {
    @Published var files: [CrashTraceFile] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var selected: CrashTraceFile?
    @Published var traceContent: String?
    @Published var isLoadingContent = false

    let service: ADBService

    init(service: ADBService) {
        self.service = service
    }

    func load(serial: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            files = try await service.crashTraces(serial: serial).sorted { $0.name > $1.name }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func open(_ file: CrashTraceFile, serial: String) async {
        selected = file
        traceContent = nil
        isLoadingContent = true
        defer { isLoadingContent = false }
        do {
            traceContent = try await service.readCrashTrace(serial: serial, path: file.path)
        } catch {
            traceContent = error.localizedDescription
        }
    }
}
