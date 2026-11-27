import AppKit

let inkBackground = NSColor(red: 0.078, green: 0.067, blue: 0.059, alpha: 1)
private let brass = NSColor(red: 0.851, green: 0.651, blue: 0.314, alpha: 1)
private let ivory = NSColor(red: 0.953, green: 0.929, blue: 0.886, alpha: 1)

/**
 Tells the app once the page has content on screen. WebKit's own "finished"
 comes too late for this: the home page holds its response open while its rows
 stream in. Two animation frames after the body fills, the first paint is done.
 */
let firstPaintScript = """
(function check() {
	if (document.body && document.body.children.length) {
		requestAnimationFrame(() => requestAnimationFrame(() =>
			window.webkit.messageHandlers.painted.postMessage(true)));
	} else {
		requestAnimationFrame(check);
	}
})();
"""

/** The logo, as in the site's TvMark.svelte: a television with rabbit ears, drawn by hand. */
private let markSVG = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 2 52 58" width="52" height="58" fill="none" stroke="#d9a650" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
<path d="M30.5 25.5C27 19 23 13 18.6 8.2M33.4 25.4C37.2 18 41 12.6 46.4 6.6"/><circle cx="17.6" cy="7.2" r="2.2"/><circle cx="47.2" cy="5.8" r="2.2"/>
<path d="M13 25.6C25 24.4 39.5 25.1 51.5 24.7 54.6 24.6 56 26.3 55.9 29.4 55.6 36.4 56.3 43.6 55.8 49.8 55.6 52.6 54.1 53.9 51.2 53.8 39 54.4 25 53.6 12.7 54.2 9.8 54.3 8.3 52.8 8.4 50 8.7 43 7.9 35.6 8.5 29.3 8.7 26.9 10.3 25.7 13 25.6Z"/>
<path d="M16.4 30.6C24.6 30 32.2 30.5 39.2 30.2 41.3 30.1 42.1 31.3 42 33.4 41.8 37.8 42.3 42.2 41.9 46 41.7 47.9 40.7 48.7 38.7 48.6 31.6 49 24.2 48.4 16.2 48.8 14.3 48.8 13.5 47.8 13.6 45.8 13.8 41.4 13.2 37.2 13.6 33.2 13.8 31.4 14.7 30.6 16.4 30.6Z"/>
<circle cx="49" cy="34.4" r="2.4"/><path d="M46.6 42.6 51.4 42.4M46.8 46.4 51.2 46.6M15.2 54.4 13.4 58.4M48.8 54.2 50.8 58.2"/>
<path d="M17.8 36.2C18.4 34.4 19.6 33.6 21.4 33.4" stroke-width="2.4"/>
</svg>
"""

/** The app's name and, if the wait goes on, a spinner like the site's own. */
final class LaunchView: NSView {
	private let wordmark = NSTextField(labelWithAttributedString: LaunchView.title())
	private let ring = CAGradientLayer()

	private static let ringSize: CGFloat = 40
	private static let ringWidth: CGFloat = 3

	override init(frame: NSRect) {
		super.init(frame: frame)
		wantsLayer = true
		layer?.backgroundColor = inkBackground.cgColor

		wordmark.translatesAutoresizingMaskIntoConstraints = false
		addSubview(wordmark)
		NSLayoutConstraint.activate([
			wordmark.centerXAnchor.constraint(equalTo: centerXAnchor),
			wordmark.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -16)
		])

		// A comet, as on the site: solid at its head, fading away behind it
		ring.type = .conic
		ring.startPoint = CGPoint(x: 0.5, y: 0.5)
		ring.endPoint = CGPoint(x: 0.5, y: 0)
		ring.colors = [brass.cgColor, brass.withAlphaComponent(0).cgColor, brass.withAlphaComponent(0).cgColor]
		ring.locations = [0, 0.85, 1]
		ring.bounds = CGRect(x: 0, y: 0, width: Self.ringSize, height: Self.ringSize)

		let inset = Self.ringWidth / 2
		let mask = CAShapeLayer()
		mask.frame = ring.bounds
		mask.path = CGPath(ellipseIn: ring.bounds.insetBy(dx: inset, dy: inset), transform: nil)
		mask.fillColor = nil
		mask.strokeColor = NSColor.black.cgColor
		mask.lineWidth = Self.ringWidth
		ring.mask = mask
		ring.opacity = 0
		layer?.addSublayer(ring)
	}

	required init?(coder: NSCoder) { fatalError("LaunchView isn't loaded from a nib") }

	private static func title() -> NSAttributedString {
		let font = NSFont(name: "Iowan Old Style", size: 44) ?? NSFont.systemFont(ofSize: 40, weight: .medium)
		let mark = NSTextAttachment()
		mark.image = NSImage(data: Data(markSVG.utf8))
		mark.bounds = CGRect(x: 0, y: -6, width: 40, height: 45)
		let title = NSMutableAttributedString(attachment: mark)
		title.append(NSAttributedString(string: " Streamer", attributes: [.font: font, .foregroundColor: ivory]))
		return title
	}

	override func layout() {
		super.layout()
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		ring.position = CGPoint(x: bounds.midX, y: bounds.midY - 44)
		CATransaction.commit()
	}

	/** The name eases in at once. The spinner waits, so a quick load never shows it. */
	func start() {
		wordmark.alphaValue = 0
		ring.opacity = 0
		NSAnimationContext.runAnimationGroup { context in
			context.duration = 0.35
			wordmark.animator().alphaValue = 1
		}

		let turn = CABasicAnimation(keyPath: "transform.rotation.z")
		turn.fromValue = 0
		turn.toValue = -2 * Double.pi
		turn.duration = 0.9
		turn.repeatCount = .infinity
		ring.add(turn, forKey: "turn")

		let appear = CABasicAnimation(keyPath: "opacity")
		appear.fromValue = 0
		appear.toValue = 1
		appear.beginTime = CACurrentMediaTime() + 0.6
		appear.duration = 0.3
		appear.fillMode = .both
		appear.isRemovedOnCompletion = false
		ring.add(appear, forKey: "appear")
	}

	func stop() {
		ring.removeAllAnimations()
		ring.opacity = 0
	}
}
