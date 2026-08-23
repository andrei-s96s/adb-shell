import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct AppsView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm: AppsViewModel
    @State private var showInstallPicker = false
    @State private var showBatchDeleteConfirm = false
    @State private var installResults: [InstallResult] = []
    @State private var showInstallResults = false

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
                    TextField("Поиск по package name…", text: $vm.searchText)
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
                        Text("Системные")
                            .font(CP.mono(11, weight: .medium))
                            .foregroundColor(CP.textMuted)
                    }
                    .toggleStyle(NeonToggleStyle(accent: CP.ice))

                    Spacer()

                    Text("\(vm.filteredApps.count)")
                        .font(CP.mono(11, weight: .medium))
                        .foregroundColor(CP.textMuted)

                    Button {
                        vm.toggleSelectionMode()
                    } label: {
                        Label("Выбрать", systemImage: "checkmark.circle")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: vm.isSelectionMode ? CP.rose : CP.textMuted))
                    .help("Мультивыбор для пакетного удаления")

                    Button {
                        exportCSV()
                    } label: {
                        Label("Экспорт в CSV", systemImage: "square.and.arrow.up")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                    .help("Экспортировать список в CSV")

                    Button {
                        showInstallPicker = true
                    } label: {
                        Label("Установить APK", systemImage: "arrow.down.doc")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold))
                    .help("Установить APK из файла (можно несколько)")
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)

                if vm.isSelectionMode {
                    HStack {
                        Text("Выбрано: \(vm.selectedForBatch.count)")
                            .font(CP.mono(11, weight: .medium))
                            .foregroundColor(CP.textMuted)
                        Spacer()
                        Button("Удалить выбранные") { showBatchDeleteConfirm = true }
                            .buttonStyle(NeonButtonStyle(accent: CP.crimson, filled: true))
                            .disabled(vm.selectedForBatch.isEmpty)
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
                                    isSelected: app.packageName == vm.selectedPackage,
                                    isSelectionMode: vm.isSelectionMode,
                                    isChecked: vm.selectedForBatch.contains(app.packageName)
                                ) {
                                    if vm.isSelectionMode {
                                        vm.toggleSelection(app.packageName)
                                    } else {
                                        vm.selectedPackage = app.packageName
                                    }
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

            if let pkg = vm.selectedPackage, !vm.isSelectionMode {
                AppDetailPanel(serial: serial, service: service, packageName: pkg) {
                    Task { await vm.load(serial: serial) }
                }
                .id(pkg)
            } else {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: vm.isSelectionMode ? "checkmark.circle" : "square.stack.3d.up")
                        .font(.system(size: 28, weight: .light))
                        .foregroundColor(CP.textMuted)
                    Text(vm.isSelectionMode ? "Отметьте приложения слева" : "Выберите приложение")
                        .font(CP.mono(13, weight: .medium))
                        .foregroundColor(CP.textMuted)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .task(id: serial) {
            vm.reset()
            await vm.load(serial: serial)
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
        .confirmationDialog("Удалить \(vm.selectedForBatch.count) приложений?", isPresented: $showBatchDeleteConfirm, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { Task { await vm.deleteSelected(serial: serial) } }
            Button("Отмена", role: .cancel) { }
        }
        .sheet(isPresented: $showInstallResults) {
            InstallResultsSheet(results: installResults) { showInstallResults = false }
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
            SectionLabel(text: "Результат установки", accent: CP.gold)
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
            Button("Закрыть") { onClose() }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
        }
        .padding(20)
        .frame(width: 380)
        .background(CP.bg)
    }
}

private struct AppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let isSelectionMode: Bool
    let isChecked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isSelectionMode {
                    Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                        .foregroundColor(isChecked ? CP.gold : CP.textMuted)
                } else {
                    StatusDot(color: app.isEnabled ? CP.emerald : CP.textMuted)
                }
                Text(app.packageName)
                    .font(CP.code(12))
                    .foregroundColor(CP.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
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
            .background(isSelected ? CP.bgPanelAlt : Color.clear)
        }
        .buttonStyle(.plain)
    }
}
