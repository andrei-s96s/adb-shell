import Foundation

/// Результат сравнения списков установленных пакетов двух устройств —
/// только по именам пакетов (версии не сравниваются: это потребовало бы
/// отдельного dumpsys package на каждый пакет на каждом устройстве, что для
/// пары сотен приложений было бы неприемлемо медленно).
struct PackageDiffResult: Equatable {
    let onlyInA: [String]
    let onlyInB: [String]
    let commonCount: Int
}

enum PackageDiff {
    static func compare(a: [String], b: [String]) -> PackageDiffResult {
        let setA = Set(a)
        let setB = Set(b)
        return PackageDiffResult(
            onlyInA: setA.subtracting(setB).sorted(),
            onlyInB: setB.subtracting(setA).sorted(),
            commonCount: setA.intersection(setB).count
        )
    }
}
