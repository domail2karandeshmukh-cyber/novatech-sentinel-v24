import Foundation

/// Why a request could not be accepted. Every case leads to an "error" decision (exit 12).
public enum RequestError: Error, Equatable, CustomStringConvertible {
    case empty
    case tooLarge(limit: Int)
    case notJSON
    case notAnObject
    case invalidRequestId
    case unreadable(String)

    public var description: String {
        switch self {
        case .empty:
            return "No approval request was received — failed closed."
        case .tooLarge(let limit):
            return "The approval request is larger than \(limit) bytes — failed closed."
        case .notJSON:
            return "The approval request is not valid JSON — failed closed."
        case .notAnObject:
            return "The approval request must be a JSON object — failed closed."
        case .invalidRequestId:
            return "The approval request has a missing or invalid requestId — failed closed."
        case .unreadable(let why):
            return "The approval request could not be read (\(why)) — failed closed."
        }
    }
}

/// Minimal JSON model so that booleans, numbers and strings are told apart identically on
/// macOS and Linux (JSONSerialization's NSNumber bridging blurs `true` and `1`).
enum JSONValue: Decodable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value.")
        }
    }
}

/// Parses and validates the request. Only `requestId` is mandatory; every other field falls
/// back to a safe default. Unknown fields are ignored.
public enum RequestParser {
    public static func parse(_ data: Data) throws -> ApprovalRequest {
        guard !data.isEmpty else { throw RequestError.empty }
        guard data.count <= ApprovalLimits.maxInputBytes else {
            throw RequestError.tooLarge(limit: ApprovalLimits.maxInputBytes)
        }
        let root: JSONValue
        do {
            root = try JSONDecoder().decode(JSONValue.self, from: data)
        } catch {
            throw RequestError.notJSON
        }
        guard case .object(let fields) = root else { throw RequestError.notAnObject }
        guard let requestId = requestId(fields["requestId"]) else { throw RequestError.invalidRequestId }

        return ApprovalRequest(
            requestId: requestId,
            deviceName: text(fields["deviceName"]),
            ownerName: text(fields["ownerName"]) ?? ApprovalRequest.defaultOwnerName,
            requesterName: text(fields["requesterName"]) ?? ApprovalRequest.defaultRequesterName,
            requesterContext: text(fields["requesterContext"]) ?? ApprovalRequest.defaultRequesterContext,
            incidentId: text(fields["incidentId"]) ?? ApprovalRequest.notProvided,
            scenario: text(fields["scenario"]) ?? ApprovalRequest.notProvided,
            reason: text(fields["reason"]) ?? ApprovalRequest.notProvided,
            consequence: text(fields["consequence"]) ?? ApprovalRequest.fixedConsequence,
            governance: governance(fields["governance"]),
            mode: fields["mode"] == .string(ApprovalMode.preview.rawValue) ? .preview : .live,
            channel: fields["channel"] == .string(ApprovalChannel.localHelper.rawValue) ? .localHelper : .lanTLS,
            sessionExpiresAt: epochMilliseconds(fields["sessionExpiresAt"]),
            timeoutSeconds: timeoutSeconds(fields["timeoutSeconds"])
        )
    }

    /// Single-line, display-safe text: format characters (including bidirectional overrides and
    /// zero-width characters) are removed, control characters and any run of whitespace become
    /// one space, and the result is trimmed and clamped to `maxLength` characters.
    /// Mirrors `cleanText()` in scripts/mac-approval.mjs.
    public static func sanitize(_ raw: String, maxLength: Int = ApprovalLimits.maxTextLength) -> String? {
        var output = String.UnicodeScalarView()
        var pendingSpace = false
        for scalar in raw.unicodeScalars {
            let properties = scalar.properties
            switch properties.generalCategory {
            case .format, .surrogate:
                continue
            case .control, .lineSeparator, .paragraphSeparator:
                pendingSpace = true
                continue
            default:
                if properties.isWhitespace {
                    pendingSpace = true
                    continue
                }
            }
            if pendingSpace && !output.isEmpty { output.append(" ") }
            pendingSpace = false
            output.append(scalar)
        }
        let cleaned = String(output)
        guard !cleaned.isEmpty, maxLength > 0 else { return nil }
        guard cleaned.count > maxLength else { return cleaned }
        let clamped = String(cleaned.prefix(maxLength)).trimmingCharacters(in: .whitespaces)
        return clamped.isEmpty ? nil : clamped
    }

    static func text(_ value: JSONValue?) -> String? {
        guard case .string(let raw)? = value else { return nil }
        return sanitize(raw)
    }

    /// 8–64 characters of A–Z, a–z, 0–9 and "-" (a UUID fits). The id is echoed back so the
    /// caller can prove the answer belongs to its own request.
    static func requestId(_ value: JSONValue?) -> String? {
        guard case .string(let raw)? = value else { return nil }
        let scalars = raw.unicodeScalars
        guard (8...64).contains(scalars.count) else { return nil }
        let allowed = scalars.allSatisfy { scalar in
            switch scalar.value {
            case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2D: return true
            default: return false
            }
        }
        return allowed ? raw : nil
    }

    /// At most ten rows; a row needs a gate and a person, role and decision are optional.
    static func governance(_ value: JSONValue?) -> [GovernanceEntry] {
        guard case .array(let items)? = value else { return [] }
        var entries: [GovernanceEntry] = []
        for item in items.prefix(200) {
            guard entries.count < ApprovalLimits.maxGovernanceEntries else { break }
            guard case .object(let row) = item,
                  let gate = text(row["gate"]),
                  let person = text(row["person"]) else { continue }
            entries.append(GovernanceEntry(
                gate: gate,
                person: person,
                role: text(row["role"]) ?? "",
                decision: text(row["decision"]) ?? ""
            ))
        }
        return entries
    }

    /// Epoch milliseconds between 2001 and 2286; anything else (for example seconds) is ignored.
    static func epochMilliseconds(_ value: JSONValue?) -> Date? {
        guard case .number(let milliseconds)? = value,
              milliseconds.isFinite,
              milliseconds >= 1_000_000_000_000,
              milliseconds <= 10_000_000_000_000 else { return nil }
        return Date(timeIntervalSince1970: milliseconds / 1000)
    }

    /// Default 30 s, clamped to 10…60 s. Only JSON numbers are accepted.
    static func timeoutSeconds(_ value: JSONValue?) -> Int {
        guard case .number(let seconds)? = value, seconds.isFinite else {
            return ApprovalLimits.defaultTimeoutSeconds
        }
        let clamped = min(
            max(seconds, Double(ApprovalLimits.minTimeoutSeconds)),
            Double(ApprovalLimits.maxTimeoutSeconds)
        )
        return Int(clamped)
    }
}
