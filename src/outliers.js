import { decodeCursor, encodeCursor } from './cursor.js';

export const BASELINE_WINDOW = 12;
export const MIN_BASELINE_SAMPLE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_WINDOWS = { '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS, all: Infinity };
const SORTS = ['outlierScore', 'relevance', 'views', 'likes', 'comments', 'shares', 'engagement', 'postedAt'];
const PLATFORMS = ['all', 'tiktok', 'instagram'];
const HOOK_TYPES = ['spoken', 'visual', 'both'];

// Follower bands. Blueprint exposes the same labels but not its thresholds.
const CREATOR_SIZES = [
  ['nano', 0, 10_000],
  ['micro', 10_000, 100_000],
  ['mid', 100_000, 500_000],
  ['macro', 500_000, 1_000_000],
  ['mega', 1_000_000, Infinity],
];

// Searchable fields and how much a match in each counts toward relevance.
const TEXT_FIELDS = [
  ['hookText', 3],
  ['handle', 2],
  ['niches', 2],
  ['caption', 1],
];

export function creatorSize(followers) {
  if (typeof followers !== 'number') return 'unknown';
  return CREATOR_SIZES.find(([, min, max]) => followers >= min && followers < max)[0];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Outlier score = views / median views of the creator's previous posts.
// Each post is compared only with posts published before it, so a viral
// video doesn't inflate its own baseline.
export function scorePosts(posts) {
  const byCreator = new Map();
  for (const post of posts) {
    if (!byCreator.has(post.creatorKey)) byCreator.set(post.creatorKey, []);
    byCreator.get(post.creatorKey).push(post);
  }

  const scored = [];
  for (const creatorPosts of byCreator.values()) {
    creatorPosts.sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
    creatorPosts.forEach((post, i) => {
      const previous = creatorPosts.slice(Math.max(0, i - BASELINE_WINDOW), i).map((p) => p.views);
      const enough = previous.length >= MIN_BASELINE_SAMPLE;
      const baseline = enough ? median(previous) : null;
      const outlierScore = baseline ? round(post.views / baseline) : null;
      scored.push({
        ...post,
        creatorSize: creatorSize(post.followers),
        engagement: post.views ? round((post.likes + post.comments + (post.shares ?? 0)) / post.views, 4) : 0,
        creatorRecentMedianViews: baseline,
        creatorRecentMedianSampleSize: previous.length,
        outlierScore,
        outlierScoreLabel: outlierScore === null ? null : `${outlierScore.toFixed(1)}x`,
      });
    });
  }
  return scored;
}

function round(value, places = 2) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Every query term must match a word in some field (prefix match, so
// "motivat" finds "motivation"). Returns null when the post doesn't match.
function relevance(post, terms) {
  const fields = TEXT_FIELDS.map(([name, weight]) => {
    const value = Array.isArray(post[name]) ? post[name].join(' ') : post[name];
    return [tokenize(value), weight];
  });
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const [words, weight] of fields) {
      if (words.some((w) => w.startsWith(term))) best = Math.max(best, weight);
    }
    if (!best) return null;
    score += best;
  }
  return score;
}

function normalizeRequest(options) {
  const request = {
    q: options.q?.trim() || null,
    platform: options.platform ?? 'all',
    niche: options.niche?.toLowerCase() || null,
    timeWindow: options.timeWindow ?? '7d',
    minViews: options.minViews ?? null,
    format: options.format?.toLowerCase() || null,
    hookType: options.hookType ?? null,
    creatorSize: options.creatorSize ?? null,
    sort: options.sort ?? 'outlierScore',
  };
  if (!PLATFORMS.includes(request.platform)) throw new Error(`platform must be one of ${PLATFORMS.join(', ')}`);
  if (!(request.timeWindow in TIME_WINDOWS)) throw new Error(`timeWindow must be one of ${Object.keys(TIME_WINDOWS).join(', ')}`);
  if (!SORTS.includes(request.sort)) throw new Error(`sort must be one of ${SORTS.join(', ')}`);
  if (request.sort === 'relevance' && !request.q) throw new Error('sort=relevance needs a search query');
  if (request.hookType && !HOOK_TYPES.includes(request.hookType)) throw new Error(`hookType must be one of ${HOOK_TYPES.join(', ')}`);
  return request;
}

function sortValue(post, sort) {
  return sort === 'postedAt' ? Date.parse(post.postedAt) : post[sort] ?? 0;
}

// Descending by sort value, then newest first, then postKey as a tiebreaker,
// so every post has a unique position and pages never overlap.
function compare(a, b) {
  return b.sortValue - a.sortValue || b.postedAtMs - a.postedAtMs || (a.postKey < b.postKey ? 1 : a.postKey > b.postKey ? -1 : 0);
}

export function searchOutliers(posts, options = {}) {
  const request = normalizeRequest(options);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const now = options.now ? Date.parse(options.now) : Date.now();
  const terms = request.q ? tokenize(request.q) : [];

  // Filter everything first, then paginate, so a page is only short when
  // the results run out.
  const matches = [];
  for (const post of scorePosts(posts)) {
    const postedAtMs = Date.parse(post.postedAt);
    if (now - postedAtMs > TIME_WINDOWS[request.timeWindow]) continue;
    if (request.platform !== 'all' && post.platform !== request.platform) continue;
    if (request.niche && !(post.niches ?? []).some((n) => n.toLowerCase() === request.niche)) continue;
    if (request.minViews !== null && post.views < request.minViews) continue;
    if (request.format && post.format?.toLowerCase() !== request.format) continue;
    if (request.hookType && post.hookType !== request.hookType) continue;
    if (request.creatorSize && post.creatorSize !== request.creatorSize) continue;
    if (request.sort === 'outlierScore' && post.outlierScore === null) continue;

    const relevanceScore = terms.length ? relevance(post, terms) : null;
    if (terms.length && relevanceScore === null) continue;

    const result = { ...post, relevance: relevanceScore };
    matches.push({ ...result, sortValue: sortValue(result, request.sort), postedAtMs });
  }
  matches.sort(compare);

  let start = 0;
  if (options.cursor) {
    const last = decodeCursor(options.cursor, request);
    const anchor = { sortValue: last.sortValue, postedAtMs: last.postedAtMs, postKey: last.postKey };
    start = matches.findIndex((m) => compare(anchor, m) < 0);
    if (start === -1) start = matches.length;
  }

  const page = matches.slice(start, start + limit);
  const hasMore = start + limit < matches.length;
  const tail = page.at(-1);
  return {
    posts: page.map(({ sortValue: _s, postedAtMs: _p, ...post }) => post),
    totalMatches: matches.length,
    returnedCount: page.length,
    hasMore,
    nextCursor: hasMore
      ? encodeCursor(request, { sortValue: tail.sortValue, postedAtMs: tail.postedAtMs, postKey: tail.postKey })
      : null,
    request,
  };
}
