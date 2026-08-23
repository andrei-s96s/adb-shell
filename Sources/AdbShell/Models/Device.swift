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
            case .device: return "Подключено"
            case .offline: return "Не отвечает"
            case .unauthorized: return "Не авторизовано"
            case .noPermissions: return "Нет прав"
            case .unknown: return "Неизвестно"
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
