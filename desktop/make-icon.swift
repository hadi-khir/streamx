// Renders the site's favicon as a 1024px PNG with the margin macOS icons carry.
// Usage: swift make-icon.swift <favicon.svg> <out.png>
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let svg = NSImage(contentsOfFile: args[1]) else {
	fatalError("Could not read the icon source")
}

let size = 1024
let margin = 100
let bitmap = NSBitmapImageRep(
	bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
	hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
svg.draw(in: NSRect(x: margin, y: margin, width: size - margin * 2, height: size - margin * 2))
NSGraphicsContext.current?.flushGraphics()

try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
