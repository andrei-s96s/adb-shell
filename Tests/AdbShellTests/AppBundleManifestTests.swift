import Testing
import Foundation
@testable import AdbShell

struct AppBundleManifestTests {

    @Test func encodesAndDecodesRoundTrip() throws {
        let manifest = AppBundleManifest(
            exportedAt: Date(timeIntervalSince1970: 1_700_000_000),
            sourceDeviceModel: "Pixel_7",
            entries: [
                AppBundleManifest.Entry(
                    packageName: "com.example.app",
                    apkFileName: "com.example.app.apk",
                    versionName: "2.1.0",
                    permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"]
                ),
                AppBundleManifest.Entry(
                    packageName: "com.example.noperms",
                    apkFileName: "com.example.noperms.apk",
                    versionName: nil,
                    permissions: []
                )
            ]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(manifest)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(AppBundleManifest.self, from: data)

        #expect(decoded.sourceDeviceModel == "Pixel_7")
        #expect(decoded.entries.count == 2)
        #expect(decoded.entries[0].packageName == "com.example.app")
        #expect(decoded.entries[0].permissions == ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"])
        #expect(decoded.entries[1].versionName == nil)
        #expect(decoded.entries[1].permissions.isEmpty)
    }

    @Test func constantsMatchExpectedLayout() {
        #expect(AppBundleManifest.manifestFileName == "manifest.json")
        #expect(AppBundleManifest.apksSubdirectory == "apks")
    }
}
