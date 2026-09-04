// Порт struct ProcessResult из Sources/AdbShell/Services/ADBService.swift

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function combinedOutput(result: ProcessResult): string {
  return [result.stdout, result.stderr].filter((s) => s.length > 0).join('\n');
}
