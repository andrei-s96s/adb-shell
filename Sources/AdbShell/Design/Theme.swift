import SwiftUI

/// Премиальная тёмная палитра: графит + шампань-золото + ледяной синий.
/// Никакого неона — мягкие тени, тонкие hairline-обводки, скруглённые углы.
enum CP {
    static let bg = Color(red: 0.043, green: 0.043, blue: 0.051)          // #0B0B0D
    static let bgPanel = Color(red: 0.086, green: 0.086, blue: 0.098)     // #16161A
    static let bgPanelAlt = Color(red: 0.125, green: 0.125, blue: 0.14)   // #202024

    static let hairline = Color.white.opacity(0.08)
    static let grid = hairline // алиас для обратной совместимости

    static let gold = Color(red: 0.83, green: 0.69, blue: 0.40)     // #D4AF66 — основной акцент
    static let ice = Color(red: 0.56, green: 0.72, blue: 0.90)      // #8FB8E6 — вторичный акцент
    static let rose = Color(red: 0.78, green: 0.52, blue: 0.56)     // #C7848F — акцент "сеть"
    static let emerald = Color(red: 0.35, green: 0.78, blue: 0.58) // успех
    static let crimson = Color(red: 0.87, green: 0.34, blue: 0.37) // ошибка/деструктив

    // Алиасы под старые имена, чтобы не переписывать все вызовы в View-файлах.
    static let yellow = gold
    static let cyan = ice
    static let magenta = rose
    static let green = emerald
    static let red = crimson

    static let textPrimary = Color(red: 0.95, green: 0.95, blue: 0.94)
    static let textMuted = Color(red: 0.58, green: 0.58, blue: 0.63)

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

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CP.mono(12, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .foregroundColor(filled ? Color.black.opacity(0.85) : accent)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(filled ? accent : CP.bgPanelAlt)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(filled ? Color.clear : accent.opacity(0.45), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
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
