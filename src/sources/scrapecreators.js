// ScrapeCreators client for TikTok. Docs: https://scrapecreators.com
//
// Confirmed from ScrapeCreators' docs: base URL, the x-api-key header, and
// /v1/tiktok/search/keyword with query/date_posted/sort_by/cursor.
// NOT yet confirmed against a live response: the profile-videos path and the
// response field names in normalizeTikTokVideo. Run `collect --raw` once with
// a real key and check them before trusting the numbers.

const BASE_URL = 'https://api.scrapecreators.com';

export class RequestBudgetExceeded extends Error {}

export function createClient({ apiKey, maxRequests = 25, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('Set SCRAPECREATORS_API_KEY in the environment settings');
  let used = 0;

  async function get(path, params) {
    if (used >= maxRequests) throw new RequestBudgetExceeded(`Stopped at the ${maxRequests}-request budget`);
    used++;
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) throw new Error(`ScrapeCreators ${path} failed: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }

  return {
    get requestsUsed() {
      return used;
    },
    // date_posted and sort_by values are passed through as given.
    tiktokKeywordSearch: (query, { cursor, datePosted, sortBy } = {}) =>
      get('/v1/tiktok/search/keyword', { query, cursor, date_posted: datePosted, sort_by: sortBy, trim: true }),
    tiktokProfileVideos: (handle, { cursor } = {}) => get('/v3/tiktok/profile/videos', { handle, max_cursor: cursor, trim: true }),
  };
}

// Search results may wrap each video (e.g. { aweme_info: {...} }).
export function extractVideos(response) {
  const list = response?.search_item_list ?? response?.aweme_list ?? response?.videos ?? response?.data ?? [];
  return list.map((item) => item?.aweme_info ?? item).filter(Boolean);
}

export function normalizeTikTokVideo(video, { niches = [] } = {}) {
  const author = video.author ?? {};
  const stats = video.statistics ?? video.stats ?? {};
  const handle = author.unique_id ?? author.uniqueId;
  const id = video.aweme_id ?? video.id;
  if (!id || !handle) return null;
  const description = video.desc ?? video.description ?? '';
  return {
    postKey: `tiktok:${id}`,
    platform: 'tiktok',
    creatorKey: `tiktok:user:${author.uid ?? author.id ?? handle}`,
    handle,
    followers: author.follower_count ?? author.followerCount ?? null,
    sourceUrl: `https://www.tiktok.com/@${handle}/video/${id}`,
    caption: description,
    // No AI analysis yet: the first sentence of the caption stands in for the hook.
    hookText: description.split(/(?<=[.!?])\s|\n/)[0].slice(0, 200),
    hookType: null,
    format: null,
    niches,
    postedAt: new Date(Number(video.create_time ?? video.createTime) * 1000).toISOString(),
    views: Number(stats.play_count ?? stats.playCount ?? 0),
    likes: Number(stats.digg_count ?? stats.diggCount ?? 0),
    comments: Number(stats.comment_count ?? stats.commentCount ?? 0),
    shares: Number(stats.share_count ?? stats.shareCount ?? 0),
    fetchedAt: new Date().toISOString(),
  };
}
