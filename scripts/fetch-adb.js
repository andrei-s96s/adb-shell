// Скачивает Android Platform Tools и раскладывает adb (+ обязательные DLL
// на Windows) в vendor/<mac|win|linux>/ — оттуда electron-builder копирует
// их в resources собранного приложения через build.<mac|win|linux>.
// extraResources (см. package.json), а AdbService.locateAdb() их там и
// ищет на рантайме. Тот же официальный источник, что build_app.sh
// использует для macOS — официальные бинарники Google, Apache License 2.0.
//
// Раньше adb вшивался только для Windows (единственная платформа, где
// пользователь заведомо не может рассчитывать на adb из системного пакетного
// менеджера) — mac/linux полагались на adb из PATH. По факту это означало,
// что "работает из коробки" было верно только для одной из трёх платформ:
// свежий пользователь без Android SDK/adb в PATH получал на macOS/Linux
// сходу нерабочее приложение с непонятной ошибкой запуска adb. Теперь
// вшивается везде, единым скриптом — та же параметризация target'ом
// (mac|win|linux) первым аргументом, что уже используют fetch-aapt2.js и
// fetch-scrcpy.js.
//
// Распаковка — через нативный unzip ОС, не npm-пакет: extract-zip@2 в этом
// окружении молча зависает (await никогда не разрешается, но и не падает —
// процесс просто выходит с кодом 0, не долистав до конца), поймано именно
// прогоном скрипта, не чтением кода.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Google не публикует надёжно версионированные архивы под КАЖДЫЙ релиз
// platform-tools по предсказуемому URL для всех трёх платформ одновременно
// -- "закрепить" версию, скачивая с другого URL, поэтому нельзя. Вместо
// этого сверяем Pkg.Revision из уже скачанного архива с этой константой и
// падаем с понятной ошибкой при расхождении -- сборка на разных датах (или
// пересборка старого тега) не должна тихо получать другой adb без чьего-либо
// решения. Одна константа на все три платформы -- Google публикует
// platform-tools для Windows/macOS/Linux одним скоординированным релизом.
// Обновление намеренное: увидев ошибку ниже, проверьте новую версию и, если
// она устраивает, замените число тут.
const PINNED_VERSION = '37.0.1';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');

const TARGETS = {
  win: {
    classifier: 'windows',
    vendorDir: path.join(ROOT, 'vendor', 'win'),
    // adb.exe на Windows не работает в одиночку — ему нужны эти DLL рядом.
    files: ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt'],
    requiredForSkipCheck: ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll'],
  },
  mac: {
    classifier: 'darwin',
    vendorDir: path.join(ROOT, 'vendor', 'mac'),
    // Google публикует mac adb уже universal (x86_64+arm64) "из коробки" --
    // тот же файл подходит для сборки под любую архитектуру, lipo (как для
    // scrcpy в fetch-scrcpy.js) здесь не нужен.
    files: ['adb', 'NOTICE.txt'],
    requiredForSkipCheck: ['adb'],
  },
  linux: {
    classifier: 'linux',
    vendorDir: path.join(ROOT, 'vendor', 'linux'),
    files: ['adb', 'NOTICE.txt'],
    requiredForSkipCheck: ['adb'],
  },
};

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

function checkPinnedVersion(sourceDir, classifier) {
  const propsPath = path.join(sourceDir, 'source.properties');
  if (!fs.existsSync(propsPath)) return; // не критично -- вдруг формат архива когда-то изменится
  const props = fs.readFileSync(propsPath, 'utf8');
  const match = props.match(/^Pkg\.Revision=(.+)$/m);
  const actualVersion = match?.[1]?.trim();
  if (actualVersion && actualVersion !== PINNED_VERSION) {
    throw new Error(
      `Google отдал platform-tools ${actualVersion} (${classifier}), а запинована версия ${PINNED_VERSION} (см. PINNED_VERSION в ` +
        `${path.basename(__filename)}). Скорее всего Google выпустил новую версию с момента последнего обновления ` +
        `константы -- если ${actualVersion} устраивает, замените PINNED_VERSION и удалите .cache/platform-tools-${classifier}.zip.`
    );
  }
}

async function fetchTarget(target) {
  const config = TARGETS[target];
  if (!config) {
    throw new Error(`Использование: node fetch-adb.js <mac|win|linux> (получено: ${target ?? '(ничего)'})`);
  }

  if (config.requiredForSkipCheck.every((f) => fs.existsSync(path.join(config.vendorDir, f)))) {
    console.log(`vendor/${path.basename(config.vendorDir)}/adb${target === 'win' ? '.exe' : ''} уже загружен, пропускаю скачивание.`);
    return;
  }

  const url = `https://dl.google.com/android/repository/platform-tools-latest-${config.classifier}.zip`;
  const zipPath = path.join(CACHE_DIR, `platform-tools-${config.classifier}.zip`);
  const extractDir = path.join(CACHE_DIR, `platform-tools-${config.classifier}`);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(config.vendorDir, { recursive: true });

  if (!fs.existsSync(zipPath)) {
    console.log(`Скачиваю Android Platform Tools (${config.classifier})…`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Не удалось скачать platform-tools: HTTP ${response.status}`);
    }
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }

  extractZip(zipPath, extractDir);

  const sourceDir = path.join(extractDir, 'platform-tools');
  checkPinnedVersion(sourceDir, config.classifier);

  for (const file of config.files) {
    const source = path.join(sourceDir, file);
    if (!fs.existsSync(source)) {
      if (file === 'NOTICE.txt') continue; // не критично, если вдруг переименуют
      throw new Error(`В архиве platform-tools (${config.classifier}) не найден ${file}`);
    }
    fs.copyFileSync(source, path.join(config.vendorDir, file));
  }
  if (target !== 'win') fs.chmodSync(path.join(config.vendorDir, 'adb'), 0o755);

  console.log(`Готово: vendor/${path.basename(config.vendorDir)}/ содержит adb${target === 'win' ? '.exe' : ''} и зависимости.`);
}

async function main() {
  await fetchTarget(process.argv[2]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
