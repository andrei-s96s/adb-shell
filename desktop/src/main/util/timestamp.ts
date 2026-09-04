// Формат имени файла yyyy-MM-dd-HHmmss, используемый и оригинальной
// Swift-версией (screenshot/CSV/zip экспорты) — единое место, чтобы не
// разъезжались форматы дат между экспортами.

export function timestampForFilename(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
