// Фикстуры ниже -- дословные фрагменты РЕАЛЬНОГО вывода
// `aapt2 dump resources` на настоящих .apk (Yandex Navi, LocalSend),
// а не выдуманные — оба сценария (прямой растровый вариант в том же
// блоке; ссылка "()" на другой ресурс) встретились на первых же
// проверенных реальных APK, так что оба стоит закрыть тестами на точных
// данных, а не только на abstract-примере из комментария в самом парсере.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdaptiveIconFile, parseResourceBlocks } from '../main/adb/parsers/AdaptiveIconResolver';

const LOCALSEND_DUMP = `
    resource 0x7f0d0000 mipmap/ic_launcher
      (mdpi) (file) res/9w.png type=PNG
      (hdpi) (file) res/yn.png type=PNG
      (xhdpi) (file) res/FS.png type=PNG
      (xxhdpi) (file) res/RJ.png type=PNG
      (xxxhdpi) (file) res/o-.png type=PNG
      (anydpi-v26) (file) res/BW.xml type=XML
    resource 0x7f0d0001 mipmap/ic_launcher_foreground
      (mdpi) (file) res/QZ.png type=PNG
      (hdpi) (file) res/zr.png type=PNG
`;

const YANDEX_NAVI_DUMP = `
    resource 0x7f100000 mipmap/icon
      (mdpi) (file) res/mipmap-mdpi-v4/icon.png type=PNG
      (hdpi) (file) res/mipmap-hdpi-v4/icon.png type=PNG
      (xhdpi) (file) res/mipmap-xhdpi-v4/icon.png type=PNG
      (xxhdpi) (file) res/mipmap-xxhdpi-v4/icon.png type=PNG
      (xxxhdpi) (file) res/mipmap-xxxhdpi-v4/icon.png type=PNG
    resource 0x7f100001 mipmap/icon_round
      (mdpi) (file) res/mipmap-mdpi-v4/icon_round.png type=PNG
    resource 0x7f100002 mipmap/launcher_icon
      () @mipmap/icon
      (anydpi) (file) res/mipmap-anydpi-v26/launcher_icon.xml type=XML
    resource 0x7f100003 mipmap/launcher_icon_round
      () @mipmap/icon_round
      (anydpi) (file) res/mipmap-anydpi-v26/launcher_icon_round.xml type=XML
`;

test('parseResourceBlocks groups entries under their owning resource key', () => {
  const blocks = parseResourceBlocks(LOCALSEND_DUMP);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].key, 'mipmap/ic_launcher');
  assert.equal(blocks[0].entries.length, 6);
  assert.deepEqual(blocks[0].entries[4], { qualifier: 'xxxhdpi', filePath: 'res/o-.png' });
});

test('resolveAdaptiveIconFile finds the best-density raster sibling in the same block (LocalSend)', () => {
  const resolved = resolveAdaptiveIconFile(LOCALSEND_DUMP, 'res/BW.xml');
  assert.deepEqual(resolved, { zipEntryPath: 'res/o-.png', mimeType: 'image/png' });
});

test('resolveAdaptiveIconFile follows a default "()" alias to another resource (Yandex Navi)', () => {
  const resolved = resolveAdaptiveIconFile(YANDEX_NAVI_DUMP, 'res/mipmap-anydpi-v26/launcher_icon.xml');
  assert.deepEqual(resolved, { zipEntryPath: 'res/mipmap-xxxhdpi-v4/icon.png', mimeType: 'image/png' });
});

test('resolveAdaptiveIconFile returns undefined when the icon path is not in any block', () => {
  assert.equal(resolveAdaptiveIconFile(LOCALSEND_DUMP, 'res/does-not-exist.xml'), undefined);
});

test('resolveAdaptiveIconFile returns undefined when the alias points to a resource that is not in the dump', () => {
  const dumpWithDanglingAlias = `
    resource 0x7f100002 mipmap/launcher_icon
      () @mipmap/missing
      (anydpi) (file) res/mipmap-anydpi-v26/launcher_icon.xml type=XML
  `;
  assert.equal(resolveAdaptiveIconFile(dumpWithDanglingAlias, 'res/mipmap-anydpi-v26/launcher_icon.xml'), undefined);
});

test('resolveAdaptiveIconFile recognizes .webp as a valid raster sibling', () => {
  const dump = `
    resource 0x7f0d0000 mipmap/ic_launcher
      (mdpi) (file) res/icon.webp
      (anydpi-v26) (file) res/ic_launcher.xml type=XML
  `;
  assert.deepEqual(resolveAdaptiveIconFile(dump, 'res/ic_launcher.xml'), { zipEntryPath: 'res/icon.webp', mimeType: 'image/webp' });
});
