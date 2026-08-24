import Testing
@testable import AdbShell

struct ApkBadgingParserTests {

    @Test func parsesTypicalBadgingOutput() {
        let output = """
        package: name='com.example.app' versionCode='42' versionName='1.2.3' compileSdkVersion='34'
        sdkVersion:'21'
        targetSdkVersion:'33'
        uses-permission: name='android.permission.INTERNET'
        uses-permission: name='android.permission.CAMERA'
        application-label:'Example App'
        application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
        launchable-activity: name='com.example.app.MainActivity'  label='' icon=''
        """

        let info = ApkBadgingParser.parse(output)

        #expect(info.packageName == "com.example.app")
        #expect(info.versionCode == "42")
        #expect(info.versionName == "1.2.3")
        #expect(info.minSdk == "21")
        #expect(info.targetSdk == "33")
        #expect(info.applicationLabel == "Example App")
        #expect(info.permissions == ["android.permission.INTERNET", "android.permission.CAMERA"])
    }

    @Test func missingFieldsStayNil() {
        let info = ApkBadgingParser.parse("garbage output")
        #expect(info.packageName == nil)
        #expect(info.permissions.isEmpty)
    }
}
