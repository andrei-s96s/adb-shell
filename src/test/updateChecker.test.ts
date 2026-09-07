import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, findLatestRelease, pickAssetForPlatform, findChecksumAsset } from '../main/updateChecker';
import type { GitHubReleaseRaw, ReleaseAsset } from '../main/updateChecker';

test('compareVersions orders numerically, not lexicographically', () => {
  assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
  assert.ok(compareVersions('1.2.0', '1.10.0') < 0);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
});

test('compareVersions treats missing components as zero', () => {
  assert.ok(compareVersions('1.2', '1.2.0') === 0);
  assert.ok(compareVersions('1.2.1', '1.2') > 0);
});

test('findLatestRelease picks the highest version, not just the first in the list', () => {
  const releases: GitHubReleaseRaw[] = [
    { tag_name: 'v1.0.0', html_url: 'https://example.com/v1.0.0' },
    { tag_name: 'v1.2.0', html_url: 'https://example.com/v1.2.0' },
    { tag_name: 'v1.1.0', html_url: 'https://example.com/v1.1.0' },
  ];
  const latest = findLatestRelease(releases);
  assert.equal(latest?.version, '1.2.0');
  assert.equal(latest?.releaseUrl, 'https://example.com/v1.2.0');
});

test('findLatestRelease skips drafts and prereleases', () => {
  const releases: GitHubReleaseRaw[] = [
    { tag_name: 'v2.0.0', html_url: 'x', draft: true },
    { tag_name: 'v1.5.0', html_url: 'x', prerelease: true },
    { tag_name: 'v1.0.0', html_url: 'https://example.com/1.0.0' },
  ];
  const latest = findLatestRelease(releases);
  assert.equal(latest?.version, '1.0.0');
});

test('findLatestRelease ignores tags without the v prefix', () => {
  const releases: GitHubReleaseRaw[] = [{ tag_name: 'not-a-version', html_url: 'x' }];
  assert.equal(findLatestRelease(releases), undefined);
});

test('findLatestRelease returns undefined for an empty release list', () => {
  assert.equal(findLatestRelease([]), undefined);
});

test('findLatestRelease carries the release assets through, mapped to name/url', () => {
  const releases: GitHubReleaseRaw[] = [
    {
      tag_name: 'v1.3.0',
      html_url: 'https://example.com/v1.3.0',
      assets: [
        { name: 'ADB Shell Setup 1.3.0.exe', browser_download_url: 'https://example.com/win.exe' },
        { name: 'ADB Shell-1.3.0-universal-mac.zip', browser_download_url: 'https://example.com/mac.zip' },
      ],
    },
  ];
  const latest = findLatestRelease(releases);
  assert.equal(latest?.assets.length, 2);
  assert.deepEqual(latest?.assets[0], { name: 'ADB Shell Setup 1.3.0.exe', url: 'https://example.com/win.exe' });
});

test('findLatestRelease defaults assets to an empty array when the release has none', () => {
  const releases: GitHubReleaseRaw[] = [{ tag_name: 'v1.0.0', html_url: 'x' }];
  assert.deepEqual(findLatestRelease(releases)?.assets, []);
});

test('pickAssetForPlatform picks the .exe on win32, .AppImage on linux', () => {
  const assets: ReleaseAsset[] = [
    { name: 'ADB Shell Setup 1.3.0.exe', url: 'win' },
    { name: 'ADB-Shell-1.3.0.AppImage', url: 'linux' },
  ];
  assert.equal(pickAssetForPlatform(assets, 'win32', 'x64')?.url, 'win');
  assert.equal(pickAssetForPlatform(assets, 'linux', 'x64')?.url, 'linux');
});

test('pickAssetForPlatform on darwin picks the zip matching the running Mac\'s own architecture', () => {
  const assets: ReleaseAsset[] = [
    { name: 'ADB Shell-1.6.0-x64-mac.zip', url: 'mac-x64' },
    { name: 'ADB Shell-1.6.0-arm64-mac.zip', url: 'mac-arm64' },
  ];
  assert.equal(pickAssetForPlatform(assets, 'darwin', 'x64')?.url, 'mac-x64');
  assert.equal(pickAssetForPlatform(assets, 'darwin', 'arm64')?.url, 'mac-arm64');
  // Архитектуры, которых у Node/Electron на Mac не бывает (ia32 и т.п.) --
  // трактуются как x64, тот же практический дефолт, что и раньше был у
  // единственного universal-архива.
  assert.equal(pickAssetForPlatform(assets, 'darwin', 'ia32')?.url, 'mac-x64');
});

test('pickAssetForPlatform returns undefined when no asset matches the platform', () => {
  const assets: ReleaseAsset[] = [{ name: 'ADB Shell Setup 1.3.0.exe', url: 'win' }];
  assert.equal(pickAssetForPlatform(assets, 'darwin', 'arm64'), undefined);
});

test('pickAssetForPlatform returns undefined for an unsupported platform', () => {
  const assets: ReleaseAsset[] = [{ name: 'ADB Shell Setup 1.3.0.exe', url: 'win' }];
  assert.equal(pickAssetForPlatform(assets, 'freebsd', 'x64'), undefined);
});

test('findChecksumAsset finds the <name>.sha256 companion asset for a given file', () => {
  const assets: ReleaseAsset[] = [
    { name: 'ADB Shell Setup 1.3.0.exe', url: 'win' },
    { name: 'ADB Shell Setup 1.3.0.exe.sha256', url: 'win-sum' },
    { name: 'ADB-Shell-1.3.0.AppImage', url: 'linux' },
  ];
  assert.equal(findChecksumAsset(assets, 'ADB Shell Setup 1.3.0.exe')?.url, 'win-sum');
});

test('findChecksumAsset returns undefined for an older release published without checksums', () => {
  const assets: ReleaseAsset[] = [{ name: 'ADB Shell Setup 1.3.0.exe', url: 'win' }];
  assert.equal(findChecksumAsset(assets, 'ADB Shell Setup 1.3.0.exe'), undefined);
});
