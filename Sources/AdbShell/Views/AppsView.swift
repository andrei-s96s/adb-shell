import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct AppsView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm: AppsViewModel
    @StateObject private var iconService = IconService()
    @State private var showInstallPicker = false
    @State private var showBundleImportPicker = false
    @State private var showBatchDeleteConfirm = false
    @State private var showSnapshotSheet = false
    @State private var snapshotToDelete: DeviceSnapshot?
    @State private var snapshotToRestore: DeviceSnapshot?
    @State private var installResults: [InstallResult] = []
    @State private var showInstallResults = false
    @State private var showBundleResults = false
    @State private var showCompareDevices = false
    @EnvironmentObject private var loc: LocalizationManager

    init(serial: String, service: ADBService) {
        self.serial = serial
        self.service = service
        _vm = StateObject(wrappedValue: AppsViewModel(service: service))
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(CP.textMuted)
                        .font(.system(size: 11))
                    TextField(L("apps.search.placeholder"), text: $vm.searchText)
                        .textFieldStyle(.plain)
                        .font(CP.code(12))
                }
                .padding(9)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(CP.bgPanelAlt)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(CP.hairline, lineWidth: 1)
                )
                .padding(12)

                HStack {
                    Toggle(isOn: $vm.showSystemApps) {
                        Text(L("apps.system"))
                            .font(CP.mono(11, weight: .medium))
                            .foregroundColor(CP.textMuted)
                    }
                    .toggleStyle(NeonToggleStyle(accent: CP.ice))

                    Spacer()

                    Text("\(vm.filteredApps.count)")
                        .font(CP.mono(11, weight: .medium))
                        .foregroundColor(CP.textMuted)

                    Button {
                        exportCSV()
                    } label: {
                        Label(L("apps.exportCsv"), systemImage: "square.and.arrow.up")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                    .help(L("apps.exportCsv.help"))

                    Button {
                        showCompareDevices = true
                    } label: {
                        Label(L("apps.compareDevices"), systemImage: "square.split.2x1")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                    .help(L("apps.compareDevices.help"))

                    Button {
                        showBundleImportPicker = true
                    } label: {
                        Label(L("apps.importBundle"), systemImage: "shippingbox")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.rose))
                    .help(L("apps.importBundle.help"))

                    Button {
                        vm.loadSnapshots()
                        showSnapshotSheet = true
                    } label: {
                        Label(L("apps.snapshot"), systemImage: "camera.aperture")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.emerald))
                    .help(L("apps.snapshot.help"))

                    Button {
                        showInstallPicker = true
                    } label: {
                        Label(L("apps.installApk"), systemImage: "arrow.down.doc")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold))
                    .help(L("apps.installApk.help"))
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)

                // Появляется сама, как только что-то выбрано (⌘/⇧-клик по строкам) —
                // отдельный режим "Выбрать" не нужен, ничего не нужно включать заранее.
                if !vm.selectedForBatch.isEmpty {
                    HStack {
                        Text(L("apps.selectedCount", vm.selectedForBatch.count))
                            .font(CP.mono(11, weight: .medium))
                            .foregroundColor(CP.textMuted)

                        Button(L("apps.clearSelection")) { vm.clearSelection() }
                            .buttonStyle(.plain)
                            .font(CP.mono(10, weight: .medium))
                            .foregroundColor(CP.ice)

                        Spacer()

                        Button(L("apps.exportSelected")) {
                            Task {
                                await vm.exportSelected(serial: serial)
                                if !vm.bundleResults.isEmpty { showBundleResults = true }
                            }
                        }
                        .buttonStyle(NeonButtonStyle(accent: CP.ice))

                        Button(L("apps.deleteSelected")) { showBatchDeleteConfirm = true }
                            .buttonStyle(NeonButtonStyle(accent: CP.crimson, filled: true))
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }

                if let progress = vm.batchProgressText {
                    HStack(spacing: 6) {
                        ProgressView().scaleEffect(0.5)
                        Text(progress).font(CP.mono(10)).foregroundColor(CP.textMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }

                Rectangle().fill(CP.hairline).frame(height: 1)

                if vm.isLoading {
                    Spacer()
                    ProgressView().tint(CP.gold)
                    Spacer()
                } else if let error = vm.errorMessage {
                    Spacer()
                    Text(error).font(CP.mono(11)).foregroundColor(CP.crimson).padding()
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.filteredApps) { app in
                                AppRow(
                                    app: app,
                                    isSelected: vm.selectedForBatch.contains(app.packageName),
                                    icon: iconService.icon(for: app.packageName),
                                    hasUpdate: vm.fdroidUpdates[app.packageName] != nil
                                ) { modifiers in
                                    vm.handleRowClick(app.packageName, modifiers: modifiers)
                                }
                                .task(id: app.packageName) {
                                    iconService.loadIfNeeded(serial: serial, packageName: app.packageName, service: service)
                                }
                                Rectangle().fill(CP.hairline).frame(height: 1).padding(.leading, 12)
                            }
                        }
                    }
                }
            }
            .frame(width: 360)
            .background(CP.bgPanel)

            Rectangle().fill(CP.hairline).frame(width: 1)

            detailPane
        }
        .id(loc.language)
        .task(id: serial) {
            vm.reset()
            await vm.load(serial: serial)
            await vm.checkFDroidUpdatesInBackground(serial: serial)
        }
        .fileImporter(isPresented: $showInstallPicker, allowedContentTypes: [UTType(filenameExtension: "apk") ?? .data], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                installResults = []
                Task {
                    await vm.installBatch(urls: urls, serial: serial) { url, outcome in
                        switch outcome {
                        case .success:
                            installResults.append(InstallResult(name: url.lastPathComponent, success: true, message: "OK"))
                        case .failure(let error):
                            installResults.append(InstallResult(name: url.lastPathComponent, success: false, message: error.localizedDescription))
                        }
                    }
                    if urls.count > 1 || installResults.contains(where: { !$0.success }) {
                        showInstallResults = true
                    }
                }
            }
        }
        .fileImporter(isPresented: $showBundleImportPicker, allowedContentTypes: [.zip], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                Task {
                    await vm.importBundle(from: url, serial: serial)
                    if !vm.bundleResults.isEmpty { showBundleResults = true }
                }
            }
        }
        .confirmationDialog(L("apps.deleteConfirm.title", vm.selectedForBatch.count), isPresented: $showBatchDeleteConfirm, titleVisibility: .visible) {
            Button(L("common.delete"), role: .destructive) { Task { await vm.deleteSelected(serial: serial) } }
            Button(L("common.cancel"), role: .cancel) { }
        }
        .sheet(isPresented: $showInstallResults) {
            InstallResultsSheet(results: installResults) { showInstallResults = false }
        }
        .sheet(isPresented: $showBundleResults) {
            BundleResultsSheet(results: vm.bundleResults) { showBundleResults = false }
        }
        .sheet(isPresented: $showCompareDevices) {
            DeviceCompareSheet(serial: serial, service: service) { showCompareDevices = false }
        }
        .sheet(isPresented: $showSnapshotSheet) {
            SnapshotSheet(
                snapshots: vm.snapshots,
                isSnapshotting: vm.isSnapshotting,
                onTakeSnapshot: {
                    Task {
                        await vm.takeSnapshot(serial: serial)
                        if !vm.bundleResults.isEmpty { showBundleResults = true }
                    }
                },
                onRestore: { snapshotToRestore = $0 },
                onReveal: { vm.revealSnapshotInFinder($0) },
                onDelete: { snapshotToDelete = $0 },
                onClose: { showSnapshotSheet = false }
            )
        }
        .confirmationDialog(
            snapshotToRestore.map { L("apps.snapshot.restoreConfirm.title", $0.appCount) } ?? "",
            isPresented: Binding(get: { snapshotToRestore != nil }, set: { if !$0 { snapshotToRestore = nil } }),
            titleVisibility: .visible
        ) {
            Button(L("apps.snapshot.restoreAction")) {
                if let snapshot = snapshotToRestore {
                    Task {
                        await vm.restoreSnapshot(snapshot, serial: serial)
                        if !vm.bundleResults.isEmpty { showBundleResults = true }
                    }
                }
                snapshotToRestore = nil
            }
            Button(L("common.cancel"), role: .cancel) { snapshotToRestore = nil }
        }
        .confirmationDialog(
            L("apps.snapshot.deleteConfirm.title"),
            isPresented: Binding(get: { snapshotToDelete != nil }, set: { if !$0 { snapshotToDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button(L("common.delete"), role: .destructive) {
                if let snapshot = snapshotToDelete { vm.deleteSnapshot(snapshot) }
                snapshotToDelete = nil
            }
            Button(L("common.cancel"), role: .cancel) { snapshotToDelete = nil }
        }
    }

    @ViewBuilder
    private var detailPane: some View {
        if let pkg = vm.focusedPackage {
            AppDetailPanel(serial: serial, service: service, packageName: pkg, fdroidUpdate: vm.fdroidUpdates[pkg]) {
                Task { await vm.load(serial: serial) }
            }
            .id(pkg)
        } else if vm.selectedForBatch.count > 1 {
            VStack(spacing: 10) {
                Spacer()
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 28, weight: .light))
                    .foregroundColor(CP.textMuted)
                Text(L("apps.selectedCount", vm.selectedForBatch.count))
                    .font(CP.mono(13, weight: .medium))
                    .foregroundColor(CP.textMuted)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 10) {
                Spacer()
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 28, weight: .light))
                    .foregroundColor(CP.textMuted)
                Text(L("apps.selectApp"))
                    .font(CP.mono(13, weight: .medium))
                    .foregroundColor(CP.textMuted)
                Text(L("apps.selectApp.hint"))
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted.opacity(0.7))
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func exportCSV() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "packages-\(serial).csv"
        panel.allowedContentTypes = [.commaSeparatedText]
        guard panel.runModal() == .OK, let url = panel.url else { return }

        var csv = "package_name,is_system,is_enabled\n"
        for app in vm.filteredApps {
            csv += "\(app.packageName),\(app.isSystem),\(app.isEnabled)\n"
        }
        try? csv.write(to: url, atomically: true, encoding: .utf8)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}

