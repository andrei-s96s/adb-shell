import Testing
import AppKit
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
        vm.selectedForBatch = ["com.example.app"]
        vm.lastClickedPackage = "com.example.app"
        vm.reset()
        #expect(vm.apps.isEmpty)
        #expect(vm.focusedPackage == nil)
        #expect(vm.selectedForBatch.isEmpty)
    }

    // MARK: - Мультивыбор в духе Finder (⌘/⇧-клик)

    @Test func plainClickReplacesSelectionWithSingleItem() {
        let vm = makeVM([
            InstalledApp(packageName: "com.a", isSystem: false, isEnabled: true),
            InstalledApp(packageName: "com.b", isSystem: false, isEnabled: true)
        ])
        vm.handleRowClick("com.a", modifiers: [])
        vm.handleRowClick("com.b", modifiers: [])
        #expect(vm.selectedForBatch == ["com.b"])
        #expect(vm.focusedPackage == "com.b")
    }

    @Test func commandClickTogglesMembershipWithoutClearingOthers() {
        let vm = makeVM([
            InstalledApp(packageName: "com.a", isSystem: false, isEnabled: true),
            InstalledApp(packageName: "com.b", isSystem: false, isEnabled: true)
        ])
        vm.handleRowClick("com.a", modifiers: [])
        vm.handleRowClick("com.b", modifiers: .command)
        #expect(vm.selectedForBatch == ["com.a", "com.b"])
        #expect(vm.focusedPackage == nil, "при двух выбранных детали не показываем")

        vm.handleRowClick("com.a", modifiers: .command)
        #expect(vm.selectedForBatch == ["com.b"])
    }

    @Test func shiftClickSelectsRangeFromLastClick() {
        let apps = ["com.a", "com.b", "com.c", "com.d"].map { InstalledApp(packageName: $0, isSystem: false, isEnabled: true) }
        let vm = makeVM(apps)
        vm.handleRowClick("com.a", modifiers: [])
        vm.handleRowClick("com.d", modifiers: .shift)
        #expect(vm.selectedForBatch == ["com.a", "com.b", "com.c", "com.d"])
    }

    @Test func shiftClickWithoutPriorAnchorFallsBackToSingleSelect() {
        let vm = makeVM([InstalledApp(packageName: "com.a", isSystem: false, isEnabled: true)])
        vm.handleRowClick("com.a", modifiers: .shift)
        #expect(vm.selectedForBatch == ["com.a"])
    }

    @Test func clearSelectionEmptiesSetAndAnchor() {
        let vm = makeVM([InstalledApp(packageName: "com.a", isSystem: false, isEnabled: true)])
        vm.handleRowClick("com.a", modifiers: [])
        vm.clearSelection()
        #expect(vm.selectedForBatch.isEmpty)
        #expect(vm.lastClickedPackage == nil)
    }

    @Test func focusedPackageOnlySetWhenExactlyOneSelected() {
        let vm = makeVM([InstalledApp(packageName: "com.a", isSystem: false, isEnabled: true)])
        #expect(vm.focusedPackage == nil)
        vm.handleRowClick("com.a", modifiers: [])
        #expect(vm.focusedPackage == "com.a")
    }
}
