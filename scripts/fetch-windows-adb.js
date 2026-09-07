// Скачивает Android Platform Tools для Windows и раскладывает adb.exe (+
// обязательные DLL) в vendor/win/ — оттуда electron-builder копирует их в
// resources собранного .exe через build.win.extraResources (см.
// package.json), а AdbService.locateAdb() их там и ищет на рантайме.
// Тот же источник и подход, что build_app.sh использует для macOS —
// официальные бинарники Google, Apache License 2.0.
//
// Распаковка — через нативный unzip ОС (Expand-Archive на Windows, unzip
// на macOS/Linux), а не npm-пакет: extract-zip@2 в этом окружении молча
// зависает (await никогда не разрешается, но и не падает — процесс просто
// выходит с кодом 0, не долистав до конца), поймано именно прогоном
// скрипта, не чтением кода.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const URL = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
// Google не публикует надёжно версионированные архивы под КАЖДЫЙ релиз
// platform-tools по предсказуемому URL (проверено: platform-tools_rXX.X.X-
// windows.zip существует для части старых версий, но не для самой свежей на
// момент проверки) -- "закрепить" версию, скачивая с другого URL, поэтому
// нельзя. Вместо этого сверяем Pkg.Revision из уже скачанного архива с этой
// константой и падаем с понятной ошибкой при расхождении -- сборка на разных
// датах (или пересборка старого тега) не должна тихо получать другой
// adb.exe без чьего-либо решения. Обновление намеренное: увидев ошибку
// ниже, проверьте новую версию и, если она устраивает, замените число тут.
const PINNED_VERSION = '37.0.1';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');
const ZIP_PATH = path.join(CACHE_DIR, 'platform-tools-windows.zip');
const EXTRACT_DIR = path.join(CACHE_DIR, 'platform-tools-windows');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'win');

// adb.exe на Windows не работает в одиночку — ему нужны эти две DLL рядом.
const REQUIRED_FILES = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt'];

function extractZip(zipPath, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-oq', zipPath, '-d', destDir], { stdio: 'inherit' });
  }
}

function checkPinnedVersion(sourceDir) {
  const propsPath = path.join(sourceDir, 'source.properties');
  if (!fs.existsSync(propsPath)) return; // не критично -- вдруг формат архива когда-то изменится
  const props = fs.readFileSync(propsPath, 'utf8');
  const match = props.match(/^Pkg\.Revision=(.+)$/m);
  const actualVersion = match?.[1]?.trim();
  if (actualVersion && actualVersion !== PINNED_VERSION) {
    throw new Error(
      `Google отдал platform-tools ${actualVersion}, а запинована версия ${PINNED_VERSION} (см. PINNED_VERSION в ` +
        `${path.basename(__filename)}). Скорее всего Google выпустил новую версию с момента последнего обновления ` +
        `константы -- если ${actualVersion} устраивает, замените PINNED_VERSION и удалите .cache/platform-tools-windows.zip.`
    );
  }
}

async function main() {
  if (REQUIRED_FILES.slice(0, 3).every((f) => fs.existsSync(path.join(VENDOR_DIR, f)))) {
    console.log('vendor/win/adb.exe уже загружен, пропускаю скачивание.');
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  if (!fs.existsSync(ZIP_PATH)) {
    console.log('Скачиваю Android Platform Tools (Windows)…');
    const response = await fetch(URL);
    if (!response.ok) {
      throw new Error(`Не удалось скачать platform-tools: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(ZIP_PATH, buffer);
  }

  extractZip(ZIP_PATH, EXTRACT_DIR);

  const sourceDir = path.join(EXTRACT_DIR, 'platform-tools');
  checkPinnedVersion(sourceDir);

  for (const file of REQUIRED_FILES) {
    const source = path.join(sourceDir, file);
    if (!fs.existsSync(source)) {
      if (file === 'NOTICE.txt') continue; // не критично, если вдруг переименуют
      throw new Error(`В архиве platform-tools не найден ${file}`);
    }
    fs.copyFileSync(source, path.join(VENDOR_DIR, file));
  }

  console.log('Готово: vendor/win/ содержит adb.exe и его зависимости.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
