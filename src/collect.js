#!/usr/bin/env node
// Finds TikTok videos for each keyword, then pulls each new creator's recent
// videos so their outlier baseline can be computed. Merges into a posts file
// that src/cli.js can search.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { RequestBudgetExceeded, createClient, extractVideos, normalizeTikTokVideo } from './sources/scrapecreators.js';

export function mergePosts(existing, incoming) {
  const byKey = new Map(existing.map((p) => [p.postKey, p]));
  for (const post of incoming) {
    const old = byKey.get(post.postKey);
    // Keep niches learned from earlier searches; take the newest metrics.
    byKey.set(post.postKey, old ? { ...old, ...post, niches: [...new Set([...(old.niches ?? []), ...post.niches])] } : post);
  }
  return [...byKey.values()];
}

export async function collect(client, keywords, { knownCreators = new Set(), log = () => {} } = {}) {
  const posts = [];
  const creatorNiches = new Map();
  try {
    for (const keyword of keywords) {
      const found = extractVideos(await client.tiktokKeywordSearch(keyword))
        .map((v) => normalizeTikTokVideo(v, { niches: [keyword] }))
        .filter(Boolean);
      log(`"${keyword}": ${found.length} videos`);
      posts.push(...found);
      for (const p of found) creatorNiches.set(p.handle, [...new Set([...(creatorNiches.get(p.handle) ?? []), keyword])]);
    }
    for (const [handle, niches] of creatorNiches) {
      if (knownCreators.has(handle)) continue;
      const recent = extractVideos(await client.tiktokProfileVideos(handle))
        .map((v) => normalizeTikTokVideo(v, { niches }))
        .filter(Boolean);
      log(`@${handle}: ${recent.length} recent videos`);
      posts.push(...recent);
    }
  } catch (err) {
    if (!(err instanceof RequestBudgetExceeded)) throw err;
    log(err.message);
  }
  return posts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      keyword: { type: 'string', multiple: true, default: [] },
      out: { type: 'string', default: 'data/posts.json' },
      'max-requests': { type: 'string', default: '25' },
      raw: { type: 'boolean', default: false },
    },
  });
  if (!values.keyword.length) {
    console.error('Usage: node src/collect.js --keyword motivation [--keyword ...] [--max-requests 25] [--out data/posts.json] [--raw]');
    process.exit(1);
  }

  if (!process.env.SCRAPECREATORS_API_KEY) {
    console.error('Set SCRAPECREATORS_API_KEY in the environment settings, then start a new session.');
    process.exit(1);
  }
  const client = createClient({ apiKey: process.env.SCRAPECREATORS_API_KEY, maxRequests: Number(values['max-requests']) });

  if (values.raw) {
    // One request, printed as-is, to check field names against normalizeTikTokVideo.
    console.log(JSON.stringify(await client.tiktokKeywordSearch(values.keyword[0]), null, 2));
    process.exit(0);
  }

  let existing = [];
  try {
    existing = JSON.parse(await readFile(values.out, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  // A creator with 5+ stored posts already has a baseline; don't pay to refetch.
  const counts = new Map();
  for (const p of existing) counts.set(p.handle, (counts.get(p.handle) ?? 0) + 1);
  const knownCreators = new Set([...counts].filter(([, n]) => n >= 5).map(([h]) => h));

  const fresh = await collect(client, values.keyword, { knownCreators, log: console.log });
  const merged = mergePosts(existing, fresh);
  await writeFile(values.out, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n${fresh.length} videos fetched, ${merged.length} stored in ${values.out}, ${client.requestsUsed} requests used`);
  console.log(`Search them: node src/cli.js --data ${values.out} --time-window 30d`);
}
