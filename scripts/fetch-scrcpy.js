// Скачивает scrcpy (Genymobile/scrcpy, Apache-2.0) для зеркалирования
// экрана — те же официальные self-contained релизы, что build_app.sh уже
// вшивает в Swift-версию под macOS (SCRCPY_VERSION здесь совпадает с той
// константой), плюс Linux. На Windows это самодостаточный архив вместе со
// своими SDL2/avcodec/avutil/... DLL — копируем всё, КРОМЕ входящих в
// архив adb.exe/AdbWin*.dll: наш собственный adb.exe уже фетчится отдельно
// (fetch-windows-adb.js) и ScreenMirrorService передаёт scrcpy путь к нему
// через переменную окружения ADB= явно, тащить второй, потенциально другой
// версии adb.exe в тот же vendor/win/ смысла нет. На macOS собирается
// universal-бинарник из двух архитектурных архивов через lipo — см.
// fetchMac() ниже.
//
// Распаковка — через нативный tar/unzip ОС, не npm-пакет (см.
// fetch-windows-adb.js про то, почему не extract-zip).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRCPY_VERSION = '4.1';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');

const ADB_FILES_TO_SKIP = new Set(['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt']);

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

function extractTarGz(tarPath, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  // Архив содержит один верхний каталог -- strip-components=1, тот же приём,
  // что build_app.sh уже использует для macOS.
  execFileSync('tar', ['-xzf', tarPath, '-C', destDir, '--strip-components=1'], { stdio: 'inherit' });
}

/** scrcpy публикует ОТДЕЛЬНЫЙ архив на каждую архитектуру (в отличие от
 * aapt2 -- см. fetch-aapt2.js, mac-классификатор там уже universal "из
 * коробки"). Раньше здесь брался только архив под process.arch раннера --
 * годится для сборки "по архитектуре хоста", но пакет теперь собирается как
 * universal (см. package.json build.mac.target[0].arch) и должен запускать
 * зеркалирование и на Intel, и на Apple Silicon Mac независимо от того, на
 * каком из них шла сборка. lipo -create сшивает два однооархитектурных
 * бинарника в один fat -- тот же приём, которым Xcode собирает universal
 * .app из двух отдельных таргетов. scrcpy-server выполняется НА УСТРОЙСТВЕ
 * (adb push + app_process), архитектура хоста тут ни при чём -- содержимое
 * идентично в обоих архивах (сверено вручную побайтово), можно брать любой. */
async function fetchMac() {
  const vendorDir = path.join(ROOT, 'vendor', 'mac');
  if (fs.existsSync(path.join(vendorDir, 'scrcpy'))) {
    console.log('vendor/mac/scrcpy уже загружен, пропускаю скачивание.');
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(vendorDir, { recursive: true });

  const extractDirs = {};
  for (const arch of ['x86_64', 'aarch64']) {
    const tarball = `scrcpy-macos-${arch}-v${SCRCPY_VERSION}.tar.gz`;
    const url = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${tarball}`;
    const tarPath = path.join(CACHE_DIR, tarball);
    const extractDir = path.join(CACHE_DIR, `scrcpy-mac-${arch}`);

    if (!fs.existsSync(tarPath)) {
      console.log(`Скачиваю scrcpy v${SCRCPY_VERSION} (macOS ${arch})…`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Не удалось скачать scrcpy: HTTP ${response.status}`);
      fs.writeFileSync(tarPath, Buffer.from(await response.arrayBuffer()));
    }
    extractTarGz(tarPath, extractDir);
    extractDirs[arch] = extractDir;
  }

  execFileSync(
    'lipo',
    ['-create', path.join(extractDirs.x86_64, 'scrcpy'), path.join(extractDirs.aarch64, 'scrcpy'), '-output', path.join(vendorDir, 'scrcpy')],
    { stdio: 'inherit' }
  );
  fs.chmodSync(path.join(vendorDir, 'scrcpy'), 0o755);

  fs.copyFileSync(path.join(extractDirs.aarch64, 'scrcpy-server'), path.join(vendorDir, 'scrcpy-server'));

  const licenseSource = path.join(extractDirs.aarch64, 'LICENSE');
  if (fs.existsSync(licenseSource)) {
    fs.copyFileSync(licenseSource, path.join(vendorDir, 'scrcpy-LICENSE.txt'));
  }

  console.log(`Готово: ${path.join(vendorDir, 'scrcpy')} (universal x86_64+arm64)`);
}

/** Linux-архив scrcpy содержит и свой adb -- в отличие от Windows-ветки
 * выше (которая копирует ВСЁ, кроме файлов из ADB_FILES_TO_SKIP), здесь
 * просто копируются только два нужных файла явным списком, adb из архива
 * никогда не попадает в vendor/linux -- свой adb для Linux сознательно не
 * вшивается вообще (см. package.json build.linux), полагаемся на adb из
 * PATH пользователя, тот же выбор, что уже сделан для macOS. Только
 * x86_64 -- scrcpy не публикует отдельный релиз под Linux arm64. */
