import Foundation

/// The only four answers the companion can give. Exit codes are part of the protocol with
/// scripts/mac-approval.mjs, which only treats `approve` + exit 0 as consent.
public enum ApprovalDecision: String, Equatable, CaseIterable {
    case approve
    case reject
    case timeout
    case error

    public var exitCode: Int32 {
        switch self {
        case .approve: return 0
        case .reject: return 10
        case .timeout: return 11
        case .error: return 12
        }
    }
}

public struct DecisionEvent: Equatable {
    public let decision: ApprovalDecision
    public let detail: String

    public init(decision: ApprovalDecision, detail: String) {
        self.decision = decision
        self.detail = detail
    }
}

/// Every way the owner (or the window) can say no. All of them map to `reject`.
public enum RejectSource: Equatable {
    case rejectButton
    case returnKey
    case escapeKey
    case windowClosed
    case appQuit

    public var detail: String {
        switch self {
        case .rejectButton: return "Owner rejected the request (Reject button)."
        case .returnKey: return "Owner rejected the request (Return key)."
        case .escapeKey: return "Owner rejected the request (Escape key)."
        case .windowClosed: return "The approval window was closed — treated as a rejection."
        case .appQuit: return "The approval app was quit — treated as a rejection."
        }
    }
}

/// Timing and decision rules, independent of any UI. All times are monotonic seconds
/// (for example `ProcessInfo.processInfo.systemUptime`), so wall-clock changes cannot extend
/// or shorten the decision window.
///
/// Rules:
/// * Exactly one decision: after the first one, every later event is ignored (returns nil).
/// * At or after the deadline the only possible outcome is `timeout` (fail closed).
/// * `reject` is always available before the deadline.
/// * `approve` needs the window to be key (focused) and the arming delay to have passed. The
///   delay starts when the window is shown and restarts whenever the window regains focus, so a
///   click or key press carried over from another app can never authorize.
public struct CountdownMachine: Equatable {
    public static let armingDelay: TimeInterval = 1.5

    public let startedAt: TimeInterval
    public let timeoutSeconds: Int
    public let deadline: TimeInterval
    /// True when the paired session ends before the normal timeout and so ends the window early.
    public let endsWithSession: Bool
    public private(set) var armedAt: TimeInterval
    public private(set) var outcome: DecisionEvent?

    /// - Parameters:
    ///   - timeoutSeconds: clamped to 10…60.
    ///   - startedAt: monotonic time at which the window became visible.
    ///   - sessionRemaining: seconds until the paired session expires, when known.
    public init(timeoutSeconds: Int, startedAt: TimeInterval, sessionRemaining: TimeInterval? = nil) {
        let clamped = min(max(timeoutSeconds, ApprovalLimits.minTimeoutSeconds), ApprovalLimits.maxTimeoutSeconds)
        self.timeoutSeconds = clamped
        self.startedAt = startedAt
        let timeoutDeadline = startedAt + TimeInterval(clamped)
        if let sessionRemaining, startedAt + max(0, sessionRemaining) < timeoutDeadline {
            deadline = startedAt + max(0, sessionRemaining)
            endsWithSession = true
        } else {
            deadline = timeoutDeadline
            endsWithSession = false
        }
        armedAt = startedAt + CountdownMachine.armingDelay
        outcome = nil
    }

    public var isDecided: Bool { outcome != nil }

    public func remaining(at now: TimeInterval) -> TimeInterval {
        max(0, deadline - now)
    }

    /// 1 → 0 over the full timeout (for the countdown ring).
    public func fractionRemaining(at now: TimeInterval) -> Double {
        min(1, max(0, remaining(at: now) / TimeInterval(timeoutSeconds)))
    }

    /// Whole seconds shown to the owner (rounded up, so "1" is shown until the very end).
    public func displaySeconds(at now: TimeInterval) -> Int {
        Int(remaining(at: now).rounded(.up))
    }

    public func armingRemaining(at now: TimeInterval) -> TimeInterval {
        max(0, armedAt - now)
    }

    public func canAuthorize(at now: TimeInterval, windowIsKey: Bool) -> Bool {
        outcome == nil && windowIsKey && now >= armedAt && now < deadline
    }

    /// Restart the arming delay whenever the window becomes key again.
    public mutating func windowBecameKey(at now: TimeInterval) {
        guard outcome == nil else { return }
        armedAt = max(armedAt, now + CountdownMachine.armingDelay)
    }

    @discardableResult
    public mutating func tick(at now: TimeInterval) -> DecisionEvent? {
        guard outcome == nil, now >= deadline else { return nil }
        let detail = endsWithSession
            ? "The paired session expired before a decision — failed closed (no shutdown)."
            : "No owner decision within \(timeoutSeconds) seconds — failed closed (no shutdown)."
        return record(.timeout, detail)
    }

    @discardableResult
    public mutating func reject(at now: TimeInterval, source: RejectSource) -> DecisionEvent? {
        guard outcome == nil else { return nil }
        if now >= deadline { return tick(at: now) }
        return record(.reject, source.detail)
    }

    /// Returns nil (ignored) while arming or when the window is not focused.
    @discardableResult
    public mutating func authorize(at now: TimeInterval, windowIsKey: Bool) -> DecisionEvent? {
        guard outcome == nil else { return nil }
        if now >= deadline { return tick(at: now) }
        guard windowIsKey, now >= armedAt else { return nil }
        return record(.approve, "Owner authorized the shutdown in the NOVATECH approval window.")
    }

    @discardableResult
    public mutating func fail(_ detail: String) -> DecisionEvent? {
        guard outcome == nil else { return nil }
        return record(.error, detail)
    }

    private mutating func record(_ decision: ApprovalDecision, _ detail: String) -> DecisionEvent {
        let event = DecisionEvent(decision: decision, detail: detail)
        outcome = event
        return event
    }
}
