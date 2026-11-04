#if canImport(AppKit) && canImport(SwiftUI)
import AppKit
import SwiftUI
#if canImport(ApproverCore)
import ApproverCore
#endif

/// Floating approval window. Return, keypad Enter and Escape are turned into "reject" before
/// any control sees them, so the keyboard can only ever say no.
final class ApprovalWindow: NSWindow {
    var onRejectKey: ((RejectSource) -> Void)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown {
            switch event.keyCode {
            case 36, 76: // Return, keypad Enter
                onRejectKey?(.returnKey)
                return
            case 53: // Escape
                onRejectKey?(.escapeKey)
                return
            default:
                break
            }
        }
        super.sendEvent(event)
    }

    override func cancelOperation(_ sender: Any?) {
        onRejectKey?(.escapeKey)
    }
}

/// Owns the window, the 10 Hz countdown timer and the single exit path.
@MainActor
final class ApprovalAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let request: ApprovalRequest
    private let model: ApprovalViewModel
    private let parentProcess: pid_t
    private var window: ApprovalWindow?
    private var timer: Timer?
    private var finished = false

    init(request: ApprovalRequest, parentProcess: pid_t) {
        self.request = request
        self.parentProcess = parentProcess
        self.model = ApprovalViewModel(request: request)
        super.init()
        model.onDecision = { [weak self] event in
            self?.finish(event)
        }
    }

    /// The Mac's own name wins over the caller's. Host lookups can be slow on some networks, so
    /// they never delay the window: the name is swapped in when it arrives.
    private func resolveLocalDeviceName() {
        let model = self.model
        Task.detached(priority: .userInitiated) {
            let localName = Host.current().localizedName
            await model.useLocalDeviceName(localName)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        resolveLocalDeviceName()
        let window = makeWindow()
        self.window = window
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)

        // The countdown and the 1.5 s arming delay start when the window is on screen.
        model.start()
        let timer = Timer(timeInterval: 0.1, target: self, selector: #selector(handleTick), userInfo: nil, repeats: true)
        // .common keeps the countdown running while a button is held down.
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        model.announceOpening()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        model.reject(.appQuit)
        return .terminateNow
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        model.reject(.windowClosed)
        return false
    }

    func windowDidBecomeKey(_ notification: Notification) {
        model.setWindowKey(true)
    }

    func windowDidResignKey(_ notification: Notification) {
        model.setWindowKey(false)
    }

    @objc private func handleTick() {
        // If NOVATECH stopped waiting (the parent exited), close quietly: nobody can act on an answer.
        if getppid() != parentProcess {
            model.fail("NOVATECH stopped waiting for this decision (the requesting process exited) — no shutdown.")
            return
        }
        model.tick()
    }

    private func finish(_ event: DecisionEvent) {
        guard !finished else { return }
        finished = true
        timer?.invalidate()
        DecisionOutput.emitAndExit(event, requestId: request.requestId)
    }

    private func makeWindow() -> ApprovalWindow {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        // Projector-safe: never larger than the visible area; the middle section scrolls while the
        // header and the Reject / Authorize bar always stay visible.
        let width = min(660, visible.width * 0.94)
        let height = min(840, visible.height * 0.94)
        let frame = NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height)

        let window = ApprovalWindow(contentRect: frame, styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "NOVATECH Sentinel — Endpoint Action Authorization"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.hidesOnDeactivate = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(srgbRed: 0x08 / 255.0, green: 0x0D / 255.0, blue: 0x17 / 255.0, alpha: 1)
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
        window.delegate = self
        window.onRejectKey = { [weak self] source in
            self?.model.reject(source)
        }

        let hostingView = NSHostingView(rootView: ApprovalView(model: model))
        hostingView.sizingOptions = [] // The window keeps the projector-safe size chosen above.
        window.contentView = hostingView
        window.setFrame(frame, display: false)
        return window
    }
}
#endif
