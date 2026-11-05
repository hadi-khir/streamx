import AppKit
import WebKit

private let siteURL = URL(string: "https://iptv.khir.ca")!

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
	private var window: NSWindow!
	private var webView: WKWebView!
	private var downloads: [ObjectIdentifier: NSKeyValueObservation] = [:]

	static func main() {
		let app = NSApplication.shared
		let delegate = AppDelegate()
		app.delegate = delegate
		app.run()
	}

	func applicationDidFinishLaunching(_ notification: Notification) {
		let config = WKWebViewConfiguration()
		config.preferences.isElementFullscreenEnabled = true
		// Up-next autoplay and resume shouldn't wait on a click
		config.mediaTypesRequiringUserActionForPlayback = []

		webView = WKWebView(frame: .zero, configuration: config)
		webView.navigationDelegate = self
		webView.uiDelegate = self
		webView.allowsBackForwardNavigationGestures = true
		webView.underPageBackgroundColor = Self.background

		window = NSWindow(
			contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
			styleMask: [.titled, .closable, .miniaturizable, .resizable],
			backing: .buffered,
			defer: false
		)
		window.title = "StreamX"
		window.appearance = NSAppearance(named: .darkAqua)
		window.backgroundColor = Self.background
		window.collectionBehavior.insert(.fullScreenPrimary)
		window.tabbingMode = .disallowed
		window.isReleasedWhenClosed = false
		window.contentView = webView
		window.center()
		window.setFrameAutosaveName("Main")
		window.makeKeyAndOrderFront(nil)

		NSApp.mainMenu = buildMenu()
		NSApp.activate(ignoringOtherApps: true)
		webView.load(URLRequest(url: siteURL))
	}

	func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

	private static let background = NSColor(red: 0.078, green: 0.078, blue: 0.078, alpha: 1)

	// MARK: Menu

	private func buildMenu() -> NSMenu {
		let main = NSMenu()

		let app = submenu(of: main, "StreamX")
		app.addItem(withTitle: "About StreamX", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
		app.addItem(.separator())
		app.addItem(withTitle: "Hide StreamX", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
		app.addItem(withTitle: "Quit StreamX", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

		// Without these items, ⌘C and ⌘V do nothing in the page's text fields
		let edit = submenu(of: main, "Edit")
		edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
		edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
		edit.addItem(.separator())
		edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
		edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
		edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
		edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

		let view = submenu(of: main, "View")
		view.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r").target = self
		view.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[").target = self
		view.addItem(withTitle: "Forward", action: #selector(goForward), keyEquivalent: "]").target = self
		view.addItem(.separator())
		let fullScreen = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
		fullScreen.keyEquivalentModifierMask = [.command, .control]

		let windows = submenu(of: main, "Window")
		windows.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
		windows.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
		windows.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
		NSApp.windowsMenu = windows

		return main
	}

	private func submenu(of parent: NSMenu, _ title: String) -> NSMenu {
		let menu = NSMenu(title: title)
		parent.addItem(withTitle: title, action: nil, keyEquivalent: "").submenu = menu
		return menu
	}

	@objc private func reload() {
		// After a failed load the current page is the error page, not the site
		if webView.url?.host == siteURL.host { webView.reload() } else { webView.load(URLRequest(url: siteURL)) }
	}

	@objc private func goBack() { webView.goBack() }
	@objc private func goForward() { webView.goForward() }

	private func showLoadError(_ error: Error) {
		let cancelled = (error as NSError).code == NSURLErrorCancelled
		// A click that turned into a download reports this; it isn't a failure
		let becameDownload = (error as NSError).domain == "WebKitErrorDomain" && (error as NSError).code == 102
		if cancelled || becameDownload { return }
		webView.loadHTMLString(
			"""
			<body style="background:#141414;color:#ccc;font:15px -apple-system;display:flex;height:90vh;align-items:center;justify-content:center;text-align:center">
			<div><h2 style="color:#fff">Can't reach StreamX</h2><p>Check your connection, then
			<a style="color:#e50914" href="\(siteURL.absoluteString)">try again</a>.</p></div></body>
			""",
			baseURL: nil
		)
	}
}

// MARK: Navigation

extension AppDelegate: WKNavigationDelegate {
	func webView(
		_ webView: WKWebView,
		decidePolicyFor action: WKNavigationAction,
		decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
	) {
		guard let url = action.request.url else { return decisionHandler(.cancel) }
		if action.shouldPerformDownload { return decisionHandler(.download) }
		if url.host == siteURL.host || url.scheme == "about" { return decisionHandler(.allow) }
		// The app is for the site; anything else belongs in the real browser
		NSWorkspace.shared.open(url)
		decisionHandler(.cancel)
	}

	func webView(
		_ webView: WKWebView,
		decidePolicyFor response: WKNavigationResponse,
		decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
	) {
		let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
		let attachment = disposition?.lowercased().hasPrefix("attachment") ?? false
		decisionHandler(attachment || !response.canShowMIMEType ? .download : .allow)
	}

	func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
		download.delegate = self
	}

	func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
		download.delegate = self
	}

	func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
		showLoadError(error)
	}

	func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
		showLoadError(error)
	}

	func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
		webView.reload()
	}
}

