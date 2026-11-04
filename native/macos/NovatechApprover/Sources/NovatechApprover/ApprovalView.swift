#if canImport(AppKit) && canImport(SwiftUI)
import SwiftUI
#if canImport(ApproverCore)
import ApproverCore
#endif

enum ApprovalFocus: Hashable {
    case reject
    case authorize
}

/// The whole approval window. Header and action bar are pinned; the middle scrolls on small
/// (projector) screens so Reject is always visible. Views that read the main-actor model are
/// marked @MainActor explicitly (older SDKs only isolate `body`).
@MainActor
struct ApprovalView: View {
    @ObservedObject var model: ApprovalViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var focus: ApprovalFocus?

    // Explicit, because private stored properties would make the synthesized initializer private.
    init(model: ApprovalViewModel) {
        _model = ObservedObject(wrappedValue: model)
    }

    var body: some View {
        VStack(spacing: 0) {
            HeaderBar(mode: model.request.mode)
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 14) {
                    StatusTrack(channel: model.request.channel, reduceMotion: reduceMotion)
                    SummaryPanel(model: model, reduceMotion: reduceMotion)
                    RequesterPanel(request: model.request)
                    IncidentPanel(request: model.request)
                    GovernancePanel(entries: model.request.governance)
                    ConsequencePanel(request: model.request)
                    ConnectionPanel(request: model.request, endsWithSession: model.endsWithSession)
                }
                .padding(.horizontal, 24)
                .padding(.top, 2)
                .padding(.bottom, 18)
            }
            ActionBar(model: model, focus: $focus)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Backdrop())
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        // Keyboard focus starts on Reject and never on Authorize.
        .defaultFocus($focus, .reject)
    }
}

// MARK: - Header

private struct HeaderBar: View {
    let mode: ApprovalMode

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.teal.opacity(0.08))
                RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.teal.opacity(0.45), lineWidth: 1)
                Image(systemName: "hexagon")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.teal)
            }
            .frame(width: 38, height: 38)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text("NOVATECH SENTINEL")
                    .font(.system(size: 14, weight: .bold))
                    .tracking(2.6)
                    .foregroundStyle(Theme.textPrimary)
                Text("ENDPOINT ACTION AUTHORIZATION")
                    .font(.system(size: 10.5, weight: .semibold))
                    .tracking(1.9)
                    .foregroundStyle(Theme.textSecondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 12)
            ModeBadge(mode: mode)
        }
        .padding(.horizontal, 24)
        .padding(.top, 40) // clears the window's close button
        .padding(.bottom, 14)
    }
}

private struct ModeBadge: View {
    let mode: ApprovalMode

    var body: some View {
        let live = mode == .live
        let tint = live ? Theme.crimson : Theme.amber
        HStack(spacing: 6) {
            Circle().fill(tint).frame(width: 7, height: 7)
            Text(live ? "LIVE · REAL SHUTDOWN" : "PREVIEW · NO SHUTDOWN")
                .font(.system(size: 10.5, weight: .bold))
                .tracking(1.2)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.12)))
        .overlay(Capsule().strokeBorder(tint.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(live ? "Live request. Approving shuts down this Mac." : "Preview. Approving will not shut down this Mac.")
    }
}

// MARK: - Two-state status line

private struct StatusTrack: View {
    let channel: ApprovalChannel
    let reduceMotion: Bool
    @State var pulse = false // not private: keeps the memberwise initializer usable from ApprovalView

    private var receivedTitle: String {
        channel == .localHelper ? "Local request received" : "Remote request received"
    }

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 7) {
                Image(systemName: "checkmark.circle.fill")
                Text(receivedTitle).font(.system(size: 12.5, weight: .semibold))
            }
            .foregroundStyle(Theme.teal)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Theme.teal.opacity(0.10)))

            Rectangle()
                .fill(LinearGradient(colors: [Theme.teal.opacity(0.8), Theme.amber.opacity(0.8)], startPoint: .leading, endPoint: .trailing))
                .frame(width: 34, height: 1.5)

            HStack(spacing: 7) {
                Circle()
                    .fill(Theme.amber)
                    .frame(width: 8, height: 8)
                    .opacity(reduceMotion ? 1 : (pulse ? 0.3 : 1))
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
                Text("Owner approval pending").font(.system(size: 12.5, weight: .semibold))
            }
            .foregroundStyle(Theme.amber)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Theme.amber.opacity(0.10)))
            .overlay(Capsule().strokeBorder(Theme.amber.opacity(0.45), lineWidth: 1))

            Spacer(minLength: 0)
        }
        .onAppear { if !reduceMotion { pulse = true } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Status: \(receivedTitle). Owner approval pending — your decision is needed.")
    }
}

