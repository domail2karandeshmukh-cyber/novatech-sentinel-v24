import Foundation
import XCTest
@testable import ApproverCore

final class CountdownMachineTests: XCTestCase {
    func testAuthorizeIsLockedForTheArmingDelayThenAllowedOnce() {
        var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 100)
        machine.windowBecameKey(at: 100)
        XCTAssertFalse(machine.canAuthorize(at: 100.2, windowIsKey: true))
        XCTAssertNil(machine.authorize(at: 100.2, windowIsKey: true), "a carried-over click is ignored, not turned into a decision")
        XCTAssertNil(machine.authorize(at: 101.49, windowIsKey: true))
        XCTAssertFalse(machine.isDecided)
        XCTAssertTrue(machine.canAuthorize(at: 101.5, windowIsKey: true))
        XCTAssertEqual(machine.authorize(at: 101.5, windowIsKey: true)?.decision, .approve)
        XCTAssertNil(machine.authorize(at: 101.6, windowIsKey: true), "exactly one decision")
        XCTAssertNil(machine.reject(at: 101.6, source: .rejectButton))
        XCTAssertNil(machine.tick(at: 200))
        XCTAssertEqual(machine.outcome?.decision, .approve)
    }

    func testAuthorizeNeedsAFocusedWindow() {
        var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 0)
        XCTAssertFalse(machine.canAuthorize(at: 5, windowIsKey: false))
        XCTAssertNil(machine.authorize(at: 5, windowIsKey: false))
        XCTAssertFalse(machine.isDecided)
    }

    func testRegainingFocusRestartsTheArmingDelay() {
        var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 0)
        XCTAssertTrue(machine.canAuthorize(at: 5, windowIsKey: true))
        machine.windowBecameKey(at: 10)
        XCTAssertFalse(machine.canAuthorize(at: 11, windowIsKey: true))
        XCTAssertEqual(machine.armingRemaining(at: 11), 0.5, accuracy: 0.0001)
        XCTAssertTrue(machine.canAuthorize(at: 11.5, windowIsKey: true))
    }

    func testRejectIsAlwaysAvailableBeforeTheDeadline() {
        for source in [RejectSource.rejectButton, .returnKey, .escapeKey, .windowClosed, .appQuit] {
            var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 0)
            let event = machine.reject(at: 0.01, source: source)
            XCTAssertEqual(event?.decision, .reject)
            XCTAssertEqual(event?.detail, source.detail)
        }
    }

    func testTimeoutFailsClosedAndWinsOverLateInput() {
        var machine = CountdownMachine(timeoutSeconds: 10, startedAt: 0)
        XCTAssertNil(machine.tick(at: 9.99))
        XCTAssertEqual(machine.displaySeconds(at: 9.01), 1)
        XCTAssertEqual(machine.tick(at: 10)?.decision, .timeout)

        var late = CountdownMachine(timeoutSeconds: 10, startedAt: 0)
        XCTAssertEqual(late.authorize(at: 10.05, windowIsKey: true)?.decision, .timeout, "approval after the deadline is impossible")

        var lateReject = CountdownMachine(timeoutSeconds: 10, startedAt: 0)
        XCTAssertEqual(lateReject.reject(at: 12, source: .returnKey)?.decision, .timeout)
    }

    func testTimeoutIsClampedToTheAllowedRange() {
        XCTAssertEqual(CountdownMachine(timeoutSeconds: 1, startedAt: 0).deadline, 10)
        XCTAssertEqual(CountdownMachine(timeoutSeconds: 600, startedAt: 0).deadline, 60)
    }

    func testAnExpiringSessionShortensTheWindow() {
        var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 0, sessionRemaining: 12)
        XCTAssertTrue(machine.endsWithSession)
        XCTAssertEqual(machine.deadline, 12)
        let event = machine.tick(at: 12)
        XCTAssertEqual(event?.decision, .timeout)
        XCTAssertTrue(event?.detail.contains("session expired") ?? false)

        let expired = CountdownMachine(timeoutSeconds: 30, startedAt: 0, sessionRemaining: -5)
        XCTAssertEqual(expired.deadline, 0)
        XCTAssertFalse(expired.canAuthorize(at: 2, windowIsKey: true))

        let later = CountdownMachine(timeoutSeconds: 30, startedAt: 0, sessionRemaining: 600)
        XCTAssertFalse(later.endsWithSession)
        XCTAssertEqual(later.deadline, 30)
    }

    func testRingFractionAndSecondsCountDown() {
        let machine = CountdownMachine(timeoutSeconds: 20, startedAt: 0)
        XCTAssertEqual(machine.fractionRemaining(at: 0), 1)
        XCTAssertEqual(machine.fractionRemaining(at: 10), 0.5, accuracy: 0.0001)
        XCTAssertEqual(machine.fractionRemaining(at: 25), 0)
        XCTAssertEqual(machine.displaySeconds(at: 0), 20)
        XCTAssertEqual(machine.displaySeconds(at: 0.5), 20)
        XCTAssertEqual(machine.displaySeconds(at: 25), 0)
    }

    func testFailRecordsAnErrorOnlyWhilePending() {
        var machine = CountdownMachine(timeoutSeconds: 30, startedAt: 0)
        XCTAssertEqual(machine.fail("caller exited")?.decision, .error)
        XCTAssertNil(machine.reject(at: 1, source: .rejectButton))
    }

    func testExitCodesMatchTheNodeProtocol() {
        XCTAssertEqual(ApprovalDecision.approve.exitCode, 0)
        XCTAssertEqual(ApprovalDecision.reject.exitCode, 10)
        XCTAssertEqual(ApprovalDecision.timeout.exitCode, 11)
        XCTAssertEqual(ApprovalDecision.error.exitCode, 12)
    }
}