// MARK: Page dialogs

extension AppDelegate: WKUIDelegate {
	// WebKit answers confirm() with "no" unless the app shows it itself
	func webView(
		_ webView: WKWebView,
		runJavaScriptConfirmPanelWithMessage message: String,
		initiatedByFrame frame: WKFrameInfo,
		completionHandler: @escaping @MainActor (Bool) -> Void
	) {
		let alert = NSAlert()
		alert.messageText = message
		alert.addButton(withTitle: "OK")
		alert.addButton(withTitle: "Cancel")
		alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
	}

	func webView(
		_ webView: WKWebView,
		runJavaScriptAlertPanelWithMessage message: String,
		initiatedByFrame frame: WKFrameInfo,
		completionHandler: @escaping @MainActor () -> Void
	) {
		let alert = NSAlert()
		alert.messageText = message
		alert.beginSheetModal(for: window) { _ in completionHandler() }
	}

	// Links that ask for a new window open in this one
	func webView(
		_ webView: WKWebView,
		createWebViewWith configuration: WKWebViewConfiguration,
		for action: WKNavigationAction,
		windowFeatures: WKWindowFeatures
	) -> WKWebView? {
		webView.load(action.request)
		return nil
	}
}

// MARK: Downloads

extension AppDelegate: WKDownloadDelegate {
	func download(
		_ download: WKDownload,
		decideDestinationUsing response: URLResponse,
		suggestedFilename: String,
		completionHandler: @escaping @MainActor (URL?) -> Void
	) {
		let panel = NSSavePanel()
		panel.nameFieldStringValue = suggestedFilename
		panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
		panel.beginSheetModal(for: window) { [self] result in
			guard result == .OK, let url = panel.url else { return completionHandler(nil) }
			// The panel already asked before replacing an existing file
			try? FileManager.default.removeItem(at: url)
			trackProgress(of: download, named: url.lastPathComponent)
			completionHandler(url)
		}
	}

	/** Movies take a while, so the title bar says how far along they are. */
	private func trackProgress(of download: WKDownload, named name: String) {
		downloads[ObjectIdentifier(download)] = download.progress.observe(\.fractionCompleted) { [weak self] progress, _ in
			let percent = Int(progress.fractionCompleted * 100)
			Task { @MainActor in
				self?.window.subtitle = progress.totalUnitCount > 0 ? "Downloading \(name): \(percent)%" : "Downloading \(name)…"
			}
		}
		window.subtitle = "Downloading \(name)…"
	}

	func downloadDidFinish(_ download: WKDownload) {
		finish(download, subtitle: "Download complete")
	}

	func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
		finish(download, subtitle: "Download failed")
	}

	private func finish(_ download: WKDownload, subtitle: String) {
		downloads[ObjectIdentifier(download)] = nil
		if downloads.isEmpty { window.subtitle = subtitle }
	}
}
