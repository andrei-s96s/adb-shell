import SwiftUI
import AppKit

/// Premium-палитра: графит + шампань-золото + ледяной синий в тёмном режиме,
/// тёплый офф-уайт с теми же акцентами (чуть углублёнными для контраста) в
/// светлом. Каждый токен — NSColor с dynamicProvider, поэтому меняется сам,
/// когда меняется системная/явно выбранная тема (SettingsView → ThemePreference,
/// применяется через .preferredColorScheme в AdbShellApp) — все ~30 View-файлов,
/// уже использующих CP.*, ничего не знают о теме и не требуют переписывания.
private func dynamicColor(
    light: (Double, Double, Double),
    dark: (Double, Double, Double),
    alpha: Double = 1
) -> Color {
    Color(NSColor(name: nil, dynamicProvider: { appearance in
        let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        let c = isDark ? dark : light
        return NSColor(red: c.0, green: c.1, blue: c.2, alpha: alpha)
    }))
}

enum CP {
    static let bg = dynamicColor(light: (0.97, 0.965, 0.955), dark: (0.043, 0.043, 0.051))
    static let bgPanel = dynamicColor(light: (1.0, 1.0, 1.0), dark: (0.086, 0.086, 0.098))
    static let bgPanelAlt = dynamicColor(light: (0.93, 0.925, 0.915), dark: (0.125, 0.125, 0.14))

    static let hairline = dynamicColor(light: (0, 0, 0), dark: (1, 1, 1), alpha: 0.08)
    static let grid = hairline // алиас для обратной совместимости

    // Светлые значения gold/emerald подобраны расчётом WCAG-контраста (не на глаз —
    // в этой среде нет возможности отрендерить SwiftUI): исходные (0.72,0.56,0.24) и
    // (0.13,0.52,0.35) давали всего ~2.5:1 и ~3.9:1 против CP.bgPanelAlt, где эти цвета
    // реально используются как foregroundColor текста (NeonButtonStyle, версии, статусы) —
    // ниже минимума 4.5:1 для обычного текста. Новые значения дают ≥4.5:1 против bg/
    // bgPanel/bgPanelAlt при той же тональности (тёплое золото / зелёный), см. историю коммита.
    static let gold = dynamicColor(light: (0.51, 0.40, 0.17), dark: (0.83, 0.69, 0.40))     // акцент
    static let ice = dynamicColor(light: (0.20, 0.42, 0.66), dark: (0.56, 0.72, 0.90))      // вторичный акцент
    static let rose = dynamicColor(light: (0.62, 0.30, 0.37), dark: (0.78, 0.52, 0.56))     // акцент "сеть"
    static let emerald = dynamicColor(light: (0.12, 0.47, 0.32), dark: (0.35, 0.78, 0.58)) // успех
    static let crimson = dynamicColor(light: (0.74, 0.16, 0.20), dark: (0.87, 0.34, 0.37)) // ошибка/деструктив

    // Алиасы под старые имена, чтобы не переписывать все вызовы в View-файлах.
    static let yellow = gold
    static let cyan = ice
    static let magenta = rose
    static let green = emerald
    static let red = crimson

    static let textPrimary = dynamicColor(light: (0.09, 0.09, 0.10), dark: (0.95, 0.95, 0.94))
    static let textMuted = dynamicColor(light: (0.40, 0.40, 0.44), dark: (0.58, 0.58, 0.63))

    /// Основной интерфейсный шрифт — системный rounded, читается дорого и современно.
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static let mono = Font.system(.body, design: .rounded)

