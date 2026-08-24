import Testing
@testable import AdbShell

struct UsageStatsParserTests {

    @Test func parsesDurationStringFormat() {
        let output = """
        package: com.example.app
          totalTimeUsed=+58m47s566ms
          lastTimeUsed=12345
        package: com.other.app
          totalTimeVisible=1h5m3s
        """
        let stats = UsageStatsParser.parse(output)
        #expect(stats.count == 2)
        #expect(stats[0].packageName == "com.example.app")
        #expect(stats[0].totalSeconds == 58 * 60 + 47)
        #expect(stats[1].packageName == "com.other.app")
        #expect(stats[1].totalSeconds == 3600 + 5 * 60 + 3)
    }

    @Test func parsesMillisecondNumberFormat() {
        let output = "package=com.x totalTime=123456"
        let stats = UsageStatsParser.parse(output)
        #expect(stats.count == 1)
        #expect(stats[0].totalSeconds == 123)
    }

    @Test func skipsZeroDurationEntries() {
        let output = """
        package: com.idle.app
          totalTimeUsed=0s
        """
        #expect(UsageStatsParser.parse(output).isEmpty)
    }

    @Test func garbageInputProducesEmptyList() {
        #expect(UsageStatsParser.parse("no useful data").isEmpty)
    }

    @Test func durationComponentParsingHandlesMillisecondsOnly() {
        // "ms" не матчится ни как минуты (m без s после), ни как секунды
        // (s не сразу после цифр) — значит компонентов нет, результат nil,
        // а не 0 (0 означало бы "распарсили и получили ноль секунд").
        #expect(UsageStatsParser.parseDurationToSeconds("566ms") == nil)
    }
}
