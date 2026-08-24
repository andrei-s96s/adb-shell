import SwiftUI

/// Тестер deep link'ов: `am start -a android.intent.action.VIEW -d <uri>`
/// с сохранёнными пресетами для повторного запуска.
struct IntentTesterSheet: View {
    let serial: String
    let service: ADBService
    let onClose: () -> Void

    @StateObject private var store = IntentPresetStore()
    @State private var uri = ""
    @State private var presetName = ""
    @State private var isSending = false
    @State private var resultMessage: String?
    @State private var isError = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: L("intent.title"), accent: CP.gold)
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }
            Text(L("intent.hint")).font(CP.mono(11)).foregroundColor(CP.textMuted)

            HStack(spacing: 8) {
                TextField("https://example.com/path or myapp://screen", text: $uri)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(12))
                    .onSubmit { Task { await send() } }
                if isSending {
                    ProgressView().scaleEffect(0.6)
                } else {
                    Button(L("intent.send")) { Task { await send() } }
                        .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                        .disabled(uri.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            HStack(spacing: 8) {
                TextField(L("intent.presetName"), text: $presetName)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(11))
                Button(L("intent.savePreset")) {
                    store.add(name: presetName, uri: uri)
                    presetName = ""
                }
                .buttonStyle(NeonButtonStyle(accent: CP.ice))
                .disabled(uri.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if let resultMessage {
                Text(resultMessage).font(CP.mono(11)).foregroundColor(isError ? CP.crimson : CP.emerald)
            }

            if !store.presets.isEmpty {
                SectionLabel(text: L("intent.presets"), accent: CP.rose)
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(store.presets) { preset in
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(preset.name).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textPrimary)
                                    Text(preset.uri).font(CP.code(10)).foregroundColor(CP.textMuted).lineLimit(1).truncationMode(.middle)
                                }
                                Spacer()
                                Button(L("intent.send")) { uri = preset.uri; Task { await send() } }
                                    .buttonStyle(NeonButtonStyle(accent: CP.gold))
                                Button {
                                    store.remove(preset.id)
                                } label: {
                                    Image(systemName: "trash").foregroundColor(CP.crimson)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.vertical, 6)
                            Rectangle().fill(CP.hairline).frame(height: 1)
                        }
                    }
                }
                .frame(maxHeight: 200)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(width: 480, height: 460)
        .background(CP.bg)
    }

    private func send() async {
        let value = uri.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            let output = try await service.openDeepLink(serial: serial, uri: value)
            resultMessage = output.isEmpty ? L("intent.sent") : output
            isError = false
        } catch {
            resultMessage = error.localizedDescription
            isError = true
        }
    }
}
