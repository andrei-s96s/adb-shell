import SwiftUI
import AppKit

struct FilesView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm: FilesViewModel
    @State private var isDropTargeted = false
    @State private var showNewFolderPrompt = false
    @State private var newFolderName = ""
    @State private var showPushPicker = false
    @State private var deleteTarget: RemoteFile?

    init(serial: String, service: ADBService) {
        self.serial = serial
        self.service = service
        _vm = StateObject(wrappedValue: FilesViewModel(service: service))
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Rectangle().fill(CP.hairline).frame(height: 1)

            if let error = vm.errorMessage {
                Text(error)
                    .font(CP.mono(11))
                    .foregroundColor(CP.crimson)
                    .padding(10)
            }
            if let status = vm.statusMessage {
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.5)
                    Text(status).font(CP.mono(10)).foregroundColor(CP.textMuted)
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)
            }

            if vm.isLoading {
                Spacer()
                ProgressView().tint(CP.gold)
                Spacer()
            } else if vm.entries.isEmpty {
                Spacer()
                Text("Пусто")
                    .font(CP.mono(12))
                    .foregroundColor(CP.textMuted)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.entries) { file in
                            FileRow(file: file) {
                                Task { await vm.open(file, serial: serial) }
                            } onPull: {
                                pullFile(file)
                            } onDelete: {
                                deleteTarget = file
                            }
                            Rectangle().fill(CP.hairline).frame(height: 1).padding(.leading, 14)
                        }
                    }
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 0).fill(isDropTargeted ? CP.gold.opacity(0.05) : Color.clear)
        )
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers)
            return true
        }
        .task(id: serial) { await vm.load(serial: serial) }
        .alert("Новая папка", isPresented: $showNewFolderPrompt) {
            TextField("Имя папки", text: $newFolderName)
            Button("Создать") { Task { await vm.makeDirectory(name: newFolderName, serial: serial); newFolderName = "" } }
            Button("Отмена", role: .cancel) { newFolderName = "" }
        }
        .fileImporter(isPresented: $showPushPicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                Task { await vm.push(urls: urls, serial: serial) }
            }
        }
        .confirmationDialog(
            deleteTarget.map { "Удалить «\($0.name)»?" } ?? "",
            isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) {
                if let file = deleteTarget { Task { await vm.delete(file, serial: serial) } }
                deleteTarget = nil
            }
            Button("Отмена", role: .cancel) { deleteTarget = nil }
        }
    }

    private var toolbar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(text: "Файлы устройства", accent: CP.ice)
                Spacer()
                if vm.isBusy {
                    ProgressView().scaleEffect(0.6)
                }
                Button("Обновить") { Task { await vm.load(serial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button("Новая папка") { showNewFolderPrompt = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                Button("Загрузить сюда…") { showPushPicker = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(Array(vm.breadcrumbs.enumerated()), id: \.offset) { idx, crumb in
                        Button(crumb.name) { Task { await vm.goTo(crumb.path, serial: serial) } }
                            .buttonStyle(.plain)
                            .font(CP.code(11, weight: idx == vm.breadcrumbs.count - 1 ? .semibold : .regular))
                            .foregroundColor(idx == vm.breadcrumbs.count - 1 ? CP.gold : CP.textMuted)
                        if idx < vm.breadcrumbs.count - 1 {
                            Text("/").font(CP.code(11)).foregroundColor(CP.textMuted.opacity(0.5))
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(CP.bgPanel)
    }

    private func pullFile(_ file: RemoteFile) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Сохранить сюда"
        guard panel.runModal() == .OK, let dir = panel.url else { return }
        Task { await vm.pull(file, to: dir, serial: serial) }
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
            guard !urls.isEmpty else { return }
            Task { await vm.push(urls: urls, serial: serial) }
        }
    }
}

private struct FileRow: View {
    let file: RemoteFile
    let onOpen: () -> Void
    let onPull: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: file.isDirectory ? onOpen : {}) {
            HStack(spacing: 10) {
                Image(systemName: file.isDirectory ? "folder.fill" : (file.isSymlink ? "arrow.triangle.branch" : "doc"))
                    .foregroundColor(file.isDirectory ? CP.gold : CP.textMuted)
                    .frame(width: 16)

                VStack(alignment: .leading, spacing: 1) {
                    Text(file.name)
                        .font(CP.code(12))
                        .foregroundColor(CP.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let modified = file.modified {
                        Text(modified)
                            .font(CP.mono(9))
                            .foregroundColor(CP.textMuted)
                    }
                }

                Spacer()

                if let sizeString = file.sizeString, !file.isDirectory {
                    Text(sizeString)
                        .font(CP.mono(10))
                        .foregroundColor(CP.textMuted)
                }

                if !file.isDirectory {
                    Button(action: onPull) {
                        Image(systemName: "arrow.down.circle").foregroundColor(CP.ice)
                    }
                    .buttonStyle(.plain)
                }
                Button(action: onDelete) {
                    Image(systemName: "trash").foregroundColor(CP.crimson)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
