import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Вкладка «Макросы»: именованные последовательности adb-команд (например
/// порядок действий при прошивке — root → remount → серия shell-команд),
/// запускаются одной кнопкой, шаг за шагом, с логом результата каждого шага.
/// Шаги могут содержать переменные `${NAME}` (запрашиваются перед запуском)
/// и остановку на первой ошибке — см. MacroRunner.
struct MacroView: View {
    let serial: String
    let service: ADBService

    @StateObject private var store = MacroStore()
    @State private var expandedMacroID: UUID?
    @State private var runningMacroID: UUID?
    @State private var results: [UUID: [MacroRunResult]] = [:]
    @State private var editingMacro: Macro?
    @State private var showEditor = false
    @State private var pendingVariablesMacro: Macro?
    @State private var variableValues: [String: String] = [:]
    @EnvironmentObject private var loc: LocalizationManager

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(text: L("macros.title"), accent: CP.gold)
                Spacer()
                Button(L("macros.import")) { importMacros() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(L("macros.export")) { exportMacros() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                    .disabled(store.macros.isEmpty)
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
            MacroEditorSheet(editing: editingMacro) { name, rawText, autorun, abortOnFailure in
                if let editingMacro {
                    store.update(editingMacro.id, name: name, rawText: rawText, autorunOnConnect: autorun, abortOnFirstFailure: abortOnFailure)
                } else {
                    store.add(name: name, rawText: rawText, autorunOnConnect: autorun, abortOnFirstFailure: abortOnFailure)
                }
                showEditor = false
            } onCancel: {
                showEditor = false
            }
        }
        .sheet(item: $pendingVariablesMacro) { macro in
            MacroVariablesSheet(
                macro: macro,
                values: $variableValues,
                onRun: {
                    pendingVariablesMacro = nil
                    startRun(macro, variables: variableValues)
                },
                onCancel: { pendingVariablesMacro = nil }
            )
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
                            HStack(spacing: 6) {
                                Text(macro.name)
                                    .font(CP.mono(13, weight: .semibold))
                                    .foregroundColor(CP.textPrimary)
                                if macro.autorunOnConnect {
                                    Image(systemName: "bolt.fill").font(.system(size: 9)).foregroundColor(CP.gold)
                                        .help(L("macros.autorun.help"))
                                }
                            }
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
                    Button(L("macros.run")) { requestRun(macro) }
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

    /// Если в макросе есть переменные — сначала спрашивает их значения,
    /// иначе запускает сразу.
    private func requestRun(_ macro: Macro) {
        let names = MacroRunner.variableNames(in: macro)
        guard !names.isEmpty else {
            startRun(macro, variables: [:])
            return
        }
        variableValues = Dictionary(uniqueKeysWithValues: names.map { ($0, "") })
        pendingVariablesMacro = macro
    }

    private func exportMacros() {
        guard let data = store.exportJSON() else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "adbshell-macros.json"
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? data.write(to: url)
    }

    private func importMacros() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url, let data = try? Data(contentsOf: url) else { return }
        try? store.importJSON(data)
    }

    private func startRun(_ macro: Macro, variables: [String: String]) {
        guard runningMacroID == nil else { return }
        runningMacroID = macro.id
        expandedMacroID = macro.id
        results[macro.id] = []
        Task {
            await MacroRunner.run(macro, serial: serial, service: service, variables: variables) { stepResult in
                results[macro.id, default: []].append(stepResult)
            }
            runningMacroID = nil
        }
    }
}

/// Запрашивает значения `${NAME}`-переменных макроса перед запуском.
private struct MacroVariablesSheet: View {
    let macro: Macro
    @Binding var values: [String: String]
    let onRun: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: L("macros.variables.title", macro.name), accent: CP.ice)
            ForEach(MacroRunner.variableNames(in: macro), id: \.self) { name in
                VStack(alignment: .leading, spacing: 3) {
                    Text(name).font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                    TextField(name, text: Binding(
                        get: { values[name] ?? "" },
                        set: { values[name] = $0 }
                    ))
                    .textFieldStyle(.plain)
                    .font(CP.code(12))
                    .padding(8)
                    .background(CP.bgPanelAlt)
                    .cornerRadius(6)
                }
            }
            HStack {
                Spacer()
                Button(L("common.cancel")) { onCancel() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(L("macros.run")) { onRun() }
                    .buttonStyle(NeonButtonStyle(accent: CP.emerald, filled: true))
            }
        }
        .padding(20)
        .frame(width: 380)
        .background(CP.bg)
    }
}

private struct MacroEditorSheet: View {
    let editing: Macro?
    let onSave: (String, String, Bool, Bool) -> Void
    let onCancel: () -> Void

    @State private var name: String
    @State private var rawText: String
    @State private var autorunOnConnect: Bool
    @State private var abortOnFirstFailure: Bool

    init(editing: Macro?, onSave: @escaping (String, String, Bool, Bool) -> Void, onCancel: @escaping () -> Void) {
        self.editing = editing
        self.onSave = onSave
        self.onCancel = onCancel
        _name = State(initialValue: editing?.name ?? "")
        _rawText = State(initialValue: editing?.steps.map { "adb \($0.argsLine)" }.joined(separator: "\n") ?? "")
        _autorunOnConnect = State(initialValue: editing?.autorunOnConnect ?? false)
        _abortOnFirstFailure = State(initialValue: editing?.abortOnFirstFailure ?? false)
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
                Text(L("macros.variables.hint"))
                    .font(CP.code(9))
                    .foregroundColor(CP.textMuted.opacity(0.8))
            }

            TextEditor(text: $rawText)
                .font(CP.code(11))
                .frame(minHeight: 180)
                .padding(6)
                .background(CP.bgPanelAlt)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(CP.hairline, lineWidth: 1))

            Text(L("macros.stepsCount", parsedStepsCount))
                .font(CP.mono(10))
                .foregroundColor(CP.textMuted)

            Toggle(isOn: $abortOnFirstFailure) {
                Text(L("macros.abortOnFailure")).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textPrimary)
            }
            .toggleStyle(NeonToggleStyle(accent: CP.rose))

            Toggle(isOn: $autorunOnConnect) {
                Text(L("macros.autorun")).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textPrimary)
            }
            .toggleStyle(NeonToggleStyle(accent: CP.gold))

            HStack {
                Spacer()
                Button(L("common.cancel")) { onCancel() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(L("common.save")) { onSave(name, rawText, autorunOnConnect, abortOnFirstFailure) }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || parsedStepsCount == 0)
            }
        }
        .padding(20)
        .frame(width: 500, height: 540)
        .background(CP.bg)
    }
}
