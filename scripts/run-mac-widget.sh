#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/desktop-widget/TodayWidget.app"

swift build -c release --package-path "$root/desktop-widget"
bin="$(swift build -c release --package-path "$root/desktop-widget" --show-bin-path)/TodayWidget"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp "$bin" "$app/Contents/MacOS/TodayWidget"
cp "$root/desktop-widget/Info.plist" "$app/Contents/Info.plist"

open -n "$app"
