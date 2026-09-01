import Foundation

/// Одно правило проброса порта adb — либо forward (соединения на Mac
/// пробрасываются на устройство), либо reverse (соединения на устройстве
/// пробрасываются на Mac). hostSpec/deviceSpec — в формате adb, например
/// "tcp:8080".
struct PortForwardRule: Identifiable, Hashable {
    enum Direction: String {
        case forward
        case reverse
    }

    var id: String { "\(direction.rawValue)-\(hostSpec)-\(deviceSpec)" }
    let direction: Direction
    /// Порт/сокет на Mac.
    let hostSpec: String
    /// Порт/сокет на устройстве.
    let deviceSpec: String
}
