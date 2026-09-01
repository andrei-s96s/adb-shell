import Foundation

/// Достаёт IP-адрес устройства из вывода `adb shell ip route` — нужен, чтобы
/// после включения Wi-Fi отладки (`adb tcpip`) показать, куда подключаться
/// (`adb connect <ip>:<port>`), не заставляя лезть в Настройки → О телефоне.
enum IpRouteParser {
    static func parseDeviceIP(from output: String) -> String? {
        let lines = output.split(separator: "\n").map(String.init)
        // Предпочитаем Wi-Fi интерфейс (wlan*) — большинство прошивок его и
        // отдают первой строкой, но не полагаемся на порядок.
        let wlanLine = lines.first { $0.contains("wlan") && $0.contains(" src ") }
        let anyLine = lines.first { $0.contains(" src ") }
        guard let line = wlanLine ?? anyLine else { return nil }
        let parts = line.split(separator: " ").map(String.init)
        guard let srcIndex = parts.firstIndex(of: "src"), srcIndex + 1 < parts.count else { return nil }
        return parts[srcIndex + 1]
    }
}
