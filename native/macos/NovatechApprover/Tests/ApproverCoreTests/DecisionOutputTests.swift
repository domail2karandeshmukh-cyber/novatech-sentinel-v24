import Foundation
import XCTest
@testable import ApproverCore

final class DecisionOutputTests: XCTestCase {
    private let decidedAt = Date(timeIntervalSince1970: 1_793_000_000.125)

    private func decode(_ line: String) throws -> [String: Any] {
        let object = try JSONSerialization.jsonObject(with: Data(line.utf8))
        return try XCTUnwrap(object as? [String: Any])
    }

    func testWritesOneCompactLineWithTheProtocolFields() throws {
        let line = DecisionOutput.line(
            for: DecisionEvent(decision: .approve, detail: "Owner authorized the shutdown."),
            requestId: "6f1c2a0e-8b7d-4c3e-9a51-2f4d6b8c0e13",
            decidedAt: decidedAt
        )
        XCTAssertFalse(line.contains("\n"))
        XCTAssertTrue(line.hasPrefix("{\"decision\":\"approve\""))
        let fields = try decode(line)
        XCTAssertEqual(fields["decision"] as? String, "approve")
        XCTAssertEqual(fields["requestId"] as? String, "6f1c2a0e-8b7d-4c3e-9a51-2f4d6b8c0e13")
        XCTAssertEqual(fields["decidedAt"] as? String, "2026-10-26T07:33:20.125Z")
        XCTAssertEqual(fields["detail"] as? String, "Owner authorized the shutdown.")
        XCTAssertEqual(Set(fields.keys), ["decision", "requestId", "decidedAt", "detail"])
    }

    func testUnknownRequestIdIsNull() throws {
        let line = DecisionOutput.line(for: DecisionEvent(decision: .error, detail: "bad input"), requestId: nil, decidedAt: decidedAt)
        XCTAssertTrue(line.contains("\"requestId\":null"))
        XCTAssertTrue(try decode(line)["requestId"] is NSNull)
    }

    func testDetailIsEscapedSanitisedAndClamped() throws {
        let nasty = "quote \" backslash \\ newline\nline\u{2028}sep \u{202E}" + String(repeating: "y", count: 400)
        let line = DecisionOutput.line(for: DecisionEvent(decision: .reject, detail: nasty), requestId: "abcdefgh", decidedAt: decidedAt)
        XCTAssertFalse(line.contains("\n"))
        let detail = try XCTUnwrap(try decode(line)["detail"] as? String)
        XCTAssertTrue(detail.hasPrefix("quote \" backslash \\ newline line sep "))
        XCTAssertLessThanOrEqual(detail.count, ApprovalLimits.maxDetailLength)
    }

    func testQuoteEscapesControlCharactersDefensively() {
        XCTAssertEqual(DecisionOutput.quote("a\u{0001}b\tc"), "\"a\\u0001b\\tc\"")
    }
}
