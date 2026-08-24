import Testing
@testable import AdbShell

struct NetworkUsageParserTests {

    @Test func sumsBytesWithinTargetUidBlock() {
        let output = """
        ident=[{...uid=10001, set=DEFAULT, tag=0x0}]
          NetworkStatsHistory: bucketDuration=3600000
          st=1 rb=1000 rp=5 tb=2000 tp=3 op=0
          st=2 rb=1500 rp=6 tb=2500 tp=4 op=0
        ident=[{...uid=10002, set=DEFAULT, tag=0x0}]
          st=3 rb=999999 tb=999999
        """
        let usage = NetworkUsageParser.parse(output: output, uid: 10001)
        #expect(usage.rxBytes == 2500)
        #expect(usage.txBytes == 4500)
    }

    @Test func supportsLongFieldNames() {
        let output = """
        uid=555
        rxBytes=100 txBytes=200
        rxBytes=50 txBytes=25
        """
        let usage = NetworkUsageParser.parse(output: output, uid: 555)
        #expect(usage.rxBytes == 150)
        #expect(usage.txBytes == 225)
    }

    @Test func zeroWhenUidNotPresent() {
        let output = "uid=1 rb=10 tb=10"
        let usage = NetworkUsageParser.parse(output: output, uid: 999)
        #expect(usage.rxBytes == 0)
        #expect(usage.txBytes == 0)
    }
}
