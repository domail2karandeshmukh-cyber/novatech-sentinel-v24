#if canImport(AppKit) && canImport(SwiftUI)
import SwiftUI

/// NOVATECH Sentinel premium dark palette.
enum Theme {
    static let backgroundTop = Color(hex: 0x080D17)
    static let backgroundBottom = Color(hex: 0x0D1523)
    static let panel = Color(hex: 0x122136)
    static let border = Color(hex: 0x27405F) // 1 px cool border
    static let textPrimary = Color(hex: 0xEFF5FF)
    static let textSecondary = Color(hex: 0x9EB1C7)
    static let teal = Color(hex: 0x35D6C1) // assurance
    static let tealDeep = Color(hex: 0x24B3A1)
    static let ink = Color(hex: 0x04201C) // text on teal
    static let amber = Color(hex: 0xFFCA70) // advisory
    static let crimson = Color(hex: 0xFF5F74) // critical
    static let crimsonDeep = Color(hex: 0xD93A52) // keeps white text legible on the critical button
    static let cobalt = Color(hex: 0x6F95FF)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

struct PanelStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.panel))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
    }
}

extension View {
    func panelStyle() -> some View { modifier(PanelStyle()) }
}

struct SectionLabel: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color = Theme.textSecondary) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.system(size: 10.5, weight: .bold))
            .tracking(1.6)
            .foregroundStyle(color)
    }
}

/// Reject: the large, calm, visually primary choice.
struct SafeButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        SafeButtonBody(configuration: configuration)
    }

    private struct SafeButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isFocused) private var isFocused

        init(configuration: ButtonStyleConfiguration) {
            self.configuration = configuration
        }

        var body: some View {
            configuration.label
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(LinearGradient(colors: [Theme.teal, Theme.tealDeep], startPoint: .top, endPoint: .bottom))
                        .opacity(configuration.isPressed ? 0.82 : 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .strokeBorder(isFocused ? Theme.textPrimary : Color.clear, lineWidth: 2)
                )
                .shadow(color: Theme.teal.opacity(0.28), radius: 14, y: 4)
                .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
    }
}

/// Authorize: crimson, smaller, never default. Dashed and dimmed while locked.
struct CriticalButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        CriticalButtonBody(configuration: configuration)
    }

    private struct CriticalButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.isFocused) private var isFocused

        init(configuration: ButtonStyleConfiguration) {
            self.configuration = configuration
        }

        var body: some View {
            configuration.label
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(isEnabled ? Color.white : Theme.crimson.opacity(0.75))
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(isEnabled
                              ? AnyShapeStyle(LinearGradient(colors: [Theme.crimson, Theme.crimsonDeep], startPoint: .top, endPoint: .bottom))
                              : AnyShapeStyle(Theme.crimson.opacity(0.07)))
                        .opacity(configuration.isPressed ? 0.8 : 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .strokeBorder(
                            isFocused ? Theme.textPrimary : Theme.crimson.opacity(isEnabled ? 0.9 : 0.45),
                            style: StrokeStyle(lineWidth: isFocused ? 2 : 1, dash: isEnabled ? [] : [4, 3])
                        )
                )
                .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }
}

struct Backdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.backgroundTop, Theme.backgroundBottom], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Theme.cobalt.opacity(0.12), .clear], center: .topTrailing, startRadius: 10, endRadius: 460)
            RadialGradient(colors: [Theme.crimson.opacity(0.05), .clear], center: .bottomLeading, startRadius: 10, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}
#endif
