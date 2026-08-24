import Foundation

/// Одна строка вывода `ps -A -o PID,PPID,USER,RSS,NAME` на устройстве.
struct RunningProcess: Identifiable, Equatable {
    var id: Int { pid }
    let pid: Int
    let ppid: Int?
    let user: String
    /// Resident set size в килобайтах, если ядро его отдало.
    let rssKB: Int?
    let name: String
}