private struct InstallResult: Identifiable {
    let id = UUID()
    let name: String
    let success: Bool
    let message: String
}

private struct InstallResultsSheet: View {
    let results: [InstallResult]
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: L("apps.installResults.title"), accent: CP.gold)
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(results) { r in
                        HStack(spacing: 8) {
                            Image(systemName: r.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(r.success ? CP.emerald : CP.crimson)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.name).font(CP.code(11, weight: .medium)).foregroundColor(CP.textPrimary)
                                if !r.success {
                                    Text(r.message).font(CP.mono(9)).foregroundColor(CP.crimson).lineLimit(2)
                                }
                            }
                            Spacer()
                        }
                    }
                }
            }
            .frame(maxHeight: 300)
            Button(L("common.close")) { onClose() }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
        }
        .padding(20)
        .frame(width: 380)
        .background(CP.bg)
    }
}

private struct BundleResultsSheet: View {
    let results: [BundleOperationResult]
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: L("apps.bundleResults.title"), accent: CP.rose)
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(results) { r in
                        HStack(spacing: 8) {
                            Image(systemName: r.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(r.success ? CP.emerald : CP.crimson)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.packageName).font(CP.code(11, weight: .medium)).foregroundColor(CP.textPrimary)
                                Text(r.message).font(CP.mono(9)).foregroundColor(r.success ? CP.textMuted : CP.crimson).lineLimit(2)
                            }
                            Spacer()
                        }
                    }
                }
            }
            .frame(maxHeight: 300)
            Button(L("common.close")) { onClose() }
                .buttonStyle(NeonButtonStyle(accent: CP.rose, filled: true))
        }
        .padding(20)
        .frame(width: 380)
        .background(CP.bg)
    }
}

