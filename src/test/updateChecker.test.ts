import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, findLatestRelease } from '../main/updateChecker';
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
