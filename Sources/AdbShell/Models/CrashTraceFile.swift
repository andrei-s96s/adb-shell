import Foundation

/// Файл в `/data/anr/` или `/data/tombstones/` на устройстве — без root
/// доступ к этим каталогам обычно запрещён, поэтому список может быть пуст
/// даже при наличии крашей.
struct CrashTraceFile: Identifiable, Hashable {
    enum Kind: Hashable {
        case anr, tombstone
    }

    var id: String { path }
    let path: String
    let name: String
    let kind: Kind
}
