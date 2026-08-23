import SwiftUI

/// Цветовая палитра в духе Cyberpunk 2077: почти чёрный фон,
/// сигнальный жёлтый как основной акцент, циан и magenta как вторичные.
enum CP {
    static let bg = Color(red: 0.02, green: 0.02, blue: 0.035)
    static let bgPanel = Color(red: 0.06, green: 0.06, blue: 0.08)
    static let bgPanelAlt = Color(red: 0.09, green: 0.09, blue: 0.11)
    static let grid = Color(red: 0.16, green: 0.16, blue: 0.19)

    static let yellow = Color(red: 0.99, green: 0.93, blue: 0.04)   // #FCEE0A
    static let cyan = Color(red: 0.0, green: 0.94, blue: 1.0)       // #00F0FF
    static let magenta = Color(red: 1.0, green: 0.0, blue: 0.42)    // #FF006B
    static let green = Color(red: 0.0, green: 1.0, blue: 0.56)      // успех
    static let red = Color(red: 1.0, green: 0.15, blue: 0.28)       // ошибка/деструктив

    static let textPrimary = Color(red: 0.93, green: 0.94, blue: 0.94)
    static let textMuted = Color(red: 0.55, green: 0.57, blue: 0.6)

    static let mono = Font.system(.body, design: .monospaced)
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension View {
    /// Тонкая неоновая рамка со свечением заданного цвета.
    func neonBorder(_ color: Color = CP.yellow, width: CGFloat = 1, glow: CGFloat = 6, corner: CGFloat = 2) -> some View {
        self
            .overlay(
                RoundedRectangle(cornerRadius: corner)
                    .stroke(color.opacity(0.9), lineWidth: width)
            )
            .shadow(color: color.opacity(0.35), radius: glow)
    }

    func cpPanel(corner: CGFloat = 2) -> some View {
        self
            .background(CP.bgPanel)
            .overlay(
                RoundedRectangle(cornerRadius: corner)
                    .stroke(CP.grid, lineWidth: 1)
            )
    }

    func cpTracking(_ value: CGFloat = 1.5) -> some View {
        self.kerning(value)
    }
}

/// Кнопка в фирменном стиле: чёткие углы, обводка, инверсия цвета при наведении/нажатии.
struct NeonButtonStyle: ButtonStyle {
    var accent: Color = CP.yellow
    var filled: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CP.mono(11, weight: .semibold))
            .cpTracking(1.2)
            .textCase(.uppercase)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .foregroundColor(filled ? CP.bg : accent)
            .background(filled ? accent : Color.clear)
            .overlay(
                Rectangle()
                    .stroke(accent, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(Rectangle())
    }
}

struct StatusDot: View {
    var color: Color
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .shadow(color: color.opacity(0.8), radius: 4)
    }
}

struct SectionLabel: View {
    let text: String
    var accent: Color = CP.cyan
    var body: some View {
        HStack(spacing: 6) {
            Rectangle().fill(accent).frame(width: 3, height: 12)
            Text(text)
                .font(CP.mono(11, weight: .bold))
                .cpTracking(2)
                .textCase(.uppercase)
                .foregroundColor(accent)
        }
    }
}
