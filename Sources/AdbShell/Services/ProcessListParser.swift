import Foundation

/// Разбор вывода `ps -A -o PID,PPID,USER,RSS,NAME` (toybox `ps` на Android 6+).
/// Первая строка — заголовок колонок, её пропускаем по нечисловому PID.
enum ProcessListParser {
    static func parse(_ output: String) -> [RunningProcess] {
        var result: [RunningProcess] = []
        for rawLine in output.split(separator: "\n") {
            let fields = rawLine.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
            guard fields.count >= 5, let pid = Int(fields[0]) else { continue }
            let ppid = Int(fields[1])
            let user = fields[2]
            let rss = Int(fields[3])
            let name = fields[4...].joined(separator: " ")
            result.append(RunningProcess(pid: pid, ppid: ppid, user: user, rssKB: rss, name: name))
        }
        return result
    }
}