async function fetchLinux() {
  const vendorDir = path.join(ROOT, 'vendor', 'linux');
  if (fs.existsSync(path.join(vendorDir, 'scrcpy'))) {
    console.log('vendor/linux/scrcpy уже загружен, пропускаю скачивание.');
    return;
  }
  const tarball = `scrcpy-linux-x86_64-v${SCRCPY_VERSION}.tar.gz`;
  const url = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${tarball}`;
  const tarPath = path.join(CACHE_DIR, tarball);
  const extractDir = path.join(CACHE_DIR, 'scrcpy-linux-x86_64');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(vendorDir, { recursive: true });

  if (!fs.existsSync(tarPath)) {
    console.log(`Скачиваю scrcpy v${SCRCPY_VERSION} (Linux)…`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось скачать scrcpy: HTTP ${response.status}`);
    fs.writeFileSync(tarPath, Buffer.from(await response.arrayBuffer()));
  }

  extractTarGz(tarPath, extractDir);

  for (const file of ['scrcpy', 'scrcpy-server']) {
    const source = path.join(extractDir, file);
    if (!fs.existsSync(source)) throw new Error(`В архиве scrcpy не найден ${file}`);
    fs.copyFileSync(source, path.join(vendorDir, file));
  }
  fs.chmodSync(path.join(vendorDir, 'scrcpy'), 0o755);

  const licenseSource = path.join(extractDir, 'LICENSE');
  if (fs.existsSync(licenseSource)) {
    fs.copyFileSync(licenseSource, path.join(vendorDir, 'scrcpy-LICENSE.txt'));
  }

  console.log(`Готово: ${path.join(vendorDir, 'scrcpy')}`);
}

async function fetchWindows() {
  const vendorDir = path.join(ROOT, 'vendor', 'win');
  if (fs.existsSync(path.join(vendorDir, 'scrcpy.exe'))) {
    console.log('vendor/win/scrcpy.exe уже загружен, пропускаю скачивание.');
    return;
  }
  const zipName = `scrcpy-win64-v${SCRCPY_VERSION}.zip`;
  const url = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${zipName}`;
  const zipPath = path.join(CACHE_DIR, zipName);
  const extractDir = path.join(CACHE_DIR, 'scrcpy-win64');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(vendorDir, { recursive: true });

  if (!fs.existsSync(zipPath)) {
    console.log(`Скачиваю scrcpy v${SCRCPY_VERSION} (Windows)…`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось скачать scrcpy: HTTP ${response.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }

  extractZip(zipPath, extractDir);

  // В отличие от macOS-tar.gz (распаковывается с --strip-components=1),
  // win64-zip содержит один верхний каталог scrcpy-win64-vX.Y/ -- ищем
  // реальный источник файлов: либо сам extractDir (если когда-нибудь Genymobile
  // уберёт обёртку), либо единственный подкаталог внутри него.
  let sourceDir = extractDir;
  if (!fs.existsSync(path.join(sourceDir, 'scrcpy.exe'))) {
    const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const nested = entries.find((e) => fs.existsSync(path.join(extractDir, e.name, 'scrcpy.exe')));
    if (nested) sourceDir = path.join(extractDir, nested.name);
  }
  if (!fs.existsSync(path.join(sourceDir, 'scrcpy.exe'))) {
    throw new Error('В архиве scrcpy не найден scrcpy.exe');
  }
  for (const name of fs.readdirSync(sourceDir)) {
    if (ADB_FILES_TO_SKIP.has(name)) continue;
    const stat = fs.statSync(path.join(sourceDir, name));
    if (!stat.isFile()) continue;
    // Переименовываем на manier scrcpy-LICENSE.txt (как на стороне mac) --
    // общий "LICENSE.txt" в одной директории с другими вендорными
    // бинарниками нечитаем и рискует столкнуться с лицензией другого тула.
    const destName = name === 'LICENSE.txt' ? 'scrcpy-LICENSE.txt' : name;
    fs.copyFileSync(path.join(sourceDir, name), path.join(vendorDir, destName));
  }

  console.log(`Готово: ${path.join(vendorDir, 'scrcpy.exe')}`);
}

async function main() {
  const target = process.argv[2];
  if (target === 'mac') return fetchMac();
  if (target === 'win') return fetchWindows();
  if (target === 'linux') return fetchLinux();
  throw new Error(`Использование: node fetch-scrcpy.js <mac|win|linux> (получено: ${target ?? '(ничего)'})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
