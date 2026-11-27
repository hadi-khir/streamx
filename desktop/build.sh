#!/bin/sh
# Builds dist/Vesper.app and dist/Vesper.dmg: the window, the site, and the Node that
# runs it. Needs the Xcode command line tools and npm; ffmpeg comes from Homebrew at run time.
set -eu

cd "$(dirname "$0")"
DIST=dist
APP="$DIST/Vesper.app"
WORK="$DIST/work"
CACHE=.cache
SERVER="$APP/Contents/Resources/server"

rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$SERVER" "$APP/Contents/Resources/bin" "$WORK/Vesper.iconset" "$WORK/dmg" "$CACHE"

# The app carries its own Node, so a Homebrew upgrade can't break the database module
case "$(uname -m)" in arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
SUMS=$(curl -fsS https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)
TARBALL=$(echo "$SUMS" | awk -v a="darwin-$ARCH.tar.gz" 'index($2, a) { print $2 }')
[ -f "$CACHE/$TARBALL" ] || curl -fsS -o "$CACHE/$TARBALL" "https://nodejs.org/dist/latest-v22.x/$TARBALL"
[ "$(shasum -a 256 "$CACHE/$TARBALL" | cut -d' ' -f1)" = "$(echo "$SUMS" | awk -v t="$TARBALL" '$2 == t { print $1 }')" ] \
	|| { echo "Node download doesn't match its checksum" >&2; rm -f "$CACHE/$TARBALL"; exit 1; }
tar -xzf "$CACHE/$TARBALL" -C "$WORK"
NODE="$PWD/$WORK/${TARBALL%.tar.gz}/bin"
cp "$NODE/node" "$APP/Contents/Resources/bin/node"

# The site, with its native modules installed for that Node rather than the system's
(cd .. && npm run build)
cp -R ../build ../drizzle ../package.json ../package-lock.json "$SERVER/"
cp server.mjs "$SERVER/main.mjs"
(cd "$SERVER" && PATH="$NODE:$PATH" npm ci --omit=dev --no-audit --no-fund)
rm -rf "$SERVER/.svelte-kit"

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
