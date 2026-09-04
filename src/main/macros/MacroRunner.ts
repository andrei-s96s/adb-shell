// Порт MacroRunner.run(...) из Sources/AdbShell/Services/MacroRunner.swift —
// выполняет шаги макроса по очереди, вызывая onStep после каждого. Общий
// движок: используется и запуском из вкладки "Макросы" (main.ts,
// macros:run), и автозапуском по подключению устройства
// (renderer.ts triggerAutorunMacros -> macros:run с variables: {}).
//
// В отличие от Swift-версии, результаты шагов здесь не транслируются в
// renderer по мере выполнения (не через push-события, как логкат) — весь
// список результатов возвращается одним ответом, когда макрос закончил
// работу целиком. Для типичных макросов (несколько adb-команд) это не
// заметно; сознательное упрощение, чтобы не городить run-id/событийную
// корреляцию ради этой волны.

import { AdbService } from '../adb/AdbService';
import { combinedOutput } from '../adb/types/ProcessResult';
import { Macro, MacroRunResult } from '../adb/types/Macro';
import { resolveVariables } from './macroRunnerLogic';

export interface MacroRunOutcome {
  completedFully: boolean;
  results: MacroRunResult[];
}

export async function runMacro(
  macro: Macro,
  serial: string,
  service: AdbService,
  variables: Record<string, string>
): Promise<MacroRunOutcome> {
  const results: MacroRunResult[] = [];
  for (const step of macro.steps) {
    const resolvedLine = resolveVariables(step.argsLine, variables);
    const tokens = resolvedLine.split(' ').filter((t) => t.length > 0);
    if (tokens.length === 0) continue;
    try {
      const result = await service.run(tokens, { serial });
      const isError = result.exitCode !== 0;
      results.push({ argsLine: resolvedLine, output: combinedOutput(result), isError });
      if (isError && macro.abortOnFirstFailure) return { completedFully: false, results };
    } catch (error) {
      results.push({ argsLine: resolvedLine, output: (error as Error).message, isError: true });
      if (macro.abortOnFirstFailure) return { completedFully: false, results };
    }
  }
  return { completedFully: true, results };
}
