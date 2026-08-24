import SwiftUI

extension Notification.Name {
    /// Отправляется из меню приложения (Cmd+K) — ContentView открывает по нему палитру.
    static let openCommandPalette = Notification.Name("openCommandPalette")
}

private enum PaletteResult: Identifiable {
    case tab(MainTab)
    case device(Device)
    case macro(Macro)

    var id: String {
        switch self {
        case .tab(let t): return "tab:\(t.rawValue)"
        case .device(let d): return "device:\(d.serial)"
        case .macro(let m): return "macro:\(m.id)"
        }
    }
}

/// Быстрый поиск (Cmd+K): переключение вкладки, выбор устройства или запуск
/// макроса — без похода мышью в сайдбар/тулбар. Список источников сознательно
/// небольшой и статичный (вкладки, устройства, макросы), а не индекс всего
/// приложения — этого достаточно для быстрой навигации, не усложняя поиск.
struct CommandPaletteView: View {
    @Binding var tab: MainTab
    @ObservedObject var devicesVM: DevicesViewModel
    let onDismiss: () -> Void

    @State private var query = ""
    @StateObject private var macroStore = MacroStore()
    @FocusState private var isFocused: Bool
    @EnvironmentObject private var loc: LocalizationManager

    private var results: [PaletteResult] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        let tabs = MainTab.allCases.filter { needle.isEmpty || $0.title.lowercased().contains(needle) }.map(PaletteResult.tab)
        let devices = devicesVM.devices.filter { needle.isEmpty || $0.displayName.lowercased().contains(needle) }.map(PaletteResult.device)
        let macros = macroStore.macros.filter { needle.isEmpty || $0.name.lowercased().contains(needle) }.map(PaletteResult.macro)
        return tabs + devices + macros
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(CP.textMuted)
                TextField(L("palette.placeholder"), text: $query)
                    .textFieldStyle(.plain)
                    .font(CP.mono(14))
                    .focused($isFocused)
                    .onSubmit { runFirstResult() }
            }
            .padding(14)

            Rectangle().fill(CP.hairline).frame(height: 1)

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(results) { result in
                        row(for: result)
                            .contentShape(Rectangle())
                            .onTapGesture { activate(result) }
                    }
                    if results.isEmpty {
                        Text(L("palette.empty"))
                            .font(CP.mono(12))
                            .foregroundColor(CP.textMuted)
                            .padding(20)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .frame(width: 480)
        .background(CP.bgPanel)
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(CP.hairline, lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 30)
        .onAppear { isFocused = true }
        .id(loc.language)
    }

    private func row(for result: PaletteResult) -> some View {
        HStack(spacing: 10) {
            switch result {
            case .tab(let t):
                Image(systemName: "square.grid.2x2").foregroundColor(CP.ice).frame(width: 16)
                Text(t.title).font(CP.mono(12, weight: .medium)).foregroundColor(CP.textPrimary)
                Spacer()
                Text(L("palette.kind.tab")).font(CP.code(9)).foregroundColor(CP.textMuted)
            case .device(let d):
                StatusDot(color: d.state.isReady ? CP.emerald : CP.crimson)
                Text(d.displayName).font(CP.mono(12, weight: .medium)).foregroundColor(CP.textPrimary)
                Spacer()
                Text(L("palette.kind.device")).font(CP.code(9)).foregroundColor(CP.textMuted)
            case .macro(let m):
                Image(systemName: "play.circle").foregroundColor(CP.gold).frame(width: 16)
                Text(m.name).font(CP.mono(12, weight: .medium)).foregroundColor(CP.textPrimary)
                Spacer()
                Text(L("palette.kind.macro")).font(CP.code(9)).foregroundColor(CP.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
    }

    private func runFirstResult() {
        guard let first = results.first else { return }
        activate(first)
    }

    private func activate(_ result: PaletteResult) {
        switch result {
        case .tab(let t):
            tab = t
        case .device(let d):
            devicesVM.selectedSerial = d.serial
        case .macro(let m):
            if let serial = devicesVM.selectedDevice?.serial {
                Task { await MacroRunner.run(m, serial: serial, service: devicesVM.service, variables: [:]) { _ in } }
            }
            tab = .macros
        }
        onDismiss()
    }
}
