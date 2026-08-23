#!/bin/bash
# Собирает release-бинарник и упаковывает его в двойной клик .app бандл
# в корне проекта: AdbShell.app
set -euo pipefail

cd "$(dirname "$0")"

echo "==> swift build -c release"
swift build -c release

APP_NAME="AdbShell"
APP_DIR="${APP_NAME}.app"
BIN_PATH=".build/release/${APP_NAME}"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/${APP_NAME}"
cp Resources/Info.plist "$APP_DIR/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP_DIR/Contents/Resources/AppIcon.icns"

# Подписываем ad-hoc, чтобы Gatekeeper не ругался при локальном запуске
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> Готово: $(pwd)/$APP_DIR"
echo "Запуск: open $APP_DIR"
