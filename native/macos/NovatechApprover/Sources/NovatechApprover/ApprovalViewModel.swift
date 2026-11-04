#if canImport(AppKit) && canImport(SwiftUI)
import AppKit
import SwiftUI
#if canImport(ApproverCore)
import ApproverCore
#endif

/// Thin bridge between the pure `CountdownMachine` and SwiftUI. All rules live in the core.
@MainActor
final class ApprovalViewModel: ObservableObject {
    let request: ApprovalRequest
    var onDecision: ((DecisionEvent) -> Void)?

    /// Starts with the caller-supplied name; replaced by the Mac's own name once known.
    @Published private(set) var deviceName: String
    @Published private(set) var secondsLeft: Int
    @Published private(set) var fractionRemaining: Double = 1
    @Published private(set) var authorizeEnabled = false
    @Published private(set) var armingRemaining: TimeInterval = CountdownMachine.armingDelay
    @Published private(set) var windowIsKey = false

    private var machine: CountdownMachine
    private let clock: () -> TimeInterval
    private var announcedThresholds: Set<Int> = []

    init(request: ApprovalRequest, clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.request = request
        self.deviceName = request.deviceName ?? "This Mac"
        self.clock = clock
        let now = clock()
        let machine = ApprovalViewModel.makeMachine(for: request, at: now)
        self.machine = machine
        self.secondsLeft = machine.displaySeconds(at: now)
        self.fractionRemaining = machine.fractionRemaining(at: now)
    }

    var endsWithSession: Bool { machine.endsWithSession }

    private static func makeMachine(for request: ApprovalRequest, at now: TimeInterval) -> CountdownMachine {
        CountdownMachine(
            timeoutSeconds: request.timeoutSeconds,
            startedAt: now,
            sessionRemaining: request.sessionExpiresAt?.timeIntervalSinceNow
        )
    }

    /// Restart the countdown at the moment the window is shown.
    func start() {
        let now = clock()
        machine = ApprovalViewModel.makeMachine(for: request, at: now)
        if windowIsKey { machine.windowBecameKey(at: now) }
        refresh(at: now)
    }

    func tick() {
        let now = clock()
        if let event = machine.tick(at: now) {
            deliver(event)
            return
        }
        refresh(at: now)
    }

    func setWindowKey(_ isKey: Bool) {
        let now = clock()
        windowIsKey = isKey
        if isKey { machine.windowBecameKey(at: now) }
        refresh(at: now)
    }

    func reject(_ source: RejectSource) {
        if let event = machine.reject(at: clock(), source: source) { deliver(event) }
    }

    func authorize() {
        let now = clock()
        if let event = machine.authorize(at: now, windowIsKey: windowIsKey) {
            deliver(event)
        } else {
            refresh(at: now)
        }
    }

    func fail(_ detail: String) {
        if let event = machine.fail(detail) { deliver(event) }
    }

    /// Device identity = Host.current().localizedName ?? the caller's deviceName.
    func useLocalDeviceName(_ localName: String?) {
        if let localName, let clean = RequestParser.sanitize(localName) { deviceName = clean }
    }

    func announceOpening() {
        announce("Shutdown authorization requested by \(request.requesterName). Reject is the default. \(secondsLeft) seconds to decide.")
    }

    private func deliver(_ event: DecisionEvent) {
        onDecision?(event)
    }

    private func refresh(at now: TimeInterval) {
        let seconds = machine.displaySeconds(at: now)
        if seconds != secondsLeft {
            secondsLeft = seconds
            announceIfNeeded(seconds)
        }
        fractionRemaining = machine.fractionRemaining(at: now)
        let enabled = machine.canAuthorize(at: now, windowIsKey: windowIsKey)
        if enabled != authorizeEnabled { authorizeEnabled = enabled }
        let arming = (machine.armingRemaining(at: now) * 10).rounded(.up) / 10
        if arming != armingRemaining { armingRemaining = arming }
    }

    private func announceIfNeeded(_ seconds: Int) {
        guard [20, 10, 5].contains(seconds), !announcedThresholds.contains(seconds) else { return }
        announcedThresholds.insert(seconds)
        announce("\(seconds) seconds left. The request is rejected automatically when time runs out.")
    }

    /// VoiceOver announcement; harmless when VoiceOver is off.
    private func announce(_ text: String) {
        NSAccessibility.post(
            element: NSApplication.shared,
            notification: .announcementRequested,
            userInfo: [
                .announcement: text,
                .priority: NSAccessibilityPriorityLevel.high.rawValue,
            ]
        )
    }
}
#endif
