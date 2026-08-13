import AppKit
import Foundation
import Network
import WebKit

final class WidgetWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class DragHandleView: NSView {
    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .openHand)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: WidgetWindow!
    private var webView: WKWebView!
    private var listener: NWListener?
    private var pendingSession: (accessToken: String, refreshToken: String)?
    private var widgetURL = URL(string: "http://127.0.0.1:5173/widget/today")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        buildWindow()
        startControlServer()
        showWidget()
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reloadTasks),
            name: NSWindow.didBecomeKeyNotification,
            object: window
        )
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWidget()
        return true
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "widget", let body = message.body as? String else { return }
        if body == "quit" {
            NSApp.terminate(nil)
            return
        }
        if body == "drag", let event = window.currentEvent ?? NSApp.currentEvent {
            window.performDrag(with: event)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        injectPendingSession()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.targetFrame == nil {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    @objc private func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
        showWidget()
    }

    @objc private func reloadTasks() {
        webView.evaluateJavaScript("window.dispatchEvent(new Event('workbench-widget-refresh'));", completionHandler: nil)
    }

    private func buildWindow() {
        let userController = WKUserContentController()
        userController.add(self, name: "widget")
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = userController
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]

        let defaultSize = NSSize(width: 300, height: 360)
        let container = NSView(frame: NSRect(origin: .zero, size: defaultSize))
        container.wantsLayer = true
        container.layer?.cornerRadius = 18
        container.layer?.masksToBounds = true
        if #available(macOS 11.0, *) {
            container.layer?.cornerCurve = .continuous
        }
        webView.frame = container.bounds
        container.addSubview(webView)

        let dragHandle = DragHandleView(frame: NSRect(x: 0, y: defaultSize.height - 72, width: 176, height: 72))
        dragHandle.autoresizingMask = [.width, .minYMargin]
        container.addSubview(dragHandle)

        window = WidgetWindow(
            contentRect: NSRect(origin: NSPoint(x: 80, y: 120), size: defaultSize),
            styleMask: [.borderless, .resizable],
            backing: .buffered,
            defer: false
        )
        window.contentView = container
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = true
        window.minSize = defaultSize
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.setFrameAutosaveName("TodayWidgetWindow")
        window.isReleasedWhenClosed = false
        applyDefaultSize(defaultSize)
    }

    private func applyDefaultSize(_ size: NSSize) {
        let origin = window.frame.origin
        window.setContentSize(size)
        window.setFrameOrigin(origin)
    }

    private func showWidget(origin: String? = nil, accessToken: String? = nil, refreshToken: String? = nil) {
        if let origin, let url = URL(string: origin + "/widget/today") {
            widgetURL = url
        }
        if let accessToken, let refreshToken, !accessToken.isEmpty, !refreshToken.isEmpty {
            pendingSession = (accessToken, refreshToken)
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: widgetURL, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    private func injectPendingSession() {
        guard let session = pendingSession else { return }
        pendingSession = nil
        let payload = [
            "access_token": session.accessToken,
            "refresh_token": session.refreshToken,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "window.__workbenchWidgetSession = \(json); window.dispatchEvent(new Event('workbench-widget-session'));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func startControlServer() {
        do {
            let listener = try NWListener(using: .tcp, on: 17891)
            listener.newConnectionHandler = { [weak self] connection in
                DispatchQueue.main.async { self?.handle(connection) }
            }
            listener.start(queue: .main)
            self.listener = listener
        } catch {
            showError("无法启动便签控制服务：\(error.localizedDescription)")
        }
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: .main)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] content, _, isComplete, error in
            DispatchQueue.main.async {
                var next = buffer
                if let content { next.append(content) }
                if let request = HTTPRequest(data: next) {
                    self?.respond(to: request, on: connection)
                    return
                }
                if isComplete || error != nil {
                    connection.cancel()
                    return
                }
                self?.receive(on: connection, buffer: next)
            }
        }
    }

    private func respond(to request: HTTPRequest, on connection: NWConnection) {
        var status = "200 OK"
        var body = "{\"ok\":true}"
        if request.method == "OPTIONS" {
            body = ""
        } else if request.method == "POST", request.path == "/show" {
            let payload = request.json
            showWidget(
                origin: payload["origin"] as? String,
                accessToken: payload["accessToken"] as? String,
                refreshToken: payload["refreshToken"] as? String
            )
        } else if request.method == "POST", request.path == "/reload" {
            reloadTasks()
        } else if request.method == "POST", request.path == "/quit" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                NSApp.terminate(nil)
            }
        } else if request.method == "GET", request.path == "/health" {
            body = "{\"ok\":true}"
        } else {
            status = "404 Not Found"
            body = "{\"ok\":false}"
        }
        let response = """
        HTTP/1.1 \(status)\r
        Access-Control-Allow-Origin: *\r
        Access-Control-Allow-Methods: GET, POST, OPTIONS\r
        Access-Control-Allow-Headers: content-type\r
        Content-Type: application/json; charset=utf-8\r
        Content-Length: \(body.utf8.count)\r
        Connection: close\r
        \r
        \(body)
        """
        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "今日安排便签无法启动"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
}

private struct HTTPRequest {
    let method: String
    let path: String
    let json: [String: Any]

    init?(data: Data) {
        guard let text = String(data: data, encoding: .utf8),
              let headerEnd = text.range(of: "\r\n\r\n") else { return nil }
        let header = String(text[..<headerEnd.lowerBound])
        let body = String(text[headerEnd.upperBound...])
        let lines = header.split(separator: "\r\n")
        guard let requestLine = lines.first else { return nil }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { return nil }
        method = String(parts[0])
        path = String(parts[1].split(separator: "?").first ?? parts[1])
        let headers = Dictionary(uniqueKeysWithValues: lines.dropFirst().compactMap { line -> (String, String)? in
            guard let separator = line.firstIndex(of: ":") else { return nil }
            return (line[..<separator].lowercased(), line[line.index(after: separator)...].trimmingCharacters(in: .whitespaces))
        })
        let length = Int(headers["content-length"] ?? "0") ?? 0
        if method != "GET" && method != "OPTIONS" && body.utf8.count < length { return nil }
        json = (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [String: Any] ?? [:]
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
