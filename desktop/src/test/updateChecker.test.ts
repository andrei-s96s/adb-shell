import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, findLatestDesktopRelease } from '../main/updateChecker';
import type { GitHubReleaseRaw } from '../main/updateChecker';

test('compareVersions orders numerically, not lexicographically', () => {
  assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
  assert.ok(compareVersions('1.2.0', '1.10.0') < 0);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
});

test('compareVersions treats missing components as zero', () => {
  assert.ok(compareVersions('1.2', '1.2.0') === 0);
  assert.ok(compareVersions('1.2.1', '1.2') > 0);
});

test('findLatestDesktopRelease picks the first desktop-v tag, ignoring the swift v* track', () => {
  const releases: GitHubReleaseRaw[] = [
    { tag_name: 'v2.6.0', html_url: 'https://example.com/v2.6.0' },
    { tag_name: 'desktop-v1.0.0', html_url: 'https://example.com/desktop-v1.0.0' },
    { tag_name: 'v2.5.0', html_url: 'https://example.com/v2.5.0' },
    { tag_name: 'desktop-v0.4.0', html_url: 'https://example.com/desktop-v0.4.0' },
  ];
  const latest = findLatestDesktopRelease(releases);
  assert.equal(latest?.version, '1.0.0');
  assert.equal(latest?.releaseUrl, 'https://example.com/desktop-v1.0.0');
});

test('findLatestDesktopRelease skips drafts and prereleases', () => {
  const releases: GitHubReleaseRaw[] = [
    { tag_name: 'desktop-v2.0.0', html_url: 'x', draft: true },
    { tag_name: 'desktop-v1.5.0', html_url: 'x', prerelease: true },
    { tag_name: 'desktop-v1.0.0', html_url: 'https://example.com/1.0.0' },
  ];
  const latest = findLatestDesktopRelease(releases);
  assert.equal(latest?.version, '1.0.0');
});

test('findLatestDesktopRelease returns undefined when no desktop-v release exists', () => {
  const releases: GitHubReleaseRaw[] = [{ tag_name: 'v2.6.0', html_url: 'x' }];
  assert.equal(findLatestDesktopRelease(releases), undefined);
});
