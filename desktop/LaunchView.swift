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
		let title = NSMutableAttributedString(string: "\u{2726} ", attributes: [.font: NSFont.systemFont(ofSize: 26), .foregroundColor: brass, .baselineOffset: 5])
		title.append(NSAttributedString(string: "Vesper", attributes: [.font: font, .foregroundColor: ivory]))
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
