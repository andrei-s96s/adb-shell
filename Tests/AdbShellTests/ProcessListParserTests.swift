import Testing
@testable import AdbShell

struct ProcessListParserTests {

    @Test func parsesProcessRows() {
        let output = """
        PID   PPID  USER     RSS NAME
        1     0     root     1200 init
        1234  1     u0_a123  54000 com.example.app
        """
        let processes = ProcessListParser.parse(output)
        #expect(processes.count == 2)
        #expect(processes[1].pid == 1234)
        #expect(processes[1].ppid == 1)
        #expect(processes[1].user == "u0_a123")
        #expect(processes[1].rssKB == 54000)
        #expect(processes[1].name == "com.example.app")
    }

    @Test func skipsMalformedLines() {
        let output = "not a process line\nPID PPID USER RSS NAME"
        #expect(ProcessListParser.parse(output).isEmpty)
    }

    @Test func emptyOutputProducesEmptyList() {
        #expect(ProcessListParser.parse("").isEmpty)
    }
}
