import Testing
@testable import AdbShell

struct UpdateServiceTests {

    @Test func newerPatchVersion() {
        #expect(UpdateService.isNewer("1.0.1", than: "1.0.0"))
        #expect(!UpdateService.isNewer("1.0.0", than: "1.0.1"))
    }

    @Test func newerMinorAndMajor() {
        #expect(UpdateService.isNewer("1.1.0", than: "1.0.9"))
        #expect(UpdateService.isNewer("2.0.0", than: "1.9.9"))
    }

    @Test func equalVersionsAreNotNewer() {
        #expect(!UpdateService.isNewer("1.0.0", than: "1.0.0"))
    }

    @Test func differentComponentCounts() {
        #expect(UpdateService.isNewer("1.2", than: "1.1.9"))
        #expect(!UpdateService.isNewer("1.2", than: "1.2.1"))
        #expect(UpdateService.isNewer("1.2.0.1", than: "1.2.0"))
    }

    @Test func nonNumericSuffixIsIgnoredGracefully() {
        // tag_name вида "1.0.0-beta" — не должно падать, "beta" просто отбрасывается фильтром цифр
        #expect(!UpdateService.isNewer("1.0.0-beta", than: "1.0.0"))
    }
}
