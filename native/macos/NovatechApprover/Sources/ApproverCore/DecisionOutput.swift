import Foundation

/// Builds and writes the single JSON line the Node side reads:
/// {"decision":"approve|reject|timeout|error","requestId":"…"|null,"decidedAt":"ISO-8601","detail":"…"}
public enum DecisionOutput {
    /// Hand-rolled so the key order is stable and the output is always exactly one line on
    /// every platform. `requestId` is null only when the request itself could not be read.
    public static func line(for event: DecisionEvent, requestId: String?, decidedAt: Date) -> String {
        var json = "{\"decision\":\(quote(event.decision.rawValue))"
        json += ",\"requestId\":\(requestId.map(quote) ?? "null")"
        json += ",\"decidedAt\":\(quote(isoTimestamp(decidedAt)))"
        if let detail = RequestParser.sanitize(event.detail, maxLength: ApprovalLimits.maxDetailLength) {
            json += ",\"detail\":\(quote(detail))"
        }
        return json + "}"
    }

    public static func isoTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    static func quote(_ value: String) -> String {
        var out = "\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 || scalar.value == 0x2028 || scalar.value == 0x2029 {
                    let hex = String(scalar.value, radix: 16, uppercase: true)
                    out += "\\u" + String(repeating: "0", count: max(0, 4 - hex.count)) + hex
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }

    private static var emitted = false

    /// Writes exactly one line to stdout and exits with the decision's exit code. Must only be
    /// called from the main thread; a second call can never happen because the process exits.
    public static func emitAndExit(_ event: DecisionEvent, requestId: String?, decidedAt: Date = Date()) -> Never {
        if !emitted {
            emitted = true
            let text = line(for: event, requestId: requestId, decidedAt: decidedAt) + "\n"
            FileHandle.standardOutput.write(Data(text.utf8))
        }
        exit(event.decision.exitCode)
    }
}
