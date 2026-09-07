// Ограниченный по параллелизму map -- запускает fn(item, index) не более
// чем на `limit` элементах одновременно (порядок результатов соответствует
// порядку items, не порядку завершения). Тот же паттерн (index + while +
// N воркеров через Promise.all) раньше был продублирован дословно в
// ApkLibraryService.checkFDroidUpdates() и в apps:checkFDroidUpdates --
// комментарий во втором честно признавал дублирование, но не устранял его.
//
// fn сам отвечает за то, ловить ли собственные ошибки (как уже делают оба
// вызывающих места ниже, "одна неудача не должна прерывать остальные") --
// mapWithConcurrency их не глотает и не оборачивает: если fn бросает,
// проброс наружу ведёт себя как обычный Promise.all.
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  };
  const workerCount = Math.max(0, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