// MARK: - Countdown + action summary

@MainActor
private struct SummaryPanel: View {
    @ObservedObject var model: ApprovalViewModel
    let reduceMotion: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 20) {
            CountdownView(fraction: model.fractionRemaining, seconds: model.secondsLeft, reduceMotion: reduceMotion)
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("REQUESTED ACTION")
                Text(model.request.mode == .live ? "Shut down this Mac" : "Shut down this Mac (preview only)")
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                DetailRow(symbol: "laptopcomputer", label: "Device", value: model.deviceName)
                DetailRow(symbol: "person.crop.circle", label: "Owner", value: model.request.ownerName)
            }
            Spacer(minLength: 0)
        }
        .panelStyle()
    }
}

/// Critical countdown ring. With Reduce Motion: no ring animation, a plain text countdown.
private struct CountdownView: View {
    let fraction: Double
    let seconds: Int
    let reduceMotion: Bool

    var body: some View {
        Group {
            if reduceMotion {
                VStack(spacing: 2) {
                    Text("\(seconds)")
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text("SECONDS LEFT")
                        .font(.system(size: 9, weight: .bold))
                        .tracking(1.2)
                }
                .foregroundStyle(Theme.crimson)
                .frame(width: 104, height: 104)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.crimson.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.crimson.opacity(0.6), lineWidth: 1))
            } else {
                ZStack {
                    Circle().stroke(Theme.crimson.opacity(0.16), lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: max(0.001, fraction))
                        .stroke(Theme.crimson, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.15), value: fraction)
                    VStack(spacing: 0) {
                        Text("\(seconds)")
                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                        Text("SEC")
                            .font(.system(size: 9.5, weight: .bold))
                            .tracking(1.6)
                            .foregroundStyle(Theme.crimson)
                    }
                }
                .frame(width: 104, height: 104)
                .shadow(color: Theme.crimson.opacity(0.22), radius: 12)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Time remaining")
        .accessibilityValue("\(seconds) seconds")
        .accessibilityHint("When time runs out, the request is rejected automatically.")
    }
}

private struct DetailRow: View {
    let symbol: String
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.cobalt)
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 52, alignment: .leading)
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Requester, incident, governance

private struct RequesterPanel: View {
    let request: ApprovalRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            SectionLabel("REQUESTED BY")
            HStack(spacing: 10) {
                Image(systemName: "person.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.cobalt)
                    .accessibilityHidden(true)
                Text(request.requesterName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
            }
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .accessibilityHidden(true)
                Text(request.requesterContext)
                    .font(.system(size: 12))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Theme.amber)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.amber.opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Theme.amber.opacity(0.35), lineWidth: 1))
        }
        .panelStyle()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Requested by \(request.requesterName). \(request.requesterContext)")
    }
}

private struct IncidentPanel: View {
    let request: ApprovalRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            SectionLabel("INCIDENT")
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(request.incidentId)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.cobalt)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Theme.cobalt.opacity(0.12)))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Theme.cobalt.opacity(0.45), lineWidth: 1))
                Text(request.scenario)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Reason")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(width: 52, alignment: .leading)
                Text(request.reason)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .panelStyle()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Incident \(request.incidentId): \(request.scenario). Reason: \(request.reason)")
    }
}

private struct GovernancePanel: View {
    let entries: [GovernanceEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                SectionLabel("GOVERNANCE CHAIN")
                Spacer(minLength: 8)
                Text(ApprovalRequest.governanceLabel)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(Theme.amber)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .overlay(Capsule().strokeBorder(Theme.amber.opacity(0.5), lineWidth: 1))
            }
            .accessibilityElement(children: .combine)

            if entries.isEmpty {
                Text("No governance record was attached to this request.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
                        GovernanceRow(index: index + 1, entry: entry)
                        if index < entries.count - 1 {
                            Rectangle().fill(Theme.border.opacity(0.7)).frame(height: 1)
                        }
                    }
                }
            }
        }
        .panelStyle()
    }
}

private struct GovernanceRow: View {
    let index: Int
    let entry: GovernanceEntry

    private var spokenLabel: String {
        var parts = ["Gate \(index): \(entry.gate)", entry.role.isEmpty ? entry.person : "\(entry.person), \(entry.role)"]
        if !entry.decision.isEmpty { parts.append(entry.decision) }
        return parts.joined(separator: ". ")
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("\(index)")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Theme.cobalt)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Theme.cobalt.opacity(0.14)))
                .overlay(Circle().strokeBorder(Theme.cobalt.opacity(0.45), lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.gate)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(entry.role.isEmpty ? entry.person : "\(entry.person) · \(entry.role)")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
            }
            Spacer(minLength: 8)
            if !entry.decision.isEmpty {
                Text(entry.decision)
                    .font(.system(size: 11, weight: .semibold))
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
                    .foregroundStyle(Theme.teal)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Theme.teal.opacity(0.10)))
            }
        }
        .padding(.vertical, 7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
    }
}

