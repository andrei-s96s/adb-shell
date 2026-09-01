import Testing
@testable import AdbShell

struct GetpropParserTests {

    @Test func parsesSimpleKeyValueLines() {
        let output = """
        [ro.build.version.release]: [14]
        [ro.product.model]: [Pixel 7]
        """
        let props = GetpropParser.parse(output)
        #expect(props.count == 2)
        #expect(props.contains { $0.key == "ro.build.version.release" && $0.value == "14" })
        #expect(props.contains { $0.key == "ro.product.model" && $0.value == "Pixel 7" })
    }

    @Test func handlesEmptyValueBrackets() {
        let output = "[persist.sys.locale]: []"
        let props = GetpropParser.parse(output)
        #expect(props.count == 1)
        #expect(props[0].value == "")
    }

    @Test func resultIsSortedByKey() {
        let output = """
        [zzz.last]: [1]
        [aaa.first]: [2]
        """
        let props = GetpropParser.parse(output)
        #expect(props.map(\.key) == ["aaa.first", "zzz.last"])
    }

    @Test func skipsMalformedLines() {
        let output = """
        this is not a property line
        [valid.key]: [value]
        """
        let props = GetpropParser.parse(output)
        #expect(props.count == 1)
        #expect(props[0].key == "valid.key")
    }

    @Test func emptyOutputProducesEmptyList() {
        #expect(GetpropParser.parse("").isEmpty)
    }
}
