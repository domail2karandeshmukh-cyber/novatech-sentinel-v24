import Foundation
import XCTest
@testable import ApproverCore

final class RequestParserTests: XCTestCase {
    private let requestId = "6f1c2a0e-8b7d-4c3e-9a51-2f4d6b8c0e13"

    private func parse(_ object: [String: Any]) throws -> ApprovalRequest {
        try RequestParser.parse(JSONSerialization.data(withJSONObject: object))
    }

    func testParsesAFullRequest() throws {
        let request = try parse([
            "requestId": requestId,
            "deviceName": "Karans-MacBook-Air.local",
            "ownerName": "Karan Deshmukh",
            "requesterName": "Pierre Sauvage",
            "requesterContext": "Paired LAN session — identity is the name entered at pairing, not enterprise SSO",
            "incidentId": "NT-SEC-041",
            "scenario": "Ransomware on a finance workstation",
            "reason": "Final classroom step",
            "consequence": ApprovalRequest.fixedConsequence,
            "governance": [["gate": "Detect", "person": "Karan Deshmukh", "role": "Risk Coordinator", "decision": "Acknowledged"]],
            "mode": "LIVE",
            "channel": "LAN_TLS",
            "sessionExpiresAt": 1_793_000_000_000,
            "timeoutSeconds": 30,
            "unknownField": "ignored",
        ])
        XCTAssertEqual(request.requestId, requestId)
        XCTAssertEqual(request.ownerName, "Karan Deshmukh")
        XCTAssertEqual(request.requesterName, "Pierre Sauvage")
        XCTAssertEqual(request.incidentId, "NT-SEC-041")
        XCTAssertEqual(request.governance, [GovernanceEntry(gate: "Detect", person: "Karan Deshmukh", role: "Risk Coordinator", decision: "Acknowledged")])
        XCTAssertEqual(request.mode, .live)
        XCTAssertEqual(request.channel, .lanTLS)
        XCTAssertEqual(request.sessionExpiresAt, Date(timeIntervalSince1970: 1_793_000_000))
        XCTAssertEqual(request.timeoutSeconds, 30)
        XCTAssertNil(request.additionalConsequenceNote)
    }

    func testOnlyRequestIdIsMandatoryAndDefaultsAreSafe() throws {
        let request = try parse(["requestId": requestId])
        XCTAssertEqual(request.ownerName, ApprovalRequest.defaultOwnerName)
        XCTAssertEqual(request.requesterName, ApprovalRequest.defaultRequesterName)
        XCTAssertEqual(request.requesterContext, ApprovalRequest.defaultRequesterContext)
        XCTAssertEqual(request.incidentId, ApprovalRequest.notProvided)
        XCTAssertEqual(request.consequence, ApprovalRequest.fixedConsequence)
        XCTAssertEqual(request.mode, .live, "an absent mode must never be shown as a harmless preview")
        XCTAssertEqual(request.timeoutSeconds, 30)
        XCTAssertTrue(request.governance.isEmpty)
        XCTAssertNil(request.sessionExpiresAt)
    }

    func testRejectsMissingOrInvalidRequestIds() {
        for bad: Any in ["short", String(repeating: "a", count: 65), "../../etc/passwd", "abc def ghij", 12_345_678, NSNull()] {
            XCTAssertThrowsError(try parse(["requestId": bad])) { error in
                XCTAssertEqual(error as? RequestError, .invalidRequestId)
            }
        }
        XCTAssertThrowsError(try parse(["ownerName": "Karan"])) { error in
            XCTAssertEqual(error as? RequestError, .invalidRequestId)
        }
    }

    func testRejectsEmptyOversizedNonJSONAndNonObjectInput() {
        XCTAssertThrowsError(try RequestParser.parse(Data())) { XCTAssertEqual($0 as? RequestError, .empty) }
        XCTAssertThrowsError(try RequestParser.parse(Data("{not json".utf8))) { XCTAssertEqual($0 as? RequestError, .notJSON) }
        XCTAssertThrowsError(try RequestParser.parse(Data("[1,2]".utf8))) { XCTAssertEqual($0 as? RequestError, .notAnObject) }
        let huge = Data(repeating: 0x20, count: ApprovalLimits.maxInputBytes + 1)
        XCTAssertThrowsError(try RequestParser.parse(huge)) {
            XCTAssertEqual($0 as? RequestError, .tooLarge(limit: ApprovalLimits.maxInputBytes))
        }
    }

    func testStringsAreSingleLineStrippedOfControlAndBidiCharactersAndClamped() throws {
        let request = try parse([
            "requestId": requestId,
            "requesterName": "  Pierre\n\tSauvage\u{202E}evil\u{200B}  ",
            "reason": String(repeating: "x", count: 500),
            "scenario": "\u{0007}\u{2028}",
        ])
        XCTAssertEqual(request.requesterName, "Pierre Sauvageevil")
        XCTAssertEqual(request.reason.count, ApprovalLimits.maxTextLength)
        XCTAssertEqual(request.scenario, ApprovalRequest.notProvided, "a string that is only control characters is treated as missing")
    }

