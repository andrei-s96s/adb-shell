import SwiftUI

/// Модальный список ANR/tombstone файлов устройства (см. ADBService.crashTraces)
/// с просмотром содержимого выбранного файла.
struct CrashTracesSheet: View {
    let serial: String
    let service: ADBService
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: CrashTracesViewModel

    init(serial: String, service: ADBService) {
        self.serial = serial
        self.service = service
        _vm = StateObject(wrappedValue: CrashTracesViewModel(service: service))
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionLabel(text: L("crashes.title"), accent: CP.crimson)
                    Spacer()
                    Button(L("common.close")) { dismiss() }
                        .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                }
                .padding([.horizontal, .top], 14)

                if vm.isLoading {
                    ProgressView().tint(CP.gold).padding()
                } else if let error = vm.errorMessage {
                    Text(error).font(CP.mono(11)).foregroundColor(CP.crimson).padding(.horizontal, 14)
                } else if vm.files.isEmpty {
                    Text(L("crashes.empty"))
                        .font(CP.mono(11))
                        .foregroundColor(CP.textMuted)
                        .padding(14)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(vm.files) { file in
                                let isSelected = vm.selected == file
                                HStack(spacing: 6) {
                                    Image(systemName: file.kind == .anr ? "hourglass" : "xmark.octagon")
                                        .foregroundColor(file.kind == .anr ? CP.gold : CP.crimson)
                                        .font(.system(size: 11))
                                    Text(file.name)
                                        .font(CP.code(11))
                                        .foregroundColor(CP.textPrimary)
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                    Spacer()
                                }
                                .padding(.horizontal, 10).padding(.vertical, 7)
                                .background(isSelected ? CP.bgPanelAlt : Color.clear)
                                .contentShape(Rectangle())
                                .onTapGesture { Task { await vm.open(file, serial: serial) } }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(width: 260)
            .background(CP.bgPanel)

            Rectangle().fill(CP.hairline).frame(width: 1)

            ScrollView {
                if vm.isLoadingContent {
                    ProgressView().tint(CP.gold).padding(20)
                } else if let content = vm.traceContent {
                    Text(content)
                        .font(CP.code(11))
                        .foregroundColor(CP.textPrimary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                } else {
                    Text(L("crashes.selectHint"))
                        .font(CP.mono(12))
                        .foregroundColor(CP.textMuted)
                        .padding(20)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(CP.bg)
        }
        .frame(width: 820, height: 520)
        .task { await vm.load(serial: serial) }
    }
}
