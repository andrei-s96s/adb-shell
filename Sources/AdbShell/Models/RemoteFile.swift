import Foundation

struct RemoteFile: Identifiable, Hashable {
    var id: String { path }
    let name: String
    let path: String
    let isDirectory: Bool
    let isSymlink: Bool
    let sizeBytes: Int64?
    let permissions: String
    let modified: String?

    static func joinPath(_ parent: String, _ name: String) -> String {
        parent.hasSuffix("/") ? parent + name : parent + "/" + name
    }

    var sizeString: String? {
        guard let sizeBytes else { return nil }
        return ByteCountFormatter.string(fromByteCount: sizeBytes, countStyle: .file)
    }
}

/// Парсинг вывода `adb shell ls -la <path>` (формат toybox/coreutils):
/// "drwxr-xr-x 2 root root 4096 2024-05-01 10:00 folder"
/// "-rw-r--r-- 1 root root 1024 2024-05-01 10:00 file.txt"
/// "lrwxrwxrwx 1 root root   12 2024-05-01 10:00 link -> target"
/// Строки, не подходящие под формат (заголовок "total N", ошибки), пропускаются.
enum RemoteFileParser {
    private static let regex = try! NSRegularExpression(
        pattern: #"^([bcdlpsD-][-rwxsStT]{9})\S*\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$"#
    )

    static func parse(output: String, parentPath: String) -> [RemoteFile] {
        var results: [RemoteFile] = []
        for rawLine in output.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine).trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.hasPrefix("total ") else { continue }

            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            guard let match = regex.firstMatch(in: line, range: range) else { continue }

            func group(_ idx: Int) -> String {
                guard let r = Range(match.range(at: idx), in: line) else { return "" }
                return String(line[r])
            }

            let permissions = group(1)
            let sizeString = group(5)
            let date = group(6)
            let time = group(7)
            var name = group(8)

            let isDirectory = permissions.hasPrefix("d")
            let isSymlink = permissions.hasPrefix("l")

            if isSymlink, let arrowRange = name.range(of: " -> ") {
                name = String(name[name.startIndex..<arrowRange.lowerBound])
            }
            guard name != ".", name != ".." else { continue }

            results.append(
                RemoteFile(
                    name: name,
                    path: RemoteFile.joinPath(parentPath, name),
                    isDirectory: isDirectory,
                    isSymlink: isSymlink,
                    sizeBytes: Int64(sizeString),
                    permissions: permissions,
                    modified: "\(date) \(time)"
                )
            )
        }
        return results.sorted { lhs, rhs in
            if lhs.isDirectory != rhs.isDirectory { return lhs.isDirectory && !rhs.isDirectory }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }
}
