// swift-tools-version:5.9
//
// NOVATECH Sentinel V2.4 — native owner-approval companion.
//
// The executable is ONLY a consent window: it reads one request (JSON on stdin or
// --request-file), shows it, and prints exactly one JSON decision line. It never runs
// commands, never uses the network and never shuts anything down. The Node agent
// (scripts/mac-approval.mjs) decides what to do with the answer and fails closed.
//
// ApproverCore is Foundation-only so it compiles and is unit-tested on any platform.
// The SwiftUI window only compiles on macOS; elsewhere the executable is a fail-closed
// stub that always answers "error" (exit 12).
import PackageDescription

let package = Package(
    name: "NovatechApprover",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "NovatechApprover", targets: ["NovatechApprover"]),
    ],
    targets: [
        .target(
            name: "ApproverCore",
            path: "Sources/ApproverCore"
        ),
        .executableTarget(
            name: "NovatechApprover",
            dependencies: ["ApproverCore"],
            path: "Sources/NovatechApprover"
        ),
        .testTarget(
            name: "ApproverCoreTests",
            dependencies: ["ApproverCore"],
            path: "Tests/ApproverCoreTests"
        ),
    ]
)
