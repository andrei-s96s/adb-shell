import SwiftUI
import UniformTypeIdentifiers

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
                        .font(CP.mono(11))
                }
                .padding(8)
                .background(CP.bgPanelAlt)
                .overlay(Rectangle().stroke(CP.grid, lineWidth: 1))
                .padding(10)

                HStack {
                    Toggle(isOn: $vm.showSystemApps) {
                        Text("Системные")
                            .font(CP.mono(10, weight: .semibold))
                            .foregroundColor(CP.textMuted)
                    }
                    .toggleStyle(.checkbox)

                    Spacer()

                    Text("\(vm.filteredApps.count)")
                        .font(CP.mono(10))
                        .foregroundColor(CP.cyan)

                    Button {
                        showInstallPicker = true
                    } label: {
                        Label("Установить APK", systemImage: "arrow.down.doc")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.yellow))
                    .help("Установить APK из файла")
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)

                Rectangle().fill(CP.grid).frame(height: 1)

                if vm.isLoading {
                    Spacer()
                    ProgressView().tint(CP.yellow)
                    Spacer()
                } else if let error = vm.errorMessage {
                    Spacer()
                    Text(error).font(CP.mono(10)).foregroundColor(CP.red).padding()
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.filteredApps) { app in
                                AppRow(app: app, isSelected: app.packageName == vm.selectedPackage) {
                                    vm.selectedPackage = app.packageName
                                }
                                Rectangle().fill(CP.grid).frame(height: 1)
                            }
                        }
                    }
                }
            }
            .frame(width: 360)
            .background(CP.bgPanel)

            Rectangle().fill(CP.grid).frame(width: 1)

            if let pkg = vm.selectedPackage {
                AppDetailPanel(serial: serial, service: service, packageName: pkg) {
                    Task { await vm.load(serial: serial) }
                }
                .id(pkg)
            } else {
                VStack {
                    Spacer()
                    Text("ВЫБЕРИТЕ ПРИЛОЖЕНИЕ")
                        .font(CP.mono(12, weight: .bold))
                        .cpTracking(2)
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
}

private struct AppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                StatusDot(color: app.isEnabled ? CP.green : CP.textMuted)
                VStack(alignment: .leading, spacing: 1) {
                    Text(app.packageName)
                        .font(CP.mono(11))
                        .foregroundColor(CP.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                if app.isSystem {
                    Text("SYS")
                        .font(CP.mono(8, weight: .bold))
                        .foregroundColor(CP.textMuted)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .overlay(Rectangle().stroke(CP.grid, lineWidth: 1))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(isSelected ? CP.yellow.opacity(0.14) : Color.clear)
        }
        .buttonStyle(.plain)
    }
}
