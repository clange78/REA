# How search works in Blueprint

Investigated 2026-10-14 through Blueprint's MCP connector (the `find_outliers`
tool). Blueprint is an iPhone app, so there was no web bundle or binary for REA
to decompile. Everything below comes from what the connector advertises and
what it returned when called. Nothing here comes from Blueprint's server code.

## Observed

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Search runs over a shared cache of already-analysed posts, not a live TikTok/Instagram search. | Tool description: "Find high-performing cached Explore posts". Responses: `source: "global_discover"`, `sourceScope: "global_eligible_cached_posts"`. |
| 2 | Outlier score = post views ÷ median views of the creator's recent posts. It is per creator and not adjusted per platform. | `evidenceContext.outlierScore.definition: "views_divided_by_creator_recent_median_views"`, `scope: "creator_relative"`, `platformNormalized: false`. |
| 3 | A creator needs at least 5 baseline posts for a score. Observed baselines used 10–12 posts. | `minimumBaselineSampleSize: 5`; `creatorRecentMedianSampleSize` of 10 and 12 in results. |
| 4 | Default search: last 7 days, all platforms, sorted by outlier score, highest first. | Unfiltered call returned `sort: "outlierScore"`, `timeWindow: "7d"`, `platform: "all"`; scores ran 236.1x, 167.9x, 57.5x, 30.6x, 30.3x. |
| 5 | Filters: platform, niche, time window, min views, format, hook type, creator size. Sorts: views, likes, comments, shares, postedAt, engagement, growth, outlier. | Tool input schema. |
| 6 | Niche filter matches any niche on a post, not only its main one. | `niche: "fitness"` returned a post whose `primaryNiche` is `parenting` and `niches` include `fitness`. |
| 7 | Pagination uses a keyset cursor: base64 JSON holding the sort, the filters and the last row's `(sortValue, postedAt, postKey)`. | Decoded `nextCursor`: `{"v":2,"sort":"outlierScore","filters":{...},"last":{"sortValue":30.2848,"postedAt":"…","postKey":"instagram:…"}}`. |
| 8 | Filters are applied after a page is read, so pages can come back short while more exist. | `limit: 3` returned `returnedCount: 2`, `partialPage: true`, `hasMore: true`. |
| 9 | View counts are refreshed separately from the AI analysis (hook, niche, format), so the two can be out of date relative to each other. | `lastMetricsAt` vs `analysisUpdatedAt`, plus warning `analysis_snapshot_older_than_current_metrics`. |
| 10 | Each post carries AI-extracted fields: spoken hook, on-screen hook, hook type, format, primary niche and niche list. | Result fields `hookSpoken`, `hookVisual`, `hookType`, `format`, `primaryNiche`, `niches`. |
| 11 | Media is stored in Google Cloud Storage under a bucket named `creva-e6435-explore-media`. | `thumbnailUrl` values. |

## Inferred

- The text query `q` isn't part of the cursor, so text search probably runs on
  a separate path from the filter search.
- Short pages (finding 8) mean filtering happens in application code after a
  database page is fetched, not in the database query itself.

## Unknown

- How `q` matches text. All three calls with `q` ("motivation", "motivation"
  again, "fitness") failed with **502 Bad Gateway**. Calls without `q`
  succeeded. Text search was broken on Blueprint's side during this test.
- Creator-size thresholds, the formulas for `engagement` and `growth`, and
  how posts get into the cache.

## What the rebuild does (`src/outliers.js`)

Kept from Blueprint: creator-relative outlier score, 5-post minimum, filter
set, default 7-day outlier sort, any-niche matching, keyset cursor.

Design choices where Blueprint was unknown or weak:

- **Text search** over hook, handle, niches and caption. Every word must
  match, and partial words count ("motivat" finds "motivation").
  `--sort relevance` ranks hook matches above caption matches.
- **Baseline** = median of the creator's 12 posts *before* this one, so a
  viral post never inflates its own baseline.
- **Full pages**: filters run before pagination, so a page is only short at
  the end of the results.
- **Safer cursor**: it includes the text query, and a cursor from one search
  is rejected by a different one.
- **Creator size**: nano <10k, micro 10k–100k, mid 100k–500k,
  macro 500k–1M, mega 1M+ followers.
- Not built: the `growth` sort, because its formula couldn't be observed.
