#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { searchOutliers } from './outliers.js';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: new URL('../data/sample-posts.json', import.meta.url).pathname },
    q: { type: 'string' },
    platform: { type: 'string' },
    niche: { type: 'string' },
    'time-window': { type: 'string' },
    'min-views': { type: 'string' },
    format: { type: 'string' },
    'hook-type': { type: 'string' },
    'creator-size': { type: 'string' },
    sort: { type: 'string' },
    limit: { type: 'string' },
    cursor: { type: 'string' },
    now: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: outlier-search [options]

  --q <text>             search hooks, captions, handles and niches
  --platform <p>         all | tiktok | instagram
  --niche <n>            e.g. motivation
  --time-window <w>      24h | 7d | 30d | all (default 7d)
  --min-views <n>
  --format <f>           e.g. talking_head
  --hook-type <t>        spoken | visual | both
  --creator-size <s>     nano | micro | mid | macro | mega
  --sort <s>             outlierScore | relevance | views | likes | comments | shares | engagement | postedAt
  --limit <n>            1-50 (default 20)
  --cursor <c>           nextCursor from the previous page
  --data <file>          posts JSON (default data/sample-posts.json)
  --now <iso date>       evaluate time windows from this date
  --json                 print raw JSON`);
  process.exit(0);
}

const posts = JSON.parse(await readFile(values.data, 'utf8'));
const num = (v) => (v === undefined ? undefined : Number(v));

try {
  const result = searchOutliers(posts, {
    q: values.q,
    platform: values.platform,
    niche: values.niche,
    timeWindow: values['time-window'],
    minViews: num(values['min-views']),
    format: values.format,
    hookType: values['hook-type'],
    creatorSize: values['creator-size'],
    sort: values.sort,
    limit: num(values.limit),
    cursor: values.cursor,
    now: values.now,
  });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.totalMatches} matches, sorted by ${result.request.sort}\n`);
    for (const p of result.posts) {
      console.log(`${(p.outlierScoreLabel ?? '  n/a').padStart(6)}  ${p.views.toLocaleString().padStart(10)} views  @${p.handle} (${p.platform})`);
      console.log(`        "${p.hookText}"`);
      console.log(`        ${p.sourceUrl}\n`);
    }
    if (result.nextCursor) console.log(`More: --cursor ${result.nextCursor}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
