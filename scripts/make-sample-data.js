// Generates fictional demo posts. Replace data/sample-posts.json with real
// posts from your own data source using the same fields.
import { writeFile } from 'node:fs/promises';

const creators = [
  { handle: 'riseandgrind.daily', platform: 'tiktok', followers: 42_000, niches: ['motivation', 'mindset'], base: 8_000 },
  { handle: 'quietdiscipline', platform: 'instagram', followers: 310_000, niches: ['motivation', 'self improvement'], base: 60_000 },
  { handle: 'sidehustle.sam', platform: 'tiktok', followers: 7_500, niches: ['affiliate marketing', 'make money online'], base: 2_000 },
  { handle: 'faithoverfear.co', platform: 'instagram', followers: 1_400_000, niches: ['faith', 'motivation'], base: 250_000 },
  { handle: 'liftmindset', platform: 'tiktok', followers: 620_000, niches: ['fitness', 'mindset'], base: 90_000 },
];
const hooks = [
  ['Nobody is coming to save you. Here is what I did instead.', 'talking_head', 'spoken'],
  ['3 habits that quietly changed my life', 'listicle', 'both'],
  ['I made my first affiliate sale doing this', 'tutorial', 'both'],
  ['Stop waiting for motivation. Do this.', 'talking_head', 'spoken'],
  ['POV: you finally stopped making excuses', 'visual', 'visual'],
  ['The morning routine that fixed my discipline', 'vlog', 'both'],
];

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const start = Date.parse('2026-09-01T12:00:00Z');
const posts = [];
creators.forEach((c, ci) => {
  for (let i = 0; i < 14; i++) {
    const [hookText, format, hookType] = hooks[(ci + i) % hooks.length];
    const spike = i === 12 - ci ? 15 + ci * 6 : 0.5 + rand();
    const views = Math.round(c.base * spike);
    const id = `${ci}${String(i).padStart(3, '0')}`;
    posts.push({
      postKey: `${c.platform}:demo${id}`,
      platform: c.platform,
      creatorKey: `${c.platform}:${c.handle}`,
      handle: c.handle,
      followers: c.followers,
      sourceUrl: `https://example.com/${c.handle}/${id}`,
      caption: `${hookText} #${c.niches[0].replace(/\s+/g, '')}`,
      hookText,
      hookType,
      format,
      niches: c.niches,
      postedAt: new Date(start + (i * 3 + ci) * 86_400_000).toISOString(),
      views,
      likes: Math.round(views * (0.04 + rand() * 0.06)),
      comments: Math.round(views * 0.002),
      shares: Math.round(views * 0.004),
    });
  }
});

await writeFile(new URL('../data/sample-posts.json', import.meta.url), JSON.stringify(posts, null, 2) + '\n');
console.log(`Wrote ${posts.length} posts`);
