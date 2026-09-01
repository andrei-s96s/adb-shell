import Testing
@testable import AdbShell

struct PortForwardParserTests {

    @Test func parsesForwardListLine() {
        let output = "emulator-5554 tcp:8000 tcp:9000\n"
        let rules = PortForwardParser.parseForwardList(output, serial: "emulator-5554")
        #expect(rules.count == 1)
        #expect(rules[0].direction == .forward)
        #expect(rules[0].hostSpec == "tcp:8000")
        #expect(rules[0].deviceSpec == "tcp:9000")
    }

    @Test func parsesReverseListLineWithSwappedColumns() {
        // adb reverse --list prints "<serial> <remote> <local>" -- remote
        // (device-side) first, local (host-side) second.
        let output = "emulator-5554 tcp:9000 tcp:8000\n"
        let rules = PortForwardParser.parseReverseList(output, serial: "emulator-5554")
        #expect(rules.count == 1)
        #expect(rules[0].direction == .reverse)
        #expect(rules[0].deviceSpec == "tcp:9000")
        #expect(rules[0].hostSpec == "tcp:8000")
    }

    @Test func ignoresLinesForOtherSerials() {
        let output = "other-device tcp:1 tcp:2\nemulator-5554 tcp:8000 tcp:9000\n"
        let rules = PortForwardParser.parseForwardList(output, serial: "emulator-5554")
        #expect(rules.count == 1)
        #expect(rules[0].hostSpec == "tcp:8000")
    }

    @Test func emptyOutputProducesEmptyList() {
        #expect(PortForwardParser.parseForwardList("", serial: "emulator-5554").isEmpty)
    }

    @Test func malformedLinesAreSkipped() {
        let output = "garbage line\nemulator-5554 tcp:8000 tcp:9000\n"
        let rules = PortForwardParser.parseForwardList(output, serial: "emulator-5554")
        #expect(rules.count == 1)
    }
}
