import Foundation

@MainActor
final class ApkInfoViewModel: ObservableObject {
    @Published var manifest: ApkManifestInfo?
    @Published var installedDetail: AppDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load(apkPath: String, serial: String?, service: ADBService) async {
        isLoading = true
        errorMessage = nil
        manifest = nil
        installedDetail = nil
        defer { isLoading = false }
        do {
            let info = try await ApkInspectorService.inspect(apkPath: apkPath)
            manifest = info
            // Диф с установленной версией — best-effort, отсутствие пакета на
            // устройстве (или отсутствие устройства) просто означает "новая установка".
            if let serial, let pkg = info.packageName {
                installedDetail = try? await service.appDetail(serial: serial, packageName: pkg)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Разрешения в APK, которых нет среди уже выданных/запрошенных у установленной версии.
    var addedPermissions: [String] {
        guard let manifest, let installed = installedDetail else { return [] }
        let installedNames = Set(installed.permissions.map(\.name))
        return manifest.permissions.filter { !installedNames.contains($0) }
    }

    /// Разрешения установленной версии, которых больше нет в новом APK.
    var removedPermissions: [String] {
        guard let manifest, let installed = installedDetail else { return [] }
        let newNames = Set(manifest.permissions)
        return installed.permissions.map(\.name).filter { !newNames.contains($0) }
    }
}
