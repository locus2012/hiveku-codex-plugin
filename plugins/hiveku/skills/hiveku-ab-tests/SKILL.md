---
name: hiveku-ab-tests
description: "Page A/B tests and routes on a Hiveku-hosted site: testing a second version of a page, changing version B, starting, pausing or ending a test, reading the result (by traffic channel and ad platform too), making version B the page or removing the test copy after a test, and sending one traffic source to a page of its own. Also load before changing a page that might be under test, before an ad budget, bid, targeting or final-URL change, and before an SEO fix on a page address like /pricing-b. Every live change waits for a yes."
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
  (/pricing to /pricing-b) as a draft. Nothing changes on the live site. It saves a version of
  the site's code, so it shows a preview first and needs a yes (`confirm: true`).
- To change version B, edit the copy's own files, never the original's. Save a version, deploy to
  production, and only then start the test.
- Start checks: the test cannot start until both pages answer on the live site, and the start
  lists every other problem in plain words (a redirect on either page, a third-party cookie banner).
- Start, pause, resume, end and a new split each return a preview first. Show it, ask, and send
  `confirm: true` only after the person says yes.

## Goals
- The default goal is leads anywhere on the site: a form sent or a call made.
- Other goals: a form (anywhere, or only on the tested page), reaching a page, a tracked event by
  name (a marked button is `cta_click`), a goal from Analytics, calls, stayed at least 30 or 60
  seconds on the tested page, scrolled at least 50% or 75% of it, and bought something.
- Bought something counts Shopify orders whose cart carries the visitor's id. Only a storefront
  built or rebuilt on Hiveku since purchases became a goal does that, and only for visitors who
  allowed analytics.
- Up to five secondary goals can be added. They never decide the verdict.
- A new main goal on a running or paused test recalculates the whole result, so it shows a
  preview first and needs a yes.

## During a test
- While a test runs or is paused, change neither page, the original or version B. A change mixes
  two versions into one result, and nothing in the result shows it.
- If a page must change, end the test (or end it and start a new one) and tell the person why.
- A save is never refused, but a save that touches a tested page answers `abTestWarnings`: one
  plain sentence per test. Treat it as a stop and tell the person.
- A production deploy that changes a tested page is marked `page_changed` on the test's timeline.

## Reading the result
- Quote the result as `project_ab_test_get` reports it. Never call a winner before the verdict says
  winning or won.
- The result also breaks down by traffic channel (`channels`) and by ad platform (`adPlatforms`).
  Each visitor counts once, on the visit in which they first saw the test. Visits that were not
  paid are one row, "Not from an ad". A row is not a verdict.
- With the bought-something goal, `purchases` gives each version's buyers, orders and totals per
  currency, in cents.
- `alsoCompared` gives engaged time and revenue per visitor, with a 95% range of the difference
  from the original. It is context and never decides the winner. Revenue is rough below 30 buyers.
  When a metric cannot be worked out, it is null with a coded reason.
- Hiveku tells the people who manage the site (inbox, bell and email) when it pauses a test, when
  a verdict is reached and when a health check warns. Each is told once.

## Ending a test
- Ending offers "keep the original" or "send everyone to version B". Sending everyone to B adds a
  temporary (302) redirect from the original address to the copy, on the site's Redirects page. Both
  pages stay on the site.
- Suggest sending everyone to version B when the verdict is winning or won. Otherwise suggest
  keeping the original.
- A route, or a test limited to some visitors, can only end keeping the original.

## After a test
- This applies to an ended test whose version B was made as a test copy.
- `project_ab_test_action` with `action: "promote"` is for a test that sent everyone to B. It saves
  one version on Main that makes the original page exactly version B and removes the copy.
- `action: "remove_copy"` is for a test that kept the original. It saves one version on Main that
  removes the copy.
- Without `confirm: true` each answers a preview. Show it, ask, and confirm only after a yes.
- Nothing changes on the live site until the next production deploy is live. Then Hiveku adds a
  permanent (301) redirect from the copy's address to the original, so old links keep working.
  After a promote, it also removes the 302.
- It is refused in plain words when the test has not ended, version B was not a test copy, the
  action does not fit how the test ended, or it is already done or already asked. It is also
  refused when the site goes live from GitHub, has more than 500 redirects, or another test that
  is not over uses the copy's address.

## Paid ads
- Before a budget, bid, targeting, audience or final-URL change on a campaign that lands on a page
  with a running test or route, list the site's tests. Hold the change, or say plainly that it
  will skew the result: a shift in who clicks can look like a winner.
- Keep ad final URLs on the original page. The split happens on the site and keeps gclid and UTM
  tags.
- A route can send one ad platform's clicks to a page of its own without changing the ad.
- Page A/B tests are not the ad platforms' own campaign experiments.
- "Did version B win for Google Ads clicks?" Read the test's `adPlatforms` rows, with each row's
  visitors and conversions.
- A promote replaces the page the ads land on after the next production deploy, and the 301 keeps
  old links working. No ad change is needed.

## SEO
- A test copy (an address like /pricing-b) is canonical to the original while its test runs and
  is kept out of the sitemap on purpose. Do not index it, link to it, add it to the sitemap or
  "fix" it as duplicate content.
- The canonical is sent in the page's HTTP headers, not in its HTML, so an audit that reads only
  the HTML reports it missing. A route's page gets no canonical.
- The A/B redirect is a temporary 302, by design.
- After a promote or a copy removal, the copy's address becomes a permanent 301 to the original
  once the next production deploy is live. That 301 is meant to stay.
- Before blaming rankings or traffic, rule out a running or recently ended test or route on the
  page.
