import Testing
@testable import AdbShell

struct PackageDiffTests {

    @Test func findsOnlyInEachSide() {
        let result = PackageDiff.compare(
            a: ["com.a", "com.common", "com.x"],
            b: ["com.b", "com.common"]
        )
        #expect(result.onlyInA == ["com.a", "com.x"])
        #expect(result.onlyInB == ["com.b"])
        #expect(result.commonCount == 1)
    }

    @Test func identicalListsProduceNoDiff() {
        let result = PackageDiff.compare(a: ["com.a", "com.b"], b: ["com.b", "com.a"])
        #expect(result.onlyInA.isEmpty)
        #expect(result.onlyInB.isEmpty)
        #expect(result.commonCount == 2)
    }

    @Test func emptyListsProduceEmptyDiff() {
        let result = PackageDiff.compare(a: [], b: [])
        #expect(result.onlyInA.isEmpty)
        #expect(result.onlyInB.isEmpty)
        #expect(result.commonCount == 0)
    }
}
