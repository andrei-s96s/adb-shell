import SwiftUI

private struct MacroStepResult: Identifiable {
    let id = UUID()
    let argsLine: String
    let output: String
    let isError: Bool
}

/// Вкладка «Макросы»: именованные последовательности adb-команд (например
/// порядок действий при прошивке — root → remount → серия shell-команд),
/// запускаются одной кнопкой, шаг за шагом, с логом результата каждого шага.
struct MacroView: View {
    let serial: String
    let service: ADBService

    @StateObject private var store = MacroStore()
    @State private var expandedMacroID: UUID?
    @State private var runningMacroID: UUID?
    @State private var results: [UUID: [MacroStepResult]] = [:]
    @State private var editingMacro: Macro?
    @State private var showEditor = false
    @EnvironmentObject private var loc: LocalizationManager

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(text: L("macros.title"), accent: CP.gold)
                Spacer()
                Button(L("macros.new")) {
                    editingMacro = nil
                    showEditor = true
                }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
            }
            .padding(16)

            Rectangle().fill(CP.hairline).frame(height: 1)

            if store.macros.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(store.macros) { macro in
                            macroRow(macro)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .id(loc.language)
        .sheet(isPresented: $showEditor) {
            MacroEditorSheet(editing: editingMacro) { name, rawText in
                if let editingMacro {
                    store.update(editingMacro.id, name: name, rawText: rawText)
                } else {
                    store.add(name: name, rawText: rawText)
                }
                showEditor = false
            } onCancel: {
                showEditor = false
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 30, weight: .light))
                .foregroundColor(CP.textMuted)
            Text(L("macros.empty"))
                .font(CP.mono(13, weight: .semibold))
                .foregroundColor(CP.textPrimary)
            Text(L("macros.empty.hint"))
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func macroRow(_ macro: Macro) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) {
                        expandedMacroID = (expandedMacroID == macro.id) ? nil : macro.id
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: expandedMacroID == macro.id ? "chevron.down" : "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(CP.textMuted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(macro.name)
                                .font(CP.mono(13, weight: .semibold))
                                .foregroundColor(CP.textPrimary)
                            Text(L("macros.stepsCount", macro.steps.count))
                                .font(CP.mono(10))
                                .foregroundColor(CP.textMuted)
                        }
                    }
                }
                .buttonStyle(.plain)

                Spacer()

                if runningMacroID == macro.id {
                    ProgressView().scaleEffect(0.6)
                } else {
                    Button(L("macros.run")) { runMacro(macro) }
                        .buttonStyle(NeonButtonStyle(accent: CP.emerald, filled: true))
                        .disabled(runningMacroID != nil)
                }

                Menu {
                    Button(L("macros.editAction")) {
                        editingMacro = macro
                        showEditor = true
                    }
                    Button(L("common.delete"), role: .destructive) { store.remove(macro.id) }
                } label: {
                    Image(systemName: "ellipsis.circle").foregroundColor(CP.textMuted)
                }
                .menuStyle(.borderlessButton)
                .frame(width: 22)
            }

            if expandedMacroID == macro.id {
                Divider().background(CP.hairline)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(macro.steps.enumerated()), id: \.element.id) { index, step in
                        // По индексу, а не по совпадению текста — в макросе шаги вроде
                        // "wait-for-device" могут повторяться несколько раз подряд.
                        let stepResults = results[macro.id] ?? []
                        let stepResult = stepResults.indices.contains(index) ? stepResults[index] : nil
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .top, spacing: 6) {
                                if let stepResult {
                                    Image(systemName: stepResult.isError ? "xmark.circle.fill" : "checkmark.circle.fill")
                                        .font(.system(size: 11))
                                        .foregroundColor(stepResult.isError ? CP.crimson : CP.emerald)
                                } else {
                                    Text("\(index + 1).")
                                        .font(CP.code(10))
                                        .foregroundColor(CP.textMuted)
                                }
                                Text("adb \(step.argsLine)")
                                    .font(CP.code(10, weight: .medium))
                                    .foregroundColor(CP.textPrimary)
                                    .textSelection(.enabled)
                            }
                            if let stepResult, !stepResult.output.isEmpty {
                                Text(stepResult.output)
                                    .font(CP.code(9))
                                    .foregroundColor(stepResult.isError ? CP.crimson : CP.textMuted)
                                    .textSelection(.enabled)
                                    .padding(.leading, 17)
                            }
                        }
                    }
                }
            }
        }
        .padding(12)
        .cpPanel()
    }

    private func runMacro(_ macro: Macro) {
        guard runningMacroID == nil else { return }
        runningMacroID = macro.id
        expandedMacroID = macro.id
        results[macro.id] = []
        Task {
            for step in macro.steps {
                let tokens = step.argsLine.split(separator: " ").map(String.init)
                guard !tokens.isEmpty else { continue }
                do {
                    let result = try await service.run(tokens, serial: serial)
                    results[macro.id, default: []].append(
                        MacroStepResult(argsLine: step.argsLine, output: result.combined, isError: result.exitCode != 0)
                    )
                } catch {
                    results[macro.id, default: []].append(
                        MacroStepResult(argsLine: step.argsLine, output: error.localizedDescription, isError: true)
                    )
                }
            }
            runningMacroID = nil
        }
    }
}

private struct MacroEditorSheet: View {
    let editing: Macro?
    let onSave: (String, String) -> Void
    let onCancel: () -> Void

    @State private var name: String
    @State private var rawText: String

    init(editing: Macro?, onSave: @escaping (String, String) -> Void, onCancel: @escaping () -> Void) {
        self.editing = editing
        self.onSave = onSave
        self.onCancel = onCancel
        _name = State(initialValue: editing?.name ?? "")
        _rawText = State(initialValue: editing?.steps.map { "adb \($0.argsLine)" }.joined(separator: "\n") ?? "")
    }

    private var parsedStepsCount: Int { MacroStore.parseSteps(from: rawText).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: editing == nil ? L("macros.new") : L("macros.editAction"), accent: CP.gold)
                Spacer()
                Button { onCancel() } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(CP.textMuted)
                }
                .buttonStyle(.plain)
            }

            TextField(L("macros.name.placeholder"), text: $name)
                .textFieldStyle(.plain)
                .font(CP.mono(13, weight: .medium))
                .padding(10)
                .background(CP.bgPanelAlt)
                .cornerRadius(6)

            VStack(alignment: .leading, spacing: 4) {
                Text(L("macros.steps.hint"))
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)
                Text(L("macros.steps.example"))
                    .font(CP.code(9))
                    .foregroundColor(CP.textMuted.opacity(0.8))
            }

            TextEditor(text: $rawText)
                .font(CP.code(11))
                .frame(minHeight: 220)
                .padding(6)
                .background(CP.bgPanelAlt)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(CP.hairline, lineWidth: 1))

            Text(L("macros.stepsCount", parsedStepsCount))
                .font(CP.mono(10))
                .foregroundColor(CP.textMuted)

            HStack {
                Spacer()
                Button(L("common.cancel")) { onCancel() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(L("common.save")) { onSave(name, rawText) }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || parsedStepsCount == 0)
            }
        }
        .padding(20)
        .frame(width: 500, height: 460)
        .background(CP.bg)
    }
}
