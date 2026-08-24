import Testing
import Foundation
@testable import AdbShell

struct FDroidUpdateCheckerTests {

    // Реальный формат ответа https://f-droid.org/api/v1/packages/<pkg> —
    // suggestedVersionCode приходит ЧИСЛОМ, не строкой (сюда уже попадал баг:
    // модель была объявлена как String? и молча не декодировалась вовсе).
    private let realSampleJSON = """
    {"packageName":"org.fdroid.fdroid","suggestedVersionCode":1023052,"packages":[\
    {"versionName":"2.0-rc1","versionCode":2000041},\
    {"versionName":"1.23.2","versionCode":1023052}]}
    """

    @Test func parsesRealResponseShapeAndDetectsUpdate() {
        let data = Data(realSampleJSON.utf8)
        let update = FDroidUpdateChecker.parse(data: data, installedVersionCode: 1000000)
        #expect(update?.packageName == "org.fdroid.fdroid")
        #expect(update?.latestVersionCode == 2000041, "берём максимум по всем сборкам, а не только suggestedVersionCode")
        #expect(update?.latestVersionName == "2.0-rc1")
    }

    @Test func upToDateInstalledVersionProducesNoUpdate() {
        let data = Data(realSampleJSON.utf8)
        let update = FDroidUpdateChecker.parse(data: data, installedVersionCode: 2000041)
        #expect(update == nil)
    }

    @Test func malformedJSONProducesNil() {
        let data = Data("not json".utf8)
        #expect(FDroidUpdateChecker.parse(data: data, installedVersionCode: 1) == nil)
    }

    @Test func missingPackagesArrayStillUsesSuggestedVersionCode() {
        let data = Data("""
        {"packageName":"com.example.app","suggestedVersionCode":50,"packages":null}
        """.utf8)
        let update = FDroidUpdateChecker.parse(data: data, installedVersionCode: 10)
        #expect(update?.latestVersionCode == 50)
    }

    @Test func downloadURLFollowsFDroidRepoConvention() {
        let info = FDroidUpdateInfo(packageName: "org.fdroid.fdroid", installedVersionCode: 1, latestVersionCode: 1023052, latestVersionName: "1.23.2")
        #expect(info.downloadURL.absoluteString == "https://f-droid.org/repo/org.fdroid.fdroid_1023052.apk")
    }
}
