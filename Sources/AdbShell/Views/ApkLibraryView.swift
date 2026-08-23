import SwiftUI
import UniformTypeIdentifiers

struct ApkLibraryView: View {
    /// nil, если нет подключённого и авторизованного устройства — тогда
    /// библиотеку всё равно можно смотреть/пополнять, просто нельзя ставить.
    let serial: String?
    let service: ADBService
    @StateObject private var vm = ApkLibraryViewModel()
    @State private var isDropTargeted = false
    @State private var showImporter = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: "Библиотека APK", accent: CP.ice)
                    Text(vm.directoryURL.path)
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                        .textSelection(.enabled)
                }
                Spacer()
                Button("Выбрать папку…") { vm.chooseDirectory() }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                Button("Показать в Finder") { vm.revealInFinder() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button("Добавить APK…") { showImporter = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
            }
            .padding(16)

            Rectangle().fill(CP.hairline).frame(height: 1)

            if serial == nil {
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                    Text("Устройство не подключено — файлы можно добавлять и удалять, установка станет доступна после подключения устройства")
                }
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted)
                .padding(.horizontal, 16)
                .padding(.top, 10)
            }

            if let error = vm.errorMessage {
                Text(error).font(CP.mono(11)).foregroundColor(CP.crimson).padding(.horizontal, 16).padding(.top, 8)
            }
            if let msg = vm.lastInstallMessage {
                Text(msg).font(CP.mono(11)).foregroundColor(CP.emerald).padding(.horizontal, 16).padding(.top, 8)
            }

            if vm.files.isEmpty {
                dropZone
                    .padding(20)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.files) { file in
                            ApkRow(
                                file: file,
                                isInstalling: vm.installingPath == file.path,
                                canInstall: serial != nil
                            ) {
                                guard let serial else { return }
                                Task { await vm.install(file, to: serial, service: service) }
                            } onDelete: {
                                vm.delete(file)
                            }
                        }
                    }
                    .padding(16)

                    dropZone
                        .frame(height: 90)
                        .padding([.horizontal, .bottom], 16)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers)
            return true
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [UTType(filenameExtension: "apk") ?? .data], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                vm.importFiles(urls)
            }
        }
    }

    private var dropZone: some View {
        VStack(spacing: 8) {
            Image(systemName: "square.and.arrow.down.on.square")
                .font(.system(size: 22, weight: .light))
                .foregroundColor(isDropTargeted ? CP.gold : CP.textMuted)
            Text("Перетащите .apk сюда")
                .font(CP.mono(12, weight: .medium))
                .foregroundColor(isDropTargeted ? CP.gold : CP.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                .foregroundColor(isDropTargeted ? CP.gold : CP.hairline)
        )
    }

    private func handleDrop(_ providers: [NSItemProvider]) {
        let group = DispatchGroup()
        var urls: [URL] = []
        for provider in providers {
            group.enter()
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                if let url { urls.append(url) }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            vm.importFiles(urls)
        }
    }
}

private struct ApkRow: View {
    let file: ApkFile
    let isInstalling: Bool
    let canInstall: Bool
    let onInstall: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "shippingbox")
                .foregroundColor(CP.gold)
            VStack(alignment: .leading, spacing: 2) {
                Text(file.name)
                    .font(CP.code(12, weight: .medium))
                    .foregroundColor(CP.textPrimary)
                Text("\(file.sizeString) · \(file.modified.formatted(date: .abbreviated, time: .shortened))")
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)
            }
            Spacer()

            if isInstalling {
                ProgressView().scaleEffect(0.6).tint(CP.gold)
            } else {
                Button("Установить") { onInstall() }
                    .buttonStyle(NeonButtonStyle(accent: canInstall ? CP.emerald : CP.textMuted))
                    .disabled(!canInstall)
                    .help(canInstall ? "" : "Подключите устройство, чтобы установить")
            }
            Button {
                onDelete()
            } label: {
                Image(systemName: "trash")
                    .foregroundColor(CP.crimson)
            }
            .buttonStyle(.plain)
        }
        .padding(10)
        .cpPanel()
    }
}