    func testSanitizeCollapsesWhitespaceAndTrimsAfterClamping() {
        XCTAssertEqual(RequestParser.sanitize("a  \u{00A0} b"), "a b")
        XCTAssertNil(RequestParser.sanitize("   "))
        XCTAssertEqual(RequestParser.sanitize("abcd efgh", maxLength: 5), "abcd")
        XCTAssertEqual(RequestParser.sanitize("Victor Bonnet — RSSI / CISO"), "Victor Bonnet — RSSI / CISO")
    }

    func testTimeoutIsClampedAndOnlyNumbersCount() throws {
        let cases: [(Any, Int)] = [(5, 10), (10, 10), (45.9, 45), (60, 60), (120, 60), (-3, 10), ("45", 30), (true, 30), (NSNull(), 30)]
        for (value, expected) in cases {
            XCTAssertEqual(try parse(["requestId": requestId, "timeoutSeconds": value]).timeoutSeconds, expected, "timeoutSeconds \(value)")
        }
    }

    func testGovernanceIsLimitedToTenRowsAndDropsInvalidRows() throws {
        var rows: [Any] = ["not a row", ["gate": "No person"], ["person": "No gate"], 42]
        for index in 1...14 {
            rows.append(["gate": "Gate \(index)", "person": "Person \(index)", "role": index == 1 ? 7 : "Role", "decision": "Approved"])
        }
        let request = try parse(["requestId": requestId, "governance": rows])
        XCTAssertEqual(request.governance.count, ApprovalLimits.maxGovernanceEntries)
        XCTAssertEqual(request.governance.first, GovernanceEntry(gate: "Gate 1", person: "Person 1", role: "", decision: "Approved"))
        XCTAssertEqual(request.governance.last?.gate, "Gate 10")
    }

    func testModeAndChannelAcceptOnlyExactValues() throws {
        XCTAssertEqual(try parse(["requestId": requestId, "mode": "PREVIEW"]).mode, .preview)
        XCTAssertEqual(try parse(["requestId": requestId, "mode": "preview"]).mode, .live)
        XCTAssertEqual(try parse(["requestId": requestId, "mode": true]).mode, .live)
        XCTAssertEqual(try parse(["requestId": requestId, "channel": "LOCAL_HELPER"]).channel, .localHelper)
        XCTAssertEqual(try parse(["requestId": requestId, "channel": "local"]).channel, .lanTLS)
    }

    func testSessionExpiryMustBeEpochMilliseconds() throws {
        XCTAssertNil(try parse(["requestId": requestId, "sessionExpiresAt": 1_793_000_000]).sessionExpiresAt, "seconds are ignored")
        XCTAssertNil(try parse(["requestId": requestId, "sessionExpiresAt": "1793000000000"]).sessionExpiresAt)
        XCTAssertNotNil(try parse(["requestId": requestId, "sessionExpiresAt": 1_793_000_000_123]).sessionExpiresAt)
    }

    func testDifferentConsequenceTextIsKeptAsANoteOnly() throws {
        let request = try parse(["requestId": requestId, "consequence": "Presentation ends."])
        XCTAssertEqual(request.additionalConsequenceNote, "Presentation ends.")
    }

    func testCommandLineRecognisesOnlyTheRequestFileOption() {
        XCTAssertEqual(try RequestInput.source(from: ["approver"]).get(), .standardInput)
        XCTAssertEqual(try RequestInput.source(from: ["approver", "-NSDocumentRevisionsDebugMode", "YES"]).get(), .standardInput)
        XCTAssertEqual(try RequestInput.source(from: ["approver", "--request-file", "/tmp/r.json"]).get(), .file("/tmp/r.json"))
        XCTAssertEqual(try RequestInput.source(from: ["approver", "--request-file=/tmp/r.json"]).get(), .file("/tmp/r.json"))
        XCTAssertThrowsError(try RequestInput.source(from: ["approver", "--request-file"]).get())
        XCTAssertThrowsError(try RequestInput.source(from: ["approver", "--request-file", "--other"]).get())
    }

    func testLoadsARequestFile() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("novatech-request-\(UUID().uuidString).json")
        try Data("{\"requestId\":\"\(requestId)\",\"requesterName\":\"Pierre Sauvage\"}".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let request = try RequestInput.load(arguments: ["approver", "--request-file", url.path]).get()
        XCTAssertEqual(request.requesterName, "Pierre Sauvage")
        XCTAssertThrowsError(try RequestInput.load(arguments: ["approver", "--request-file", url.path + ".missing"]).get())
    }
}
