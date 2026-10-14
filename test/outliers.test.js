import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creatorSize, scorePosts, searchOutliers } from '../src/outliers.js';

const NOW = '2026-10-14T00:00:00Z';

function creatorPosts(handle, views, { niches = ['motivation'], hookText = 'hook', platform = 'tiktok' } = {}) {
  return views.map((v, i) => ({
    postKey: `${platform}:${handle}-${i}`,
    platform,
    creatorKey: `${platform}:${handle}`,
    handle,
    followers: 50_000,
    caption: '',
    hookText,
    hookType: 'spoken',
    format: 'talking_head',
    niches,
    postedAt: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 3_600_000).toISOString(),
    views: v,
    likes: 0,
    comments: 0,
    shares: 0,
  }));
}

test('outlier score divides views by the median of earlier posts', () => {
  const scored = scorePosts(creatorPosts('a', [100, 200, 300, 400, 500, 3000]));
  const last = scored.find((p) => p.postKey === 'tiktok:a-5');
  assert.equal(last.creatorRecentMedianViews, 300);
  assert.equal(last.creatorRecentMedianSampleSize, 5);
  assert.equal(last.outlierScore, 10);
  assert.equal(last.outlierScoreLabel, '10.0x');
});

test('posts without 5 earlier posts get no outlier score', () => {
  const scored = scorePosts(creatorPosts('a', [100, 200, 300, 400, 500]));
  assert.ok(scored.every((p) => p.outlierScore === null));
});

test('baseline uses at most the 12 most recent earlier posts', () => {
  const views = [...Array(12).fill(1_000_000), ...Array(12).fill(100), 1000];
  const last = scorePosts(creatorPosts('a', views)).find((p) => p.postKey === 'tiktok:a-24');
  assert.equal(last.creatorRecentMedianViews, 100);
  assert.equal(last.outlierScore, 10);
});

test('creator size bands', () => {
  assert.equal(creatorSize(9_999), 'nano');
  assert.equal(creatorSize(10_000), 'micro');
  assert.equal(creatorSize(2_000_000), 'mega');
  assert.equal(creatorSize(undefined), 'unknown');
});

test('text search matches word prefixes across hook, handle, niches and caption', () => {
  const posts = [
    ...creatorPosts('a', [1, 1, 1, 1, 1, 9], { hookText: 'Stop waiting for motivation' }),
    ...creatorPosts('b', [1, 1, 1, 1, 1, 9], { hookText: 'Easy pasta', niches: ['food'] }),
  ];
  const result = searchOutliers(posts, { q: 'motivat waiting', timeWindow: 'all', now: NOW });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.posts[0].handle, 'a');
  assert.equal(result.posts[0].relevance, 6);
});

test('niche filter matches any listed niche, not just the first', () => {
  const posts = creatorPosts('a', [1, 1, 1, 1, 1, 9], { niches: ['parenting', 'fitness'] });
  assert.equal(searchOutliers(posts, { niche: 'Fitness', timeWindow: 'all', now: NOW }).totalMatches, 1);
});

test('pages are full until results run out, with no overlap', () => {
  const posts = ['a', 'b', 'c'].flatMap((h) => creatorPosts(h, [10, 10, 10, 10, 10, 20, 30, 40, 50]));
  const seen = [];
  let cursor;
  do {
    const page = searchOutliers(posts, { timeWindow: 'all', now: NOW, limit: 4, cursor });
    if (page.hasMore) assert.equal(page.returnedCount, 4);
    seen.push(...page.posts.map((p) => p.postKey));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 12);
  assert.equal(new Set(seen).size, 12);
});

test('a cursor from one search is rejected by another', () => {
  const posts = creatorPosts('a', [10, 10, 10, 10, 10, 20, 30]);
  const first = searchOutliers(posts, { timeWindow: 'all', now: NOW, limit: 1 });
  assert.throws(
    () => searchOutliers(posts, { timeWindow: 'all', now: NOW, limit: 1, q: 'hook', cursor: first.nextCursor }),
    /does not match/,
  );
});

test('time window excludes older posts', () => {
  const posts = creatorPosts('a', [10, 10, 10, 10, 10, 20]);
  assert.equal(searchOutliers(posts, { timeWindow: '7d', now: NOW }).totalMatches, 0);
  assert.equal(searchOutliers(posts, { timeWindow: '30d', now: NOW }).totalMatches, 1);
});

test('rejects unknown options', () => {
  assert.throws(() => searchOutliers([], { sort: 'random' }), /sort must be/);
  assert.throws(() => searchOutliers([], { sort: 'relevance' }), /needs a search query/);
});
