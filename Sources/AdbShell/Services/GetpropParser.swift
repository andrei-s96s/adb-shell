import Foundation

/// Одно системное свойство устройства (`adb shell getprop`).
struct DeviceProperty: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let value: String
}

/// Парсинг вывода `adb shell getprop` — строки вида "[key]: [value]".
/// Значение может быть пустым (`[key]: []`) — это валидное свойство, не ошибка.
enum GetpropParser {
    static func parse(_ output: String) -> [DeviceProperty] {
        output.split(separator: "\n").compactMap { line -> DeviceProperty? in
            guard let colonRange = line.range(of: "]: [") else { return nil }
            let keyPart = line[line.startIndex..<colonRange.lowerBound]
            let valuePart = line[colonRange.upperBound...]
            guard keyPart.hasPrefix("[") else { return nil }
            let key = String(keyPart.dropFirst())
            var value = String(valuePart)
            if value.hasSuffix("]") { value.removeLast() }
            return DeviceProperty(key: key, value: value)
        }
        .sorted { $0.key < $1.key }
    }
}
