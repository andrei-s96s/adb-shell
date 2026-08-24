#!/bin/bash
# Собирает release-бинарник, вшивает adb (Android Platform Tools), scrcpy
# (Genymobile) и aapt2 (Android Gradle Plugin, для иконок приложений) и
# упаковывает всё в двойной клик .app бандл в корне проекта: AdbShell.app.
# Так релиз не требует отдельной установки этих инструментов на машине
# пользователя.
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

# --- scrcpy: вшиваем официальный self-contained релиз (Genymobile/scrcpy, Apache-2.0) ---
# для зеркалирования экрана — тот же принцип, что и с adb: пользователю ничего
# отдельно ставить не нужно. scrcpy сам укажем на уже вшитый adb (ADB=) и на
# вшитый scrcpy-server (SCRCPY_SERVER_PATH=) через env — см. ScreenMirrorService.swift.
SCRCPY_VERSION="4.1"
SCRCPY_CACHE_DIR=".build/scrcpy-cache"
case "$(uname -m)" in
  arm64)   SCRCPY_ARCH="aarch64" ;;
  x86_64)  SCRCPY_ARCH="x86_64" ;;
  *)       SCRCPY_ARCH="" ;;
esac

if [ -n "$SCRCPY_ARCH" ]; then
  SCRCPY_TARBALL="scrcpy-macos-${SCRCPY_ARCH}-v${SCRCPY_VERSION}.tar.gz"
  SCRCPY_URL="https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${SCRCPY_TARBALL}"

  if [ ! -x "$SCRCPY_CACHE_DIR/scrcpy" ]; then
    echo "==> Скачиваю scrcpy v${SCRCPY_VERSION} (${SCRCPY_ARCH}) для зеркалирования экрана…"
    mkdir -p "$SCRCPY_CACHE_DIR"
    curl -fsSL "$SCRCPY_URL" -o "$SCRCPY_CACHE_DIR/scrcpy.tar.gz"
    tar -xzf "$SCRCPY_CACHE_DIR/scrcpy.tar.gz" -C "$SCRCPY_CACHE_DIR" --strip-components=1
  fi

  cp "$SCRCPY_CACHE_DIR/scrcpy" "$APP_DIR/Contents/Resources/scrcpy"
  cp "$SCRCPY_CACHE_DIR/scrcpy-server" "$APP_DIR/Contents/Resources/scrcpy-server"
  chmod +x "$APP_DIR/Contents/Resources/scrcpy"
  if [ -f "$SCRCPY_CACHE_DIR/LICENSE" ]; then
    cp "$SCRCPY_CACHE_DIR/LICENSE" "$APP_DIR/Contents/Resources/scrcpy-LICENSE.txt"
  fi
  codesign --force --sign - "$APP_DIR/Contents/Resources/scrcpy" >/dev/null 2>&1 || true
else
  echo "==> Неизвестная архитектура ($(uname -m)) — scrcpy не вшит, зеркалирование" \
       "будет работать только если scrcpy установлен вручную (brew install scrcpy)"
fi

# --- aapt2: вшиваем для извлечения реальных иконок приложений из APK
# (`aapt2 dump badging`) — официальный универсальный (x86_64+arm64) бинарник
# из того же Maven-репозитория Google, что использует Android Gradle Plugin,
# Apache-2.0. Без него список приложений просто показывает иконку-плейсхолдер.
AAPT2_VERSION="9.3.2-15703166"
AAPT2_CACHE_DIR=".build/aapt2-cache"
AAPT2_URL="https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/${AAPT2_VERSION}/aapt2-${AAPT2_VERSION}-osx.jar"

if [ ! -x "$AAPT2_CACHE_DIR/aapt2" ]; then
  echo "==> Скачиваю aapt2 v${AAPT2_VERSION} (извлечение иконок приложений)…"
  mkdir -p "$AAPT2_CACHE_DIR"
  curl -fsSL "$AAPT2_URL" -o "$AAPT2_CACHE_DIR/aapt2.jar"
  unzip -oq "$AAPT2_CACHE_DIR/aapt2.jar" aapt2 NOTICE -d "$AAPT2_CACHE_DIR"
fi

cp "$AAPT2_CACHE_DIR/aapt2" "$APP_DIR/Contents/Resources/aapt2"
chmod +x "$APP_DIR/Contents/Resources/aapt2"
if [ -f "$AAPT2_CACHE_DIR/NOTICE" ]; then
  cp "$AAPT2_CACHE_DIR/NOTICE" "$APP_DIR/Contents/Resources/aapt2-NOTICE.txt"
fi
codesign --force --sign - "$APP_DIR/Contents/Resources/aapt2" >/dev/null 2>&1 || true

# Подписываем ad-hoc (включая вшитые adb/scrcpy/aapt2), чтобы Gatekeeper не ругался локально
codesign --force --sign - "$APP_DIR/Contents/Resources/adb" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> Готово: $(pwd)/$APP_DIR (adb, scrcpy и aapt2 вшиты, отдельная установка не требуется)"
echo "Запуск: open $APP_DIR"
