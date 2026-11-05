#!/bin/sh
# Builds dist/StreamX.app and dist/StreamX.dmg. Needs only the Xcode command line tools.
set -eu

cd "$(dirname "$0")"
DIST=dist
APP="$DIST/StreamX.app"
WORK="$DIST/work"

rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$WORK/StreamX.iconset" "$WORK/dmg"

swiftc -O -swift-version 5 -parse-as-library -target "$(uname -m)-apple-macos13" \
	-o "$APP/Contents/MacOS/StreamX" StreamX.swift
cp Info.plist "$APP/Contents/Info.plist"

swift make-icon.swift ../static/favicon.svg "$WORK/icon.png"
for size in 16 32 128 256 512; do
	sips -z "$size" "$size" "$WORK/icon.png" --out "$WORK/StreamX.iconset/icon_${size}x${size}.png" >/dev/null
	double=$((size * 2))
	sips -z "$double" "$double" "$WORK/icon.png" --out "$WORK/StreamX.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/StreamX.iconset" -o "$APP/Contents/Resources/StreamX.icns"

# Ad-hoc: enough to run on this Mac. Other Macs would need a Developer ID signature.
codesign --force --sign - "$APP"

cp -R "$APP" "$WORK/dmg/"
ln -s /Applications "$WORK/dmg/Applications"
hdiutil create -quiet -volname StreamX -srcfolder "$WORK/dmg" -ov -format UDZO "$DIST/StreamX.dmg"

rm -rf "$WORK"
echo "Built $DIST/StreamX.dmg"
