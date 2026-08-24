import Foundation

struct MacroRunResult: Identifiable {
    let id = UUID()
    let argsLine: String
    let output: String
    let isError: Bool
}

/// Выполняет шаги макроса и резолвит переменные вида `${NAME}` в их строках
/// аргументов — общий движок, используется и из UI (MacroView), и из
/// автозапуска по подключению устройства (DevicesViewModel), поэтому логика
/// живёт в одном месте, а не только внутри View.
enum MacroRunner {
    private static let variablePattern = try? NSRegularExpression(pattern: "\\$\\{([A-Za-z0-9_]+)\\}")

    /// Имена переменных, встречающихся в шагах макроса, в порядке первого появления, без повторов.
    static func variableNames(in macro: Macro) -> [String] {
        var seen: [String] = []
        for step in macro.steps {
            for name in matches(in: step.argsLine) where !seen.contains(name) {
                seen.append(name)
            }
        }
        return seen
    }

    private static func matches(in line: String) -> [String] {
        guard let variablePattern else { return [] }
        let range = NSRange(line.startIndex..., in: line)
        return variablePattern.matches(in: line, range: range).compactMap { match in
            guard match.numberOfRanges > 1, let r = Range(match.range(at: 1), in: line) else { return nil }
            return String(line[r])
        }
    }

    /// Подставляет значения переменных в строку аргументов. Переменная без
    /// значения в словаре остаётся как есть (`${NAME}`) — так ошибка видна
    /// в выводе команды, а не проглатывается молча.
    static func resolve(_ argsLine: String, variables: [String: String]) -> String {
        var result = argsLine
        for (name, value) in variables {
            result = result.replacingOccurrences(of: "${\(name)}", with: value)
        }
        return result
    }

    /// Выполняет шаги по очереди, вызывая `onStep` после каждого. Если у макроса
    /// включён `abortOnFirstFailure`, останавливается на первом же шаге с ошибкой.
    @discardableResult
    static func run(
        _ macro: Macro,
        serial: String,
        service: ADBService,
        variables: [String: String],
        onStep: @escaping (MacroRunResult) -> Void
    ) async -> Bool {
        for step in macro.steps {
            let resolvedLine = resolve(step.argsLine, variables: variables)
            let tokens = resolvedLine.split(separator: " ").map(String.init)
            guard !tokens.isEmpty else { continue }
            do {
                let result = try await service.run(tokens, serial: serial)
                onStep(MacroRunResult(argsLine: resolvedLine, output: result.combined, isError: result.exitCode != 0))
                if result.exitCode != 0, macro.abortOnFirstFailure { return false }
            } catch {
                onStep(MacroRunResult(argsLine: resolvedLine, output: error.localizedDescription, isError: true))
                if macro.abortOnFirstFailure { return false }
            }
        }
        return true
    }
}