// MARK: - Consequence and connection

private struct ConsequencePanel: View {
    let request: ApprovalRequest

    var body: some View {
        let live = request.mode == .live
        let tint = live ? Theme.crimson : Theme.amber
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: live ? "power" : "eye")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(Circle().fill(tint.opacity(0.14)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                SectionLabel(live ? "CONSEQUENCE" : "PREVIEW — NOTHING WILL SHUT DOWN", color: tint)
                Text(live ? ApprovalRequest.fixedConsequence : "Approving this preview will NOT shut down this Mac.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if !live {
                    Text("In a LIVE request, Authorize Shutdown shuts down this Mac. Open apps will close — save your work first.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note = request.additionalConsequenceNote {
                    Text("Request note: \(note)")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(tint.opacity(0.55), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

private struct ConnectionPanel: View {
    let request: ApprovalRequest
    let endsWithSession: Bool

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()

    private var title: String {
        request.channel == .lanTLS ? "Secure connection" : "Local connection"
    }

    private var details: String {
        switch request.channel {
        case .lanTLS:
            var parts = ["Paired LAN session", "TLS-encrypted (self-signed certificate)"]
            if let expires = request.sessionExpiresAt {
                parts.append("Session ends \(ConnectionPanel.timeFormatter.string(from: expires))")
            } else {
                parts.append("Session expiry not provided")
            }
            return parts.joined(separator: " · ")
        case .localHelper:
            return "Same-Mac helper · 127.0.0.1 only · helper session code verified"
        }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: request.channel == .lanTLS ? "lock.shield.fill" : "desktopcomputer")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.teal)
                .frame(width: 30, height: 30)
                .background(Circle().fill(Theme.teal.opacity(0.12)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(details)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if endsWithSession {
                    Text("The paired session ends before the timer does; the request closes with it.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .panelStyle()
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Actions

@MainActor
private struct ActionBar: View {
    @ObservedObject var model: ApprovalViewModel
    var focus: FocusState<ApprovalFocus?>.Binding

    private var authorizeCaption: String {
        if model.authorizeEnabled {
            return model.request.mode == .live ? "Shuts down this Mac when clicked" : "Preview: nothing will shut down"
        }
        if !model.windowIsKey { return "Click this window first to unlock" }
        return String(format: "Unlocks in %.1f s", model.armingRemaining)
    }

    private var authorizeHint: String {
        let effect = model.request.mode == .live ? "Shuts down this Mac." : "Preview only: nothing will shut down."
        return "\(effect) Unlocks 1.5 seconds after the window is shown or focused. Never the default button."
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 0) {
                Button(action: { model.reject(.rejectButton) }) {
                    HStack(spacing: 10) {
                        Image(systemName: "hand.raised.fill")
                        Text("Reject")
                    }
                }
                .buttonStyle(SafeButtonStyle())
                .focused(focus, equals: .reject)
                .accessibilityLabel("Reject shutdown request")
                .accessibilityHint("Keeps this Mac on. Return and Escape also reject.")

                // Physical separation between the safe and the critical action.
                Color.clear.frame(width: 28, height: 1)
                Rectangle().fill(Theme.border).frame(width: 1, height: 46).accessibilityHidden(true)
                Color.clear.frame(width: 28, height: 1)

                Button(action: { model.authorize() }) {
                    HStack(spacing: 8) {
                        Image(systemName: model.authorizeEnabled ? "power" : "lock.fill")
                        Text("Authorize Shutdown")
                    }
                }
                .buttonStyle(CriticalButtonStyle())
                .disabled(!model.authorizeEnabled)
                .focused(focus, equals: .authorize)
                .frame(width: 214)
                .accessibilityLabel("Authorize shutdown")
                .accessibilityValue(model.authorizeEnabled ? "Available" : "Locked")
                .accessibilityHint(authorizeHint)
            }

            HStack(spacing: 8) {
                Label("Return or Esc rejects", systemImage: "keyboard")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 8)
                Text(authorizeCaption)
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(model.authorizeEnabled ? Theme.crimson : Theme.textSecondary)
            }
            .accessibilityHidden(true) // the same information is in the buttons' hints
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 18)
        .background(Theme.panel.opacity(0.65))
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.border).frame(height: 1)
        }
    }
}
#endif
