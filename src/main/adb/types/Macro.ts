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
  /** Глобальный хоткей (формат Electron Accelerator, например
   * "CommandOrControl+Alt+M") -- запускает макрос на устройстве из
   * hotkeySelectedSerial (main.ts, то же значение, что уже использует
   * хоткей тихого скриншота), даже когда окно не в фокусе. Макросы с
   * переменными ${ИМЯ} хоткеем не запускаются -- негде спросить их
   * значения без открытого окна. undefined/пусто — хоткей не назначен. */
  hotkeyAccelerator?: string;
  /** Пользовательские метки для группировки/фильтра макросов в списке --
   * тот же принцип, что и ApkTagStore для библиотеки APK, но живёт прямо на
   * самом макросе, а не в отдельном хранилище "путь -> теги": у макроса,
   * в отличие от файла на диске, и так уже есть стабильный id и полноценная
   * запись в MacroStore. undefined/пустой массив — тегов нет. */
  tags?: string[];
}

export interface MacroRunResult {
  argsLine: string;
  output: string;
  isError: boolean;
}
