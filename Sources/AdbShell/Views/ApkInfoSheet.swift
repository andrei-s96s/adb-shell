import SwiftUI

/// "Инфо" по локальному APK из библиотеки: манифест через aapt2 (без установки)
/// и, если на выбранном устройстве уже стоит эта же версия пакета — diff версии
/// и разрешений с тем, что будет после обновления.
struct ApkInfoSheet: View {
    let apkPath: String
    let serial: String?
    let service: ADBService
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = ApkInfoViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                SectionLabel(text: L("apkInfo.title"), accent: CP.ice)
                Spacer()
                Button(L("common.close")) { dismiss() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if vm.isLoading {
                        ProgressView().tint(CP.gold)
                    } else if let error = vm.errorMessage {
                        Text(error).font(CP.mono(11)).foregroundColor(CP.crimson)
                    } else if let manifest = vm.manifest {
                        manifestCard(manifest)
                        if vm.installedDetail != nil {
                            diffCard(manifest)
                        }
                        permissionsCard(manifest)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(20)
        .frame(width: 520, height: 480)
        .task { await vm.load(apkPath: apkPath, serial: serial, service: service) }
    }

    private func manifestCard(_ manifest: ApkManifestInfo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            InfoRow(label: "Package", value: manifest.packageName ?? "—")
            InfoRow(label: L("apkInfo.label"), value: manifest.applicationLabel ?? "—")
            InfoRow(label: L("apkInfo.version"), value: "\(manifest.versionName ?? "—") (\(manifest.versionCode ?? "—"))")
            InfoRow(label: L("apkInfo.sdk"), value: "\(manifest.minSdk ?? "—") / \(manifest.targetSdk ?? "—")")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }

    private func diffCard(_ manifest: ApkManifestInfo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: L("apkInfo.diff"), accent: CP.gold)
            if let installed = vm.installedDetail {
                InfoRow(label: L("apkInfo.diff.installed"), value: installed.versionName ?? "—")
                InfoRow(label: L("apkInfo.diff.new"), value: manifest.versionName ?? "—")
            }
            if !vm.addedPermissions.isEmpty {
                Text(L("apkInfo.diff.addedPermissions", vm.addedPermissions.count))
                    .font(CP.mono(11, weight: .semibold)).foregroundColor(CP.emerald)
                ForEach(vm.addedPermissions, id: \.self) { name in
                    Text(name).font(CP.code(10)).foregroundColor(CP.textMuted)
                }
            }
            if !vm.removedPermissions.isEmpty {
                Text(L("apkInfo.diff.removedPermissions", vm.removedPermissions.count))
                    .font(CP.mono(11, weight: .semibold)).foregroundColor(CP.crimson)
                ForEach(vm.removedPermissions, id: \.self) { name in
                    Text(name).font(CP.code(10)).foregroundColor(CP.textMuted)
                }
            }
            if vm.addedPermissions.isEmpty && vm.removedPermissions.isEmpty {
                Text(L("apkInfo.diff.samePermissions")).font(CP.mono(11)).foregroundColor(CP.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }

    private func permissionsCard(_ manifest: ApkManifestInfo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: L("apkInfo.permissions", manifest.permissions.count), accent: CP.rose)
            ForEach(manifest.permissions, id: \.self) { name in
                Text(name).font(CP.code(10)).foregroundColor(CP.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }
}

private struct InfoRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textMuted).frame(width: 120, alignment: .leading)
            Text(value).font(CP.code(11)).foregroundColor(CP.textPrimary).textSelection(.enabled)
            Spacer()
        }
    }
}
