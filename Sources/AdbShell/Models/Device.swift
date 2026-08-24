import Foundation

struct Device: Identifiable, Hashable {
    enum State: String {
        case device
        case offline
        case unauthorized
        case noPermissions = "no permissions"
        case unknown

        var label: String {
            switch self {
            case .device: return L("device.state.connected")
            case .offline: return L("device.state.offline")
            case .unauthorized: return L("device.state.unauthorized")
            case .noPermissions: return L("device.state.noPermissions")
            case .unknown: return L("device.state.unknown")
            }
        }

        var isReady: Bool { self == .device }
    }

    var id: String { serial }
    let serial: String
    let state: State
    var model: String?
    var product: String?
    var transportId: String?
    var isNetwork: Bool { serial.contains(":") }

    var displayName: String {
        model?.replacingOccurrences(of: "_", with: " ") ?? serial
    }
}
