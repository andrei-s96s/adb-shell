import Foundation

struct ApkFile: Identifiable, Hashable {
    var id: String { path }
    let path: String
    let name: String
    let sizeBytes: Int64
    let modified: Date

    var url: URL { URL(fileURLWithPath: path) }

    var sizeString: String {
        ByteCountFormatter.string(fromByteCount: sizeBytes, countStyle: .file)
    }
}
