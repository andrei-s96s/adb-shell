import Testing
@testable import AdbShell

struct RemoteFileParserTests {

    @Test func parsesFilesAndDirectories() {
        let output = """
        total 24
        drwxrwx--x 4 root sdcard_rw 4096 2024-05-01 10:00 Download
        -rw-rw---- 1 root sdcard_rw 1024 2024-05-02 11:30 notes.txt
        """
        let entries = RemoteFileParser.parse(output: output, parentPath: "/sdcard")

        #expect(entries.count == 2)

        let dir = entries.first { $0.name == "Download" }
        #expect(dir?.isDirectory == true)
        #expect(dir?.path == "/sdcard/Download")

        let file = entries.first { $0.name == "notes.txt" }
        #expect(file?.isDirectory == false)
        #expect(file?.sizeBytes == 1024)
        #expect(file?.path == "/sdcard/notes.txt")
    }

    @Test func directoriesSortBeforeFilesAlphabetically() {
        let output = """
        -rw-rw---- 1 root root 10 2024-05-01 10:00 zzz.txt
        drwxrwx--x 4 root root 4096 2024-05-01 10:00 aaa_folder
        -rw-rw---- 1 root root 10 2024-05-01 10:00 bbb.txt
        """
        let entries = RemoteFileParser.parse(output: output, parentPath: "/sdcard")
        #expect(entries.map(\.name) == ["aaa_folder", "bbb.txt", "zzz.txt"])
    }

    @Test func skipsDotAndDotDotAndTotalLine() {
        let output = """
        total 8
        drwxr-xr-x 2 root root 4096 2024-05-01 10:00 .
        drwxr-xr-x 2 root root 4096 2024-05-01 10:00 ..
        -rw-r--r-- 1 root root  100 2024-05-01 10:00 file.txt
        """
        let entries = RemoteFileParser.parse(output: output, parentPath: "/sdcard")
        #expect(entries.map(\.name) == ["file.txt"])
    }

    @Test func symlinkTargetIsStrippedFromName() {
        let output = "lrwxrwxrwx 1 root root 12 2024-05-01 10:00 current -> /data/app/1"
        let entries = RemoteFileParser.parse(output: output, parentPath: "/data")
        #expect(entries.first?.name == "current")
        #expect(entries.first?.isSymlink == true)
    }

    @Test func garbageLinesAreIgnored() {
        let output = """
        ls: /root: Permission denied
        opendir failed, Permission denied
        """
        #expect(RemoteFileParser.parse(output: output, parentPath: "/root").isEmpty)
    }

    @Test func joinPathHandlesTrailingSlash() {
        #expect(RemoteFile.joinPath("/sdcard", "file.txt") == "/sdcard/file.txt")
        #expect(RemoteFile.joinPath("/sdcard/", "file.txt") == "/sdcard/file.txt")
        #expect(RemoteFile.joinPath("/", "file.txt") == "/file.txt")
    }
}
