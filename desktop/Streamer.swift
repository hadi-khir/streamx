import AppKit
import WebKit

// The site runs inside the app, on this machine only. The port is fixed so the
// page's saved settings (kept per address) survive from one launch to the next.
private let sitePort = 47831
private let siteURL = URL(string: "http://127.0.0.1:\(sitePort)")!

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
	private var window: NSWindow!
	private var webView: WKWebView!
	private var launchView: LaunchView!
	private var revealTimer: Timer?
	private var downloads: [ObjectIdentifier: NSKeyValueObservation] = [:]
	private var server: Process?
	private var serverInput: Pipe?

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
		config.userContentController.add(self, name: "painted")
		config.userContentController.addUserScript(
			WKUserScript(source: firstPaintScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
		)

		let frame = NSRect(x: 0, y: 0, width: 1280, height: 800)
		webView = WKWebView(frame: frame, configuration: config)
		webView.navigationDelegate = self
		webView.uiDelegate = self
		webView.allowsBackForwardNavigationGestures = true
		webView.underPageBackgroundColor = inkBackground
		webView.autoresizingMask = [.width, .height]

		launchView = LaunchView(frame: frame)
		launchView.autoresizingMask = [.width, .height]

		let content = NSView(frame: frame)
		content.addSubview(webView)
		content.addSubview(launchView)

		window = NSWindow(
			contentRect: frame,
			styleMask: [.titled, .closable, .miniaturizable, .resizable],
			backing: .buffered,
			defer: false
		)
		window.title = "Streamer"
		window.appearance = NSAppearance(named: .darkAqua)
		window.backgroundColor = inkBackground
		window.titlebarAppearsTransparent = true
		window.collectionBehavior.insert(.fullScreenPrimary)
		window.tabbingMode = .disallowed
		window.isReleasedWhenClosed = false
		window.contentView = content
		window.center()
		window.setFrameAutosaveName("Main")
		window.makeKeyAndOrderFront(nil)

		NSApp.mainMenu = buildMenu()
		NSApp.activate(ignoringOtherApps: true)
		showLaunchView()
		startServer()
		loadWhenServing()
	}

	func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

	func applicationWillTerminate(_ notification: Notification) {
		server?.terminate()
	}

	// MARK: Server

	/** Where the database, catalog cache, settings and log live. */
	private var dataFolder: URL {
		FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Streamer")
	}

	private func startServer() {
		guard server?.isRunning != true, let resources = Bundle.main.resourceURL else { return }
		let data = dataFolder
		// The app used to be called Vesper; its data moves across the first time.
		// The database keeps its old file name.
		if !FileManager.default.fileExists(atPath: data.path) {
			try? FileManager.default.moveItem(at: data.deletingLastPathComponent().appendingPathComponent("Vesper"), to: data)
		}
		try? FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
		let log = data.appendingPathComponent("server.log")
		FileManager.default.createFile(atPath: log.path, contents: nil)

		let process = Process()
		process.executableURL = resources.appendingPathComponent("bin/node")
		// Optional settings such as TMDB_API_KEY; what's set below wins over the file
		process.arguments = ["--env-file-if-exists=\(data.appendingPathComponent(".env").path)", "main.mjs"]
		process.currentDirectoryURL = resources.appendingPathComponent("server")
		process.environment = [
			"NODE_ENV": "production",
			"HOST": "127.0.0.1",
			"PORT": String(sitePort),
			"ORIGIN": siteURL.absoluteString,
			"DATABASE_URL": data.appendingPathComponent("vesper.db").path,
			// An app launched from the Dock doesn't get the shell's PATH, and ffmpeg is Homebrew's
			"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
			"HOME": NSHomeDirectory()
		]
		let input = Pipe()
		process.standardInput = input
		if let out = try? FileHandle(forWritingTo: log) {
			process.standardOutput = out
			process.standardError = out
		}
		do {
			try process.run()
			server = process
			serverInput = input
		} catch {
			NSLog("Streamer's server didn't start: \(error)")
		}
	}

	/** The server takes a moment to come up; the launch view covers the wait. */
	private func loadWhenServing(attempt: Int = 0) {
		var probe = URLRequest(url: siteURL.appendingPathComponent("login"))
		probe.timeoutInterval = 2
		URLSession.shared.dataTask(with: probe) { [weak self] _, response, _ in
			DispatchQueue.main.async {
				MainActor.assumeIsolated {
					guard let self else { return }
					if response != nil || attempt >= 100 || self.server?.isRunning != true {
						self.webView.load(URLRequest(url: siteURL))
					} else {
						DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.loadWhenServing(attempt: attempt + 1) }
					}
				}
			}
		}.resume()
	}

	// MARK: Launch

	/** The web view paints white until the page's first frame, so it stays covered until then. */
	private func showLaunchView() {
		launchView.alphaValue = 1
		launchView.isHidden = false
		launchView.start()
		revealTimer?.invalidate()
		// A page that never reports in is still better seen than hidden
		revealTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in
			MainActor.assumeIsolated { self?.revealPage() }
		}
	}

	private func revealPage() {
		revealTimer?.invalidate()
		revealTimer = nil
		guard !launchView.isHidden else { return }
		NSAnimationContext.runAnimationGroup { context in
			context.duration = 0.3
			launchView.animator().alphaValue = 0
		} completionHandler: { [launchView] in
			MainActor.assumeIsolated {
				launchView?.isHidden = true
				launchView?.stop()
			}
		}
	}

	// MARK: Menu

	private func buildMenu() -> NSMenu {
		let main = NSMenu()

		let app = submenu(of: main, "Streamer")
		app.addItem(withTitle: "About Streamer", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
		app.addItem(.separator())
		app.addItem(withTitle: "Hide Streamer", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
		app.addItem(withTitle: "Quit Streamer", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

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
		showLaunchView()
		// After a failed load the current page is the error page, not the site
		if webView.url?.host == siteURL.host && server?.isRunning == true {
			webView.reload()
		} else {
			startServer()
			loadWhenServing()
		}
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
			<body style="background:#14110f;color:#cfc5b4;font:15px -apple-system;display:flex;height:90vh;align-items:center;justify-content:center;text-align:center">
			<div><h2 style="color:#f3ede2;font:500 26px 'Iowan Old Style',Georgia,serif">Streamer didn't start</h2><p>Press ⌘R to try again.
			If it keeps happening, the reason is in<br>~/Library/Application Support/Streamer/server.log</p></div></body>
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
		showLaunchView()
		webView.reload()
	}
}

extension AppDelegate: WKScriptMessageHandler {
	func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
		revealPage()
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
