import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect, mergePosts } from '../src/collect.js';
import { createClient, extractVideos, normalizeTikTokVideo } from '../src/sources/scrapecreators.js';

// Shape assumed from TikTok's own video objects; check against a live
// response with `node src/collect.js --raw`.
const video = (id, handle, views) => ({
  aweme_id: id,
  desc: 'Stop waiting for motivation. Do this instead #mindset',
  create_time: 1791460800,
  author: { uid: `u-${handle}`, unique_id: handle, follower_count: 42000 },
  statistics: { play_count: views, digg_count: 10, comment_count: 2, share_count: 1 },
});

test('normalizes a TikTok video into a searchable post', () => {
  const post = normalizeTikTokVideo(video('123', 'riseup', 5000), { niches: ['motivation'] });
  assert.equal(post.postKey, 'tiktok:123');
  assert.equal(post.handle, 'riseup');
  assert.equal(post.views, 5000);
  assert.equal(post.followers, 42000);
  assert.equal(post.hookText, 'Stop waiting for motivation.');
  assert.equal(post.sourceUrl, 'https://www.tiktok.com/@riseup/video/123');
  assert.deepEqual(post.niches, ['motivation']);
});

test('unwraps search results and skips items without an id or author', () => {
  const videos = extractVideos({ search_item_list: [{ aweme_info: video('1', 'a', 1) }, { aweme_info: {} }] });
  assert.equal(videos.length, 2);
  assert.equal(videos.map((v) => normalizeTikTokVideo(v)).filter(Boolean).length, 1);
});

test('client sends the API key header and stops at the request budget', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), key: init.headers['x-api-key'] });
    return { ok: true, json: async () => ({}) };
  };
  const client = createClient({ apiKey: 'k', maxRequests: 1, fetchImpl });
  await client.tiktokKeywordSearch('motivation');
  assert.equal(calls[0].key, 'k');
  assert.match(calls[0].url, /\/v1\/tiktok\/search\/keyword\?query=motivation/);
  await assert.rejects(client.tiktokKeywordSearch('again'), /budget/);
});

test('client refuses to run without a key', () => {
  assert.throws(() => createClient({}), /SCRAPECREATORS_API_KEY/);
});

test('collect searches keywords, then fetches each new creator once', async () => {
  const profileCalls = [];
  const client = {
    tiktokKeywordSearch: async (q) => ({ search_item_list: [{ aweme_info: video(`${q}-1`, 'a', 100) }, { aweme_info: video(`${q}-2`, 'b', 100) }] }),
    tiktokProfileVideos: async (handle) => {
      profileCalls.push(handle);
      return { aweme_list: [video(`${handle}-p1`, handle, 50)] };
    },
  };
  const posts = await collect(client, ['motivation', 'mindset'], { knownCreators: new Set(['b']) });
  assert.deepEqual(profileCalls, ['a']);
  assert.equal(posts.length, 5);
  assert.deepEqual(posts.at(-1).niches, ['motivation', 'mindset']);
});

test('merge keeps earlier niches and takes newer metrics', () => {
  const merged = mergePosts(
    [{ postKey: 'x', views: 1, niches: ['motivation'] }],
    [{ postKey: 'x', views: 9, niches: ['mindset'] }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].views, 9);
  assert.deepEqual(merged[0].niches, ['motivation', 'mindset']);
});
