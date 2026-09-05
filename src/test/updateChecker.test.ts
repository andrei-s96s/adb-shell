import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, findLatestRelease, pickAssetForPlatform } from '../main/updateChecker';
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

test('pickAssetForPlatform picks the .exe on win32, .zip on darwin, .AppImage on linux', () => {
  const assets: ReleaseAsset[] = [
    { name: 'ADB Shell Setup 1.3.0.exe', url: 'win' },
    { name: 'ADB Shell-1.3.0-universal-mac.zip', url: 'mac' },
    { name: 'ADB-Shell-1.3.0.AppImage', url: 'linux' },
  ];
  assert.equal(pickAssetForPlatform(assets, 'win32')?.url, 'win');
  assert.equal(pickAssetForPlatform(assets, 'darwin')?.url, 'mac');
  assert.equal(pickAssetForPlatform(assets, 'linux')?.url, 'linux');
});

test('pickAssetForPlatform returns undefined when no asset matches the platform', () => {
  const assets: ReleaseAsset[] = [{ name: 'ADB Shell Setup 1.3.0.exe', url: 'win' }];
  assert.equal(pickAssetForPlatform(assets, 'darwin'), undefined);
});

test('pickAssetForPlatform returns undefined for an unsupported platform', () => {
  const assets: ReleaseAsset[] = [{ name: 'ADB Shell Setup 1.3.0.exe', url: 'win' }];
  assert.equal(pickAssetForPlatform(assets, 'freebsd'), undefined);
});
