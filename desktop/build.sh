#!/bin/sh
# Builds dist/Vesper.app and dist/Vesper.dmg. Needs only the Xcode command line tools.
set -eu

cd "$(dirname "$0")"
DIST=dist
APP="$DIST/Vesper.app"
WORK="$DIST/work"

rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$WORK/Vesper.iconset" "$WORK/dmg"

swiftc -O -swift-version 5 -parse-as-library -target "$(uname -m)-apple-macos13" \
	-o "$APP/Contents/MacOS/Vesper" Vesper.swift LaunchView.swift
cp Info.plist "$APP/Contents/Info.plist"

swift make-icon.swift ../static/favicon.svg "$WORK/icon.png"
for size in 16 32 128 256 512; do
	sips -z "$size" "$size" "$WORK/icon.png" --out "$WORK/Vesper.iconset/icon_${size}x${size}.png" >/dev/null
	double=$((size * 2))
	sips -z "$double" "$double" "$WORK/icon.png" --out "$WORK/Vesper.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/Vesper.iconset" -o "$APP/Contents/Resources/Vesper.icns"

# Ad-hoc: enough to run on this Mac. Other Macs would need a Developer ID signature.
codesign --force --sign - "$APP"

cp -R "$APP" "$WORK/dmg/"
ln -s /Applications "$WORK/dmg/Applications"
hdiutil create -quiet -volname Vesper -srcfolder "$WORK/dmg" -ov -format UDZO "$DIST/Vesper.dmg"

rm -rf "$WORK"
echo "Built $DIST/Vesper.dmg"
