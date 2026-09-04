// Порт Sources/AdbShell/Models/Macro.swift

export interface MacroStep {
  id: string;
  argsLine: string;
}

export interface Macro {
  id: string;
  name: string;
  steps: MacroStep[];
  /** Если true — макрос запускается автоматически, как только устройство
   * становится готовым (подключено и авторизовано). */
  autorunOnConnect: boolean;
  /** Если true — выполнение останавливается на первом же шаге, завершившемся
   * ошибкой, вместо того чтобы идти до конца. */
  abortOnFirstFailure: boolean;
}

export interface MacroRunResult {
  argsLine: string;
  output: string;
  isError: boolean;
}
