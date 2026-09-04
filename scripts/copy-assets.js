// Копирует статику рендерера (HTML/CSS), которую tsc не трогает, рядом со
// скомпилированным renderer.js — index.html ссылается на них относительными
// путями, поэтому раскладка внутри dist/renderer должна зеркалить src/renderer.
const fs = require('node:fs');
const path = require('node:path');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const root = path.join(__dirname, '..');
copyRecursive(path.join(root, 'src/renderer/index.html'), path.join(root, 'dist/renderer/index.html'));
copyRecursive(path.join(root, 'src/renderer/error-handler.js'), path.join(root, 'dist/renderer/error-handler.js'));
copyRecursive(path.join(root, 'src/renderer/styles'), path.join(root, 'dist/renderer/styles'));
console.log('Скопированы статические файлы рендерера в dist/renderer');
