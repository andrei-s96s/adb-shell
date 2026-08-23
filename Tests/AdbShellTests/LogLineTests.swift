import Testing
@testable import AdbShell

struct LogLineTests {

    @Test func parsesThreadtimeFormat() {
        let raw = "08-23 23:10:15.123  1234  1234 D ActivityManager: Displayed com.example.app/.MainActivity"
        let line = LogLine.parse(raw)

        #expect(line?.timestamp == "08-23 23:10:15.123")
        #expect(line?.pid == "1234")
        #expect(line?.tid == "1234")
        #expect(line?.level == .debug)
        #expect(line?.tag == "ActivityManager")
        #expect(line?.message == "Displayed com.example.app/.MainActivity")
    }

    @Test func parsesErrorLevel() {
        let raw = "08-23 23:10:16.001  5555  5678 E AndroidRuntime: FATAL EXCEPTION: main"
        let line = LogLine.parse(raw)
        #expect(line?.level == .error)
        #expect(line?.tag == "AndroidRuntime")
    }

    @Test func levelOrderingForFiltering() {
        #expect(LogLevel.error > LogLevel.info)
        #expect(LogLevel.verbose < LogLevel.debug)
        #expect(LogLevel.fatal >= .error)
    }

    @Test func unparsableLineFallsBackToRawMessage() {
        let raw = "--------- beginning of main"
        let line = LogLine.parse(raw)
        #expect(line?.message == raw)
        #expect(line?.tag == nil)
        #expect(line?.level == .info)
    }

    @Test func emptyLineReturnsNil() {
        #expect(LogLine.parse("   ") == nil)
        #expect(LogLine.parse("") == nil)
    }

    @Test func messageWithColonInsideIsPreserved() {
        let raw = "08-23 23:10:17.500  100  100 I MyTag: key: value: more"
        let line = LogLine.parse(raw)
        #expect(line?.tag == "MyTag")
        #expect(line?.message == "key: value: more")
    }
}
