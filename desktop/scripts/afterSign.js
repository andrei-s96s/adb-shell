// electron-builder hook: без него собранный .app получал НЕПОЛНУЮ подпись —
// только у исполняемого файла (унаследованную от прекомпилированного
// Electron.app), не покрывающую ресурсы (app.asar и т.п.), добавленные
// при паковке. Результат: `spctl -a -vvv --type execute` реально отвергал
// такую сборку ("code has no resources but signature indicates they must
// be present"), и любой скачанный через браузер (с карантином) .app
// показывал "повреждён и не может быть открыт" — самая жёсткая форма
// отказа Gatekeeper, не просто предупреждение "неизвестный разработчик".
// Поймано прогоном spctl на реальном артефакте релиза, не чтением кода.
// Пере-подписываем всё целиком (ad-hoc, --deep) уже ПОСЛЕ того как
// electron-builder разложил ресурсы — тот же приём, что build_app.sh
// использует для Swift-версии (`codesign --force --deep --sign -`).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`[afterSign] Re-signed (ad-hoc, --deep): ${appPath}`);
};
