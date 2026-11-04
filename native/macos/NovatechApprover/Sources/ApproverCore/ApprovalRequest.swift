import Foundation

/// Limits shared with `buildApprovalRequest()` in scripts/mac-approval.mjs. Keep both sides in sync.
public enum ApprovalLimits {
    public static let maxTextLength = 160
    public static let maxGovernanceEntries = 10
    public static let minTimeoutSeconds = 10
    public static let maxTimeoutSeconds = 60
    public static let defaultTimeoutSeconds = 30
    public static let maxInputBytes = 64 * 1024
    public static let maxDetailLength = 200
}

/// LIVE requests come from the remote agent's live executor. PREVIEW is used by the safe test
/// dialog. Anything other than the exact string "PREVIEW" is treated as LIVE, so the window
/// never under-states the consequence.
public enum ApprovalMode: String, Equatable {
    case live = "LIVE"
    case preview = "PREVIEW"
}

/// How the request reached this Mac. Only changes the wording of the connection line.
public enum ApprovalChannel: String, Equatable {
    case lanTLS = "LAN_TLS"
    case localHelper = "LOCAL_HELPER"
}

/// One row of the classroom governance record. Display-only and simulated.
public struct GovernanceEntry: Equatable {
    public let gate: String
    public let person: String
    public let role: String
    public let decision: String

    public init(gate: String, person: String, role: String, decision: String) {
        self.gate = gate
        self.person = person
        self.role = role
        self.decision = decision
    }
}

/// A validated, clamped approval request. Every string is single-line, free of control and
/// bidirectional-override characters, and at most `ApprovalLimits.maxTextLength` characters.
public struct ApprovalRequest: Equatable {
    public static let defaultOwnerName = "Mac owner"
    public static let defaultRequesterName = "Unidentified requester"
    public static let defaultRequesterContext = "Paired LAN session — identity is the name entered at pairing, not enterprise SSO"
    public static let notProvided = "Not provided"
    /// Always shown for LIVE requests, whatever the request's own `consequence` text says.
    public static let fixedConsequence = "Shuts down this Mac. Open apps will close — save your work first."
    public static let governanceLabel = "Classroom governance record — simulated"

    public let requestId: String
    public let deviceName: String?
    public let ownerName: String
    public let requesterName: String
    public let requesterContext: String
    public let incidentId: String
    public let scenario: String
    public let reason: String
    public let consequence: String
    public let governance: [GovernanceEntry]
    public let mode: ApprovalMode
    public let channel: ApprovalChannel
    public let sessionExpiresAt: Date?
    public let timeoutSeconds: Int

    public init(
        requestId: String,
        deviceName: String? = nil,
        ownerName: String = ApprovalRequest.defaultOwnerName,
        requesterName: String = ApprovalRequest.defaultRequesterName,
        requesterContext: String = ApprovalRequest.defaultRequesterContext,
        incidentId: String = ApprovalRequest.notProvided,
        scenario: String = ApprovalRequest.notProvided,
        reason: String = ApprovalRequest.notProvided,
        consequence: String = ApprovalRequest.fixedConsequence,
        governance: [GovernanceEntry] = [],
        mode: ApprovalMode = .live,
        channel: ApprovalChannel = .lanTLS,
        sessionExpiresAt: Date? = nil,
        timeoutSeconds: Int = ApprovalLimits.defaultTimeoutSeconds
    ) {
        self.requestId = requestId
        self.deviceName = deviceName
        self.ownerName = ownerName
        self.requesterName = requesterName
        self.requesterContext = requesterContext
        self.incidentId = incidentId
        self.scenario = scenario
        self.reason = reason
        self.consequence = consequence
        self.governance = governance
        self.mode = mode
        self.channel = channel
        self.sessionExpiresAt = sessionExpiresAt
        self.timeoutSeconds = min(max(timeoutSeconds, ApprovalLimits.minTimeoutSeconds), ApprovalLimits.maxTimeoutSeconds)
    }

    /// The request's own consequence text, when it adds something to the fixed sentence.
    public var additionalConsequenceNote: String? {
        consequence == ApprovalRequest.fixedConsequence ? nil : consequence
    }
}
