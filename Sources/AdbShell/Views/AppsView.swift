import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct AppsView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm: AppsViewModel
    @State private var showInstallPicker = false

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
                    .help("Установить APK из файла")
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)

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
                                AppRow(app: app, isSelected: app.packageName == vm.selectedPackage) {
                                    vm.selectedPackage = app.packageName
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

            if let pkg = vm.selectedPackage {
                AppDetailPanel(serial: serial, service: service, packageName: pkg) {
                    Task { await vm.load(serial: serial) }
                }
                .id(pkg)
            } else {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: "square.stack.3d.up")
                        .font(.system(size: 28, weight: .light))
                        .foregroundColor(CP.textMuted)
                    Text("Выберите приложение")
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
                Task {
                    for url in urls {
                        _ = try? await service.install(serial: serial, apkPath: url.path)
                    }
                    await vm.load(serial: serial)
                }
            }
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

private struct AppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                StatusDot(color: app.isEnabled ? CP.emerald : CP.textMuted)
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