/// Снапшот устройства — снимает сразу ВСЕ пользовательские приложения с
/// выданными runtime-разрешениями и хранит .zip локально (Application
/// Support/AdbShell/Snapshots), без диалога сохранения каждый раз. Никуда не
/// отправляется — только на этом Mac, пока не удалишь сам.
private struct SnapshotSheet: View {
    let snapshots: [DeviceSnapshot]
    let isSnapshotting: Bool
    let onTakeSnapshot: () -> Void
    let onRestore: (DeviceSnapshot) -> Void
    let onReveal: (DeviceSnapshot) -> Void
    let onDelete: (DeviceSnapshot) -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: L("apps.snapshot.title"), accent: CP.emerald)
            Text(L("apps.snapshot.explain"))
                .font(CP.mono(10))
                .foregroundColor(CP.textMuted)

            Button {
                onTakeSnapshot()
            } label: {
                if isSnapshotting {
                    ProgressView().scaleEffect(0.6).frame(maxWidth: .infinity)
                } else {
                    Text(L("apps.snapshot.takeAction"))
                }
            }
            .buttonStyle(NeonButtonStyle(accent: CP.emerald, filled: true))
            .disabled(isSnapshotting)

            Rectangle().fill(CP.hairline).frame(height: 1)

            if snapshots.isEmpty {
                Text(L("apps.snapshot.empty"))
                    .font(CP.mono(11))
                    .foregroundColor(CP.textMuted)
                    .padding(.vertical, 12)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(snapshots) { snapshot in
                            HStack(spacing: 8) {
                                Image(systemName: "camera.aperture").foregroundColor(CP.emerald)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(snapshot.deviceLabel).font(CP.code(11, weight: .medium)).foregroundColor(CP.textPrimary)
                                    Text(L("apps.snapshot.rowSubtitle", snapshot.appCount, snapshot.createdAt.formatted(date: .abbreviated, time: .shortened)))
                                        .font(CP.mono(9)).foregroundColor(CP.textMuted)
                                }
                                Spacer()
                                Button(L("apps.snapshot.restoreAction")) { onRestore(snapshot) }
                                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                                Button {
                                    onReveal(snapshot)
                                } label: {
                                    Image(systemName: "folder").foregroundColor(CP.textMuted)
                                }
                                .buttonStyle(.plain)
                                Button {
                                    onDelete(snapshot)
                                } label: {
                                    Image(systemName: "trash").foregroundColor(CP.crimson)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .frame(maxHeight: 260)
            }

            HStack {
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.emerald, filled: true))
            }
        }
        .padding(20)
        .frame(width: 440)
        .background(CP.bg)
    }
}