    /// Моноширинный — только для технических значений: package name, путь, вывод shell.
    static func code(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension View {
    /// Мягкое акцентное свечение — используется для фокуса/выделения, не для рамок по умолчанию.
    func neonBorder(_ color: Color = CP.gold, width: CGFloat = 1, glow: CGFloat = 10, corner: CGFloat = 10) -> some View {
        self
            .overlay(
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .stroke(color.opacity(0.55), lineWidth: width)
            )
            .shadow(color: color.opacity(0.18), radius: glow)
    }

    /// Карточка/панель: скруглённые углы, тонкая обводка, лёгкая тень для глубины.
    func cpPanel(corner: CGFloat = 12) -> some View {
        self
            .background(CP.bgPanel)
            .overlay(
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .stroke(CP.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
            .shadow(color: Color.black.opacity(0.25), radius: 14, x: 0, y: 6)
    }

    func cpTracking(_ value: CGFloat = 0.4) -> some View {
        self.kerning(value)
    }
}

/// Кнопка в премиальном стиле: скруглённый прямоугольник, заполненная (основное
/// действие) либо призрачная с тонкой обводкой (второстепенное действие).
struct NeonButtonStyle: ButtonStyle {
    var accent: Color = CP.gold
    var filled: Bool = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let effectiveAccent = isEnabled ? accent : CP.textMuted
        configuration.label
            .font(CP.mono(12, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .foregroundColor(filled ? Color.black.opacity(isEnabled ? 0.85 : 0.5) : effectiveAccent)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(filled ? effectiveAccent : CP.bgPanelAlt)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(filled ? Color.clear : effectiveAccent.opacity(0.45), lineWidth: 1)
            )
            // Disabled — тускнеет независимо от filled/accent, иначе задизейбленная
            // кнопка (например "Сохранить" без заполненных полей) выглядит как
            // обычная активная, и непонятно, почему она не реагирует на клик.
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct StatusDot: View {
    var color: Color
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 6, height: 6)
            .shadow(color: color.opacity(0.6), radius: 3)
    }
}

/// Переключатель в духе macOS switch, перекрашенный под акцентный цвет темы.
struct NeonToggleStyle: ToggleStyle {
    var accent: Color = CP.gold

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 8) {
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(configuration.isOn ? accent.opacity(0.9) : CP.bgPanelAlt)
                        .overlay(Capsule().stroke(CP.hairline, lineWidth: 1))
                        .frame(width: 30, height: 17)
                    Circle()
                        .fill(Color.white)
                        .frame(width: 13, height: 13)
                        .padding(2)
                        .shadow(color: .black.opacity(0.3), radius: 1, y: 1)
                }
                configuration.label
            }
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.15), value: configuration.isOn)
    }
}

struct SectionLabel: View {
    let text: String
    var accent: Color = CP.ice
    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5).fill(accent).frame(width: 3, height: 12)
            Text(text)
                .font(CP.mono(11, weight: .semibold))
                .cpTracking(0.8)
                .textCase(.uppercase)
                .foregroundColor(CP.textMuted)
        }
    }
}

/// Витрина базовых элементов темы в обеих цветовых схемах — без неё
/// светлая/тёмная тема ни разу не была видна глазами: эта среда разработки
/// не может отрендерить SwiftUI, только Xcode Preview на реальном Mac.
private struct ThemeGallery: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: "Section label", accent: CP.gold)
            SectionLabel(text: "Ice accent", accent: CP.ice)
            SectionLabel(text: "Emerald accent", accent: CP.emerald)
            SectionLabel(text: "Crimson accent", accent: CP.crimson)

            HStack(spacing: 8) {
                Button("Filled") {}.buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                Button("Ghost") {}.buttonStyle(NeonButtonStyle(accent: CP.gold))
                Button("Destructive") {}.buttonStyle(NeonButtonStyle(accent: CP.crimson, filled: true))
            }

            Toggle("Toggle", isOn: .constant(true)).toggleStyle(NeonToggleStyle(accent: CP.gold))

            VStack(alignment: .leading, spacing: 4) {
                Text("Panel body text").font(CP.mono(12)).foregroundColor(CP.textPrimary)
                Text("Muted caption").font(CP.code(11)).foregroundColor(CP.textMuted)
                Text("Gold accent text").font(CP.mono(12, weight: .semibold)).foregroundColor(CP.gold)
                Text("Emerald accent text").font(CP.mono(12, weight: .semibold)).foregroundColor(CP.emerald)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cpPanel()
        }
        .padding(20)
        .frame(width: 340)
        .background(CP.bg)
    }
}

#Preview("Theme Gallery — Dark") {
    ThemeGallery().preferredColorScheme(.dark)
}

#Preview("Theme Gallery — Light") {
    ThemeGallery().preferredColorScheme(.light)
}
