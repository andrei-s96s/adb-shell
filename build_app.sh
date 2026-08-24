#!/bin/bash
# Собирает release-бинарник, вшивает adb (Android Platform Tools) и упаковывает
# всё в двойной клик .app бандл в корне проекта: AdbShell.app
# Так релиз не требует отдельной установки adb на машине пользователя.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> swift build -c release"
swift build -c release

APP_NAME="AdbShell"
APP_DIR="${APP_NAME}.app"
BIN_PATH=".build/release/${APP_NAME}"
CACHE_DIR=".build/platform-tools-cache"
PLATFORM_TOOLS_URL="https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/${APP_NAME}"
cp Resources/Info.plist "$APP_DIR/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP_DIR/Contents/Resources/AppIcon.icns"

# Ресурс-бандл локализации (SPM resources: ru.lproj/en.lproj) — сгенерированный
# resource_bundle_accessor ищет его через Bundle.main.bundleURL, т.е. прямо в
# корне .app, рядом с Contents, а не внутри Contents/Resources.
RESOURCE_BUNDLE=".build/release/${APP_NAME}_${APP_NAME}.bundle"
if [ -d "$RESOURCE_BUNDLE" ]; then
  cp -R "$RESOURCE_BUNDLE" "$APP_DIR/${APP_NAME}_${APP_NAME}.bundle"
fi

# --- adb: берём из локального кеша, иначе качаем официальный Platform Tools ---
if [ ! -x "$CACHE_DIR/platform-tools/adb" ]; then
  echo "==> Скачиваю Android Platform Tools (adb) от Google…"
  mkdir -p "$CACHE_DIR"
  curl -fsSL "$PLATFORM_TOOLS_URL" -o "$CACHE_DIR/platform-tools.zip"
  unzip -oq "$CACHE_DIR/platform-tools.zip" -d "$CACHE_DIR"
fi

cp "$CACHE_DIR/platform-tools/adb" "$APP_DIR/Contents/Resources/adb"
chmod +x "$APP_DIR/Contents/Resources/adb"
if [ -f "$CACHE_DIR/platform-tools/NOTICE.txt" ]; then
  cp "$CACHE_DIR/platform-tools/NOTICE.txt" "$APP_DIR/Contents/Resources/adb-NOTICE.txt"
fi

# Подписываем ad-hoc (включая вшитый adb), чтобы Gatekeeper не ругался локально
codesign --force --sign - "$APP_DIR/Contents/Resources/adb" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> Готово: $(pwd)/$APP_DIR (adb вшит, отдельная установка не требуется)"
echo "Запуск: open $APP_DIR"
