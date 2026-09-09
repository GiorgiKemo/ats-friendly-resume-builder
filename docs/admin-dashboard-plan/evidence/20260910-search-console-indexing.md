# Search Console indexing evidence

Checked 2026-09-10 (Asia/Tbilisi) in the authenticated owner browser for the
`sc-domain:resumeats.cv` property. This record distinguishes live-site
crawlability, Search Console request acceptance, and completed indexing.

## Live sitemap and canonical host

- `https://www.resumeats.cv/sitemap.xml` returned HTTP 200 and lists eight
  public canonical URLs.
- `https://resumeats.cv/sitemap.xml` also returned HTTP 200 and has already
  been submitted in Search Console.
- Search Console's Sitemaps report showed both sitemap submissions as
  successful with eight discovered URLs each.
- The public sitemap URLs use the `www` host. The apex host redirects to the
  `www` host, so apex URLs were not submitted for indexing.

## Current provider report

The Pages report was last updated 2026-09-04 and currently shows:

- 2 indexed pages
- 8 not-indexed pages
- 1 `Page with redirect` example
- 7 `Redirect error` examples, with validation already started

The redirect examples are stale non-`www` crawl records. Current live HTTP and
canonical checks use the `www` host; Search Console processing is asynchronous
and the report has not yet caught up with the current canonical responses.

## Manual crawl requests accepted

The URL Inspection tool visibly confirmed `Indexing requested` for these live
canonical URLs:

- `https://www.resumeats.cv/`
- `https://www.resumeats.cv/learn`
- `https://www.resumeats.cv/contact`
- `https://www.resumeats.cv/about`
- `https://www.resumeats.cv/pricing`
- `https://www.resumeats.cv/faq`

Each confirmation stated that the URL was added to Google's priority crawl
queue. This is a crawl request, not proof that the URL is indexed.

## External quota boundary

Requests for `https://www.resumeats.cv/privacy-policy` and
`https://www.resumeats.cv/terms` were not accepted because Search Console
displayed `Quota Exceeded` and instructed that requests may be submitted again
the following day. No success is claimed for those two URLs.

## Next verification

After the manual-request quota refresh, request the two remaining canonical
URLs, then wait for Google's recrawl and recheck the Pages report and each URL
in URL Inspection. Do not report the sitemap or a queued request as completed
indexing; Google controls the final indexing decision and timing.
