import Testing
@testable import AdbShell

struct MacroRunnerTests {

    @Test func extractsVariableNamesInOrderWithoutDuplicates() {
        let macro = Macro(name: "Test", steps: [
            MacroStep(argsLine: "connect ${IP}:${PORT}"),
            MacroStep(argsLine: "shell pm install ${IP}"),
        ])
        #expect(MacroRunner.variableNames(in: macro) == ["IP", "PORT"])
    }

    @Test func noVariablesReturnsEmpty() {
        let macro = Macro(name: "Test", steps: [MacroStep(argsLine: "root")])
        #expect(MacroRunner.variableNames(in: macro).isEmpty)
    }

    @Test func resolveSubstitutesKnownVariables() {
        let resolved = MacroRunner.resolve("connect ${IP}:${PORT}", variables: ["IP": "192.168.1.5", "PORT": "5555"])
        #expect(resolved == "connect 192.168.1.5:5555")
    }

    @Test func resolveLeavesUnknownVariablesUntouched() {
        let resolved = MacroRunner.resolve("shell echo ${MISSING}", variables: [:])
        #expect(resolved == "shell echo ${MISSING}")
    }
}
