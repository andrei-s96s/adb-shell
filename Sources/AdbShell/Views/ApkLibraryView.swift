import SwiftUI
import UniformTypeIdentifiers

struct ApkLibraryView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm = ApkLibraryViewModel()
    @State private var isDropTargeted = false
    @State private var showImporter = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    SectionLabel(text: "Библиотека APK", accent: CP.cyan)
                    Text(vm.directoryURL.path)
                        .font(CP.mono(9))
                        .foregroundColor(CP.textMuted)
                        .textSelection(.enabled)
                }
                Spacer()
                Button("Выбрать папку…") { vm.chooseDirectory() }
                    .buttonStyle(NeonButtonStyle(accent: CP.magenta))
                Button("Показать в Finder") { vm.revealInFinder() }
                    .buttonStyle(NeonButtonStyle(accent: CP.cyan))
                Button("Добавить APK…") { showImporter = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.yellow, filled: true))
            }
            .padding(16)

            Rectangle().fill(CP.grid).frame(height: 1)

            if let error = vm.errorMessage {
                Text(error).font(CP.mono(10)).foregroundColor(CP.red).padding(10)
            }
            if let msg = vm.lastInstallMessage {
                Text(msg).font(CP.mono(9)).foregroundColor(CP.green).padding(.horizontal, 16).padding(.top, 8)
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
                                isInstalling: vm.installingPath == file.path
                            ) {
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
                .font(.system(size: 24))
                .foregroundColor(isDropTargeted ? CP.yellow : CP.textMuted)
            Text("ПЕРЕТАЩИТЕ .APK СЮДА")
                .font(CP.mono(10, weight: .bold))
                .cpTracking(1.5)
                .foregroundColor(isDropTargeted ? CP.yellow : CP.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            Rectangle()
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                .foregroundColor(isDropTargeted ? CP.yellow : CP.grid)
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
    let onInstall: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "shippingbox")
                .foregroundColor(CP.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text(file.name)
                    .font(CP.mono(11, weight: .semibold))
                    .foregroundColor(CP.textPrimary)
                Text("\(file.sizeString) · \(file.modified.formatted(date: .abbreviated, time: .shortened))")
                    .font(CP.mono(9))
                    .foregroundColor(CP.textMuted)
            }
            Spacer()

            if isInstalling {
                ProgressView().scaleEffect(0.6).tint(CP.yellow)
            } else {
                Button("Установить") { onInstall() }
                    .buttonStyle(NeonButtonStyle(accent: CP.green, filled: false))
            }
            Button {
                onDelete()
            } label: {
                Image(systemName: "trash")
                    .foregroundColor(CP.red)
            }
            .buttonStyle(.plain)
        }
        .padding(10)
        .cpPanel()
    }
}
