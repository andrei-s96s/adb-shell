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
    @State private var infoTarget: ApkFile?
    @State private var showDownloadPrompt = false
    @State private var downloadURL = ""
    @State private var downloadFilename = ""
    @State private var tagFilter: String?
    @StateObject private var tagStore = ApkTagStore()
    @EnvironmentObject private var loc: LocalizationManager

    private var filteredFiles: [ApkFile] {
        guard let tagFilter else { return vm.files }
        return vm.files.filter { tagStore.tags(for: $0.path).contains(tagFilter) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: L("library.title"), accent: CP.ice)
                    Text(vm.directoryURL.path)
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                        .textSelection(.enabled)
                }
                Spacer()
                Button(L("library.chooseFolder")) { vm.chooseDirectory() }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                Button(L("library.showInFinder")) { vm.revealInFinder() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                if !tagStore.allTags.isEmpty {
                    Menu {
                        Button(L("library.tags.all")) { tagFilter = nil }
                        Divider()
                        ForEach(tagStore.allTags, id: \.self) { tag in
                            Button(tag) { tagFilter = tag }
                        }
                    } label: {
                        Label(tagFilter ?? L("library.tags.filter"), systemImage: "tag")
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                }
                Button(L("library.downloadUrl")) { showDownloadPrompt = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                Button(L("library.addApk")) { showImporter = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
            }
            .padding(16)

            Rectangle().fill(CP.hairline).frame(height: 1)

            if serial == nil {
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                    Text(L("library.noDevice"))
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
                        ForEach(filteredFiles) { file in
                            ApkRow(
                                file: file,
                                isInstalling: vm.installingPath == file.path,
                                canInstall: serial != nil,
                                tags: tagStore.tags(for: file.path),
                                fdroidUpdate: vm.fdroidUpdates[file.path],
                                isUpdatingFromFDroid: vm.updatingPath == file.path
                            ) {
                                guard let serial else { return }
                                Task { await vm.install(file, to: serial, service: service) }
                            } onInstallToAll: {
                                Task { await vm.installToAllDevices(file, service: service) }
                            } onShowInfo: {
                                infoTarget = file
                            } onDelete: {
                                vm.delete(file)
                            } onAddTag: { tag in
                                tagStore.addTag(tag, to: file.path)
                            } onRemoveTag: { tag in
                                tagStore.removeTag(tag, from: file.path)
                            } onFDroidUpdate: {
                                Task { await vm.downloadFDroidUpdate(for: file) }
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
        .id(loc.language)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: vm.directoryURL) {
            await vm.checkFDroidUpdatesInBackground()
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers)
            return true
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [UTType(filenameExtension: "apk") ?? .data], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                vm.importFiles(urls)
            }
        }
        .sheet(item: $infoTarget) { file in
            ApkInfoSheet(apkPath: file.path, serial: serial, service: service)
        }
        .sheet(isPresented: $showDownloadPrompt) {
            DownloadApkSheet(url: $downloadURL, filename: $downloadFilename) {
                showDownloadPrompt = false
                let url = downloadURL
                let name = downloadFilename
                downloadURL = ""
                downloadFilename = ""
                Task { await vm.downloadFromURL(url, filename: name) }
            } onCancel: {
                showDownloadPrompt = false
            }
        }
    }

    private var dropZone: some View {
        VStack(spacing: 8) {
            Image(systemName: "square.and.arrow.down.on.square")
                .font(.system(size: 22, weight: .light))
                .foregroundColor(isDropTargeted ? CP.gold : CP.textMuted)
            Text(L("library.dropZone"))
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
    let tags: [String]
    let fdroidUpdate: FDroidUpdateInfo?
    let isUpdatingFromFDroid: Bool
    let onInstall: () -> Void
    let onInstallToAll: () -> Void
    let onShowInfo: () -> Void
    let onDelete: () -> Void
    let onAddTag: (String) -> Void
    let onRemoveTag: (String) -> Void
    let onFDroidUpdate: () -> Void

    @State private var showAddTag = false
    @State private var newTag = ""

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
                if let fdroidUpdate {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up.circle.fill").font(.system(size: 9))
                        Text(L("library.fdroid.badge", fdroidUpdate.latestVersionName ?? "\(fdroidUpdate.latestVersionCode)"))
                    }
                    .font(CP.code(9, weight: .semibold))
                    .foregroundColor(CP.gold)
                    .help(L("library.fdroid.source"))
                }
                HStack(spacing: 4) {
                    ForEach(tags, id: \.self) { tag in
                        HStack(spacing: 3) {
                            Text(tag)
                            Button { onRemoveTag(tag) } label: {
                                Image(systemName: "xmark").font(.system(size: 7))
                            }
                            .buttonStyle(.plain)
                        }
                        .font(CP.code(9))
                        .foregroundColor(CP.ice)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(CP.ice.opacity(0.15)))
                    }
                    Button { showAddTag = true } label: {
                        Image(systemName: "plus.circle").font(.system(size: 10))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(CP.textMuted)
                    .popover(isPresented: $showAddTag) {
                        HStack {
                            TextField(L("library.tags.new"), text: $newTag)
                                .textFieldStyle(.plain)
                                .font(CP.code(11))
                                .frame(width: 120)
                                .onSubmit {
                                    onAddTag(newTag)
                                    newTag = ""
                                    showAddTag = false
                                }
                        }
                        .padding(8)
                    }
                }
            }
            Spacer()

            if let fdroidUpdate {
                Button {
                    onFDroidUpdate()
                } label: {
                    if isUpdatingFromFDroid {
                        ProgressView().scaleEffect(0.6).frame(maxWidth: .infinity)
                    } else {
                        Text(L("library.fdroid.updateAction"))
                    }
                }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                .disabled(isUpdatingFromFDroid)
                .help(L("library.fdroid.updateAction.help", fdroidUpdate.latestVersionName ?? "\(fdroidUpdate.latestVersionCode)"))
            }

            if isInstalling {
                ProgressView().scaleEffect(0.6).tint(CP.gold)
            } else {
                Button(L("library.install")) { onInstall() }
                    .buttonStyle(NeonButtonStyle(accent: canInstall ? CP.emerald : CP.textMuted))
                    .disabled(!canInstall)
                    .help(canInstall ? "" : L("library.install.needDevice"))
                Button {
                    onInstallToAll()
                } label: {
                    Image(systemName: "square.stack.3d.up")
                        .foregroundColor(canInstall ? CP.ice : CP.textMuted)
                }
                .buttonStyle(.plain)
                .disabled(!canInstall)
                .help(L("library.install.allDevices"))
            }
            Button {
                onShowInfo()
            } label: {
                Image(systemName: "info.circle")
                    .foregroundColor(CP.ice)
            }
            .buttonStyle(.plain)
            .help(L("library.info"))
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

private struct DownloadApkSheet: View {
    @Binding var url: String
    @Binding var filename: String
    let onDownload: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: L("library.downloadUrl"), accent: CP.ice)
            VStack(alignment: .leading, spacing: 6) {
                Text(L("library.download.urlLabel")).font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                TextField("https://.../app-release.apk", text: $url)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(12))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(L("library.download.filenameLabel")).font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                TextField(L("library.download.filenamePlaceholder"), text: $filename)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(12))
            }
            HStack {
                Spacer()
                Button(L("common.cancel")) { onCancel() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(L("library.download.start")) { onDownload() }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                    .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 420)
        .background(CP.bg)
    }
}
