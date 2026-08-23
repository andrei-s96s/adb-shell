import Testing
@testable import AdbShell

@MainActor
struct AppsViewModelTests {

    private func makeVM(_ apps: [InstalledApp]) -> AppsViewModel {
        let vm = AppsViewModel(service: ADBService())
        vm.apps = apps
        return vm
    }

    @Test func systemAppsHiddenByDefault() {
        let vm = makeVM([
            InstalledApp(packageName: "com.example.user", isSystem: false, isEnabled: true),
            InstalledApp(packageName: "com.android.settings", isSystem: true, isEnabled: true)
        ])
        vm.showSystemApps = false
        #expect(vm.filteredApps.map(\.packageName) == ["com.example.user"])
    }

    @Test func systemAppsShownWhenToggled() {
        let vm = makeVM([
            InstalledApp(packageName: "com.example.user", isSystem: false, isEnabled: true),
            InstalledApp(packageName: "com.android.settings", isSystem: true, isEnabled: true)
        ])
        vm.showSystemApps = true
        #expect(vm.filteredApps.count == 2)
    }

    @Test func searchTextFiltersCaseInsensitively() {
        let vm = makeVM([
            InstalledApp(packageName: "com.example.Music", isSystem: false, isEnabled: true),
            InstalledApp(packageName: "com.example.Video", isSystem: false, isEnabled: true)
        ])
        vm.searchText = "music"
        #expect(vm.filteredApps.map(\.packageName) == ["com.example.Music"])
    }

    @Test func resetClearsStateIncludingSelection() {
        let vm = makeVM([InstalledApp(packageName: "com.example.app", isSystem: false, isEnabled: true)])
        vm.selectedPackage = "com.example.app"
        vm.isSelectionMode = true
        vm.selectedForBatch = ["com.example.app"]
        vm.reset()
        #expect(vm.apps.isEmpty)
        #expect(vm.selectedPackage == nil)
        #expect(vm.isSelectionMode == false)
        #expect(vm.selectedForBatch.isEmpty)
    }

    @Test func toggleSelectionModeClearsBatchSelectionWhenTurnedOff() {
        let vm = makeVM([])
        vm.isSelectionMode = true
        vm.selectedForBatch = ["com.example.app"]
        vm.toggleSelectionMode()
        #expect(vm.isSelectionMode == false)
        #expect(vm.selectedForBatch.isEmpty)
    }

    @Test func toggleSelectionAddsAndRemoves() {
        let vm = makeVM([])
        vm.toggleSelection("com.example.app")
        #expect(vm.selectedForBatch.contains("com.example.app"))
        vm.toggleSelection("com.example.app")
        #expect(!vm.selectedForBatch.contains("com.example.app"))
    }
}
