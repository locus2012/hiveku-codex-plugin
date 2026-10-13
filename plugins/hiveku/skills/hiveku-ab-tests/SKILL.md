---
name: hiveku-ab-tests
description: "Page A/B tests and routes on a Hiveku-hosted site: testing a second version of a page, changing version B, starting, pausing or ending a test, reading the result, and sending one traffic source to a page of its own. Also load before changing a page that might be under test, before an ad budget, bid, targeting or final-URL change, and before an SEO fix on a page address like /pricing-b. Every live change waits for a yes."
---
A page A/B test shows a second version of a page, at its own address, to a share of new visitors
and counts which version brings more conversions, on that page and anywhere on the site afterwards.
The split happens on the live site (always built from Main) with no deploy. A route sends the
visitors who came from somewhere (an ad platform, a UTM campaign, a referring site, a device, a
country or region) to a page made for them, and can keep a share on the original to compare. Both
are listed by `project_ab_tests_list({ project_id })`, which also says whether the site can run
them (`can_start_tests`, `why_not`).

## Making and changing version B
- `project_ab_test_create` with `make_copy: true` copies the page's code to the next free address
  (/pricing to /pricing-b) as a draft. Nothing changes on the live site.
- To change version B, edit the copy's own files, never the original's. Save a version, deploy to
  production, and only then start the test.
- Start checks: the test cannot start until both pages answer on the live site, and the start
  lists every other problem in plain words (a redirect on either page, a third-party cookie banner).
- Start, pause, resume, end and a new split each return a preview first. Show it, ask, and send
  `confirm: true` only after the person says yes.

## During a test
- While a test runs or is paused, change neither page, the original or version B. A change mixes
  two versions into one result, and nothing in the result shows it.
- If a page must change, end the test (or end it and start a new one) and tell the person why.
- Quote the result as `project_ab_test_get` reports it. Never call a winner before the verdict says
  winning or won.

## Ending a test
- Ending offers "keep the original" or "send everyone to version B". Sending everyone to B adds a
  temporary (302) redirect from the original address to the copy, on the site's Redirects page. Both
  pages stay on the site.
- A route, or a test limited to some visitors, can only end keeping the original.

## Paid ads
- Before a budget, bid, targeting, audience or final-URL change on a campaign that lands on a page
  with a running test or route, list the site's tests. Hold the change, or say plainly that it
  will skew the result: a shift in who clicks can look like a winner.
- Keep ad final URLs on the original page. The split happens on the site and keeps gclid and UTM
  tags.
- A route can send one ad platform's clicks to a page of its own without changing the ad.
- Page A/B tests are not the ad platforms' own campaign experiments.

## SEO
- A test copy (an address like /pricing-b) is canonical to the original while its test runs and
  is kept out of the sitemap on purpose. Do not index it, link to it, add it to the sitemap or
  "fix" it as duplicate content.
- The A/B redirect is a temporary 302, by design.
- Before blaming rankings or traffic, rule out a running or recently ended test or route on the
  page.
