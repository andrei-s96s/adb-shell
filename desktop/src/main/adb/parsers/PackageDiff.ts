// Порт Sources/AdbShell/Services/PackageDiff.swift — сравнение списков
// установленных пакетов двух устройств, только по именам пакетов (версии не
// сравниваются: это потребовало бы отдельного dumpsys package на каждый
// пакет на каждом устройстве, что для пары сотен приложений было бы
// неприемлемо медленно).

export interface PackageDiffResult {
  onlyInA: string[];
  onlyInB: string[];
  commonCount: number;
}

export function comparePackages(a: string[], b: string[]): PackageDiffResult {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyInA = [...setA].filter((pkg) => !setB.has(pkg)).sort();
  const onlyInB = [...setB].filter((pkg) => !setA.has(pkg)).sort();
  const commonCount = [...setA].filter((pkg) => setB.has(pkg)).length;
  return { onlyInA, onlyInB, commonCount };
}