private struct AppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let icon: NSImage?
    let hasUpdate: Bool
    let action: (NSEvent.ModifierFlags) -> Void

    var body: some View {
        Button {
            action(NSEvent.modifierFlags)
        } label: {
            HStack(spacing: 8) {
                StatusDot(color: app.isEnabled ? CP.emerald : CP.textMuted)
                appIcon
                Text(app.packageName)
                    .font(CP.code(12))
                    .foregroundColor(CP.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if hasUpdate {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 11))
                        .foregroundColor(CP.gold)
                        .help(L("apps.updateAvailable.help"))
                }
                Spacer()
                if app.isSystem {
                    Text("SYS")
                        .font(CP.mono(9, weight: .semibold))
                        .foregroundColor(CP.textMuted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(CP.hairline, lineWidth: 1)
                        )
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(isSelected ? CP.gold.opacity(0.14) : Color.clear)
            .overlay(
                Rectangle().fill(isSelected ? CP.gold : Color.clear).frame(width: 2), alignment: .leading
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(app.packageName + (hasUpdate ? ", " + L("apps.updateAvailable.help") : ""))
    }

    /// Реальная иконка приложения, если её удалось вытащить из APK
    /// (IconService), иначе — нейтральная заглушка.
    @ViewBuilder
    private var appIcon: some View {
        Group {
            if let icon {
                Image(nsImage: icon)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "app.dashed")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .foregroundColor(CP.textMuted.opacity(0.5))
                    .padding(3)
            }
        }
        .frame(width: 20, height: 20)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
}
