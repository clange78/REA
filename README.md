# Outlier search

Find short-form videos that massively outperformed their creator's normal
views, then filter and search them. Modelled on the search in Blueprint; see
[docs/blueprint-search-findings.md](docs/blueprint-search-findings.md) for what
was observed and what was designed fresh.

```bash
node src/cli.js --q motivation --time-window all --now 2026-10-14T00:00:00Z
node src/cli.js --niche "affiliate marketing" --platform tiktok --time-window 30d
node src/cli.js --help
npm test
```

`data/sample-posts.json` holds fictional demo posts
(`node scripts/make-sample-data.js` regenerates them). Swap in real posts from
your own data source. Each post needs `postKey`, `platform`, `creatorKey`,
`handle`, `followers`, `postedAt`, `views`, `likes`, `comments`, `shares`,
`hookText`, `hookType`, `format`, `niches`, `caption` and `sourceUrl`.

REA is installed automatically in Claude Code cloud sessions by
`.claude/hooks/session-start.sh`.
