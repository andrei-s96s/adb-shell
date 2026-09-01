import Foundation

@MainActor
final class PortForwardingViewModel: ObservableObject {
    @Published var forwards: [PortForwardRule] = []
    @Published var reverses: [PortForwardRule] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isWorking = false

    @Published var newForwardHost = ""
    @Published var newForwardDevice = ""
    @Published var newReverseDevice = ""
    @Published var newReverseHost = ""

    let service: ADBService

    init(service: ADBService) {
        self.service = service
    }

    func load(serial: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let f = service.listForwards(serial: serial)
            async let r = service.listReverses(serial: serial)
            let (fwd, rev) = try await (f, r)
            forwards = fwd
            reverses = rev
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addForward(serial: String) async {
        guard !newForwardHost.trimmingCharacters(in: .whitespaces).isEmpty,
              !newForwardDevice.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await service.addForward(
                serial: serial,
                hostSpec: normalizedSpec(newForwardHost),
                deviceSpec: normalizedSpec(newForwardDevice)
            )
            newForwardHost = ""
            newForwardDevice = ""
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeForward(_ rule: PortForwardRule, serial: String) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await service.removeForward(serial: serial, hostSpec: rule.hostSpec)
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addReverse(serial: String) async {
        guard !newReverseDevice.trimmingCharacters(in: .whitespaces).isEmpty,
              !newReverseHost.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await service.addReverse(
                serial: serial,
                deviceSpec: normalizedSpec(newReverseDevice),
                hostSpec: normalizedSpec(newReverseHost)
            )
            newReverseDevice = ""
            newReverseHost = ""
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeReverse(_ rule: PortForwardRule, serial: String) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await service.removeReverse(serial: serial, deviceSpec: rule.deviceSpec)
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Позволяет ввести просто "8080" вместо "tcp:8080" — удобнее для
    /// типичного случая; спецификации других видов (localabstract: и т.п.)
    /// всё равно принимаются как есть, если введены явно.
    private func normalizedSpec(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        return trimmed.contains(":") ? trimmed : "tcp:\(trimmed)"
    }
}
