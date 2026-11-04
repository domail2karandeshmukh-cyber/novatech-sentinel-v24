import Foundation
#if canImport(ApproverCore)
// Built with SwiftPM, the core is a separate module. companion-build.mjs's swiftc fallback
// compiles everything as one module, so the import is skipped there.
import ApproverCore
#endif
#if canImport(AppKit) && canImport(SwiftUI)
import AppKit
#endif

private func hintIfInteractive() {
    if case .success(.standardInput) = RequestInput.source(from: CommandLine.arguments), isatty(STDIN_FILENO) == 1 {
        FileHandle.standardError.write(Data("NovatechApprover: waiting for one request as JSON on stdin (or pass --request-file <path>).\n".utf8))
    }
}

#if canImport(AppKit) && canImport(SwiftUI)
/// macOS entry point: read and validate the request first, then show the approval window.
/// Nothing in this executable runs commands, opens network connections or shuts anything down.
@main
@MainActor
enum NovatechApproverMain {
    private static var retainedDelegate: ApprovalAppDelegate?

    static func main() {
        hintIfInteractive()
        let request: ApprovalRequest
        switch RequestInput.load(arguments: CommandLine.arguments) {
        case .success(let loaded):
            request = loaded
        case .failure(let error):
            DecisionOutput.emitAndExit(DecisionEvent(decision: .error, detail: error.description), requestId: nil)
        }

        let application = NSApplication.shared
        // Accessory: no Dock icon, but the window can still become key and can appear over
        // full-screen apps (for example a full-screen presentation).
        application.setActivationPolicy(.accessory)
        let delegate = ApprovalAppDelegate(request: request, parentProcess: getppid())
        retainedDelegate = delegate // NSApplication.delegate is weak.
        application.delegate = delegate
        application.run()
    }
}
#else

/// Non-macOS builds (for example Linux CI) have no window. They still validate the request so
/// the I/O contract can be exercised, then always answer "error" (exit 12): fail closed.
@main
enum NovatechApproverMain {
    static func main() {
        hintIfInteractive()
        switch RequestInput.load(arguments: CommandLine.arguments) {
        case .success(let request):
            DecisionOutput.emitAndExit(
                DecisionEvent(decision: .error, detail: "This build has no approval window (macOS 13+ with SwiftUI is required). No decision was taken — failed closed."),
                requestId: request.requestId
            )
        case .failure(let error):
            DecisionOutput.emitAndExit(DecisionEvent(decision: .error, detail: error.description), requestId: nil)
        }
    }
}
#endif
