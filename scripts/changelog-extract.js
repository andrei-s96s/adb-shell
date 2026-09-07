// Извлекает секцию конкретной версии из CHANGELOG.md -- используется
// release.yml, чтобы тело GitHub-релиза было курируемым текстом из
// CHANGELOG.md, а не автосгенерированным списком коммитов
// (generate_release_notes: true), который ничего не объясняет о том, ЗАЧЕМ
// что-то изменилось, и не отличает пользовательские изменения от
// внутреннего рефакторинга.
//
// Явно падает, если версии в файле нет -- отсутствующая запись в
// CHANGELOG.md перед тегом релиза это ошибка процесса (кто-то забыл
// перенести [Unreleased] в версионную секцию), а не повод молча отдать
// пустое тело релиза.
const fs = require('node:fs');
const path = require('node:path');

function main() {
  const version = process.argv[2];
  if (!version) {
    throw new Error('Использование: node changelog-extract.js <версия, например 1.6.0>');
  }

  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  const lines = fs.readFileSync(changelogPath, 'utf8').split('\n');

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRe = new RegExp(`^##\\s*\\[${escapedVersion}\\]`);
  const startIndex = lines.findIndex((line) => headerRe.test(line));
  if (startIndex === -1) {
    throw new Error(`В CHANGELOG.md нет секции для версии ${version} -- добавьте её перед тегом релиза.`);
  }

  let endIndex = lines.findIndex((line, i) => i > startIndex && /^##\s*\[/.test(line));
  if (endIndex === -1) endIndex = lines.length;

  const section = lines
    .slice(startIndex + 1, endIndex)
    .join('\n')
    .trim();
  if (section.length === 0) {
    throw new Error(`Секция версии ${version} в CHANGELOG.md пустая -- нечего публиковать как заметки к релизу.`);
  }
  process.stdout.write(section + '\n');
}

main();
