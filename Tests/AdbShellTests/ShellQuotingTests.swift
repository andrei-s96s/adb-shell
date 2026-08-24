import Testing
@testable import AdbShell

struct ShellQuotingTests {

    @Test func wrapsPlainTextInSingleQuotes() {
        #expect(ShellQuoting.singleQuoted("hello world") == "'hello world'")
    }

    @Test func escapesEmbeddedSingleQuotes() {
        #expect(ShellQuoting.singleQuoted("it's") == "'it'\\''s'")
    }

    @Test func emptyStringProducesEmptyQuotes() {
        #expect(ShellQuoting.singleQuoted("") == "''")
    }
}
