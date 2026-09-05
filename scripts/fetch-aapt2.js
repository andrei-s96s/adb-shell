// Скачивает aapt2 (Android Gradle Plugin, Apache-2.0) — используется
// библиотекой APK, чтобы читать манифест локального .apk (пакет,
// versionCode) без установки на устройство, для сверки с F-Droid. Тот же
// официальный бинарник и версия, что build_app.sh вшивает в Swift-версию
// под macOS — здесь просто плюс классификаторы Windows и Linux.
//
// Распаковка через нативный unzip ОС, не npm-пакет — extract-zip@2 в этом
// окружении молча зависает (см. fetch-windows-adb.js, тот же приём).
//
// Целевая платформа передаётся явно первым аргументом (mac|win|linux), а не
// определяется через process.platform — CI собирает Windows-версию только
// на windows-latest, macOS-версию на macos-latest и Linux-версию на
// ubuntu-latest, так что текущий process.platform на раннере и так
// совпадает с целью; явный аргумент нужен для симметрии с dist:win/dist:mac/
// dist:linux и для ручного локального запуска.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const AAPT2_VERSION = '9.4.0-15978811';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');

const TARGETS = {
  mac: { classifier: 'osx', exeName: 'aapt2', vendorDir: path.join(ROOT, 'vendor', 'mac') },
  win: { classifier: 'windows', exeName: 'aapt2.exe', vendorDir: path.join(ROOT, 'vendor', 'win') },
  // mac-классификатор ("osx") уже universal (x86_64+arm64) в самой maven2-
  // публикации Google — в отличие от scrcpy ниже, здесь lipo не нужен.
  linux: { classifier: 'linux', exeName: 'aapt2', vendorDir: path.join(ROOT, 'vendor', 'linux') },
};

function extractJar(jarPath, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${jarPath}' -DestinationPath '${destDir}' -Force`],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-oq', jarPath, '-d', destDir], { stdio: 'inherit' });
  }
}

async function main() {
  const targetName = process.argv[2];
  const target = TARGETS[targetName];
  if (!target) {
    throw new Error(`Использование: node fetch-aapt2.js <mac|win|linux> (получено: ${targetName ?? '(ничего)'})`);
  }

  const exePath = path.join(target.vendorDir, target.exeName);
  if (fs.existsSync(exePath)) {
    console.log(`${exePath} уже загружен, пропускаю скачивание.`);
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(target.vendorDir, { recursive: true });

  const jarUrl = `https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/${AAPT2_VERSION}/aapt2-${AAPT2_VERSION}-${target.classifier}.jar`;
  const jarPath = path.join(CACHE_DIR, `aapt2-${target.classifier}.jar`);
  const extractDir = path.join(CACHE_DIR, `aapt2-${target.classifier}`);

  if (!fs.existsSync(jarPath)) {
    console.log(`Скачиваю aapt2 v${AAPT2_VERSION} (${target.classifier})…`);
    const response = await fetch(jarUrl);
    if (!response.ok) {
      throw new Error(`Не удалось скачать aapt2: HTTP ${response.status}`);
    }
    fs.writeFileSync(jarPath, Buffer.from(await response.arrayBuffer()));
  }

  extractJar(jarPath, extractDir);

  const sourceExe = path.join(extractDir, target.exeName);
  if (!fs.existsSync(sourceExe)) {
    throw new Error(`В архиве aapt2 не найден ${target.exeName}`);
  }
  fs.copyFileSync(sourceExe, exePath);
  if (target.exeName === 'aapt2') fs.chmodSync(exePath, 0o755);

  const noticeSource = path.join(extractDir, 'NOTICE');
  if (fs.existsSync(noticeSource)) {
    fs.copyFileSync(noticeSource, path.join(target.vendorDir, 'aapt2-NOTICE.txt'));
  }

  console.log(`Готово: ${exePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
