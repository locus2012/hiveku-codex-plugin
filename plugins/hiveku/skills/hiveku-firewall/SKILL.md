---
name: hiveku-firewall
description: "A customer's uptime monitor, audit tool or script sees a blank page or a 202 from a Hiveku-hosted site; 'is the site down?' from an automated client; reading what the edge firewall challenged or blocked in the last 7 days; allowing one client by its product token (never Mozilla) or by address; what an allowance does and does not do. Nothing here disables protection."
---
Every Hiveku-hosted site sits behind one edge firewall. Load this when an automated client (a
monitor, an audit tool, a script, your own terminal) reports a blank page or a 202 from the live
site, or when you need to read what the firewall challenged or blocked for a site and allow one
specific client through. Nothing here disables protection; there is no tool for that.

## What the edge firewall does

Bulk scrapers from known crawler cloud networks are blocked (403), one address sending more than
the limit in five minutes is rate limited (429), and an unknown automated client is asked to prove
it is a browser (a challenge). Real visitors, verified search engines, AI assistants, link
previews, common uptime monitors and any client whose user agent contains `Hiveku` pass. HEAD
requests and the paths `/robots.txt`, `/sitemap*`, `/llms.txt` and `/.well-known/` are never
challenged.

**The challenge, as a client that cannot run JavaScript sees it: HTTP 202, an empty body, and the
header `x-amzn-waf-action: challenge`.** A real page is never a 202. Read it as "the edge firewall
challenged this client", never as "the site is empty", "the deploy failed" or "the form is missing
from the HTML". From your own terminal, `curl -A 'Hiveku-Session/1.0 (+https://hiveku.com)'`
passes and `curl -I` (HEAD) passes; a bare GET from this machine is challenged. `fetch_url`,
`web_scrape`, `preview_http_get`, `deploy_doctor` and the deploy pipeline's smoke check run from
Hiveku's own addresses and are never challenged. A 403 is the scraper-network block and a 429 is
the rate limit: an allowance changes neither.

## The three tools

Agents get exactly what a person has in Site > Hosting > Firewall: read, allow, remove.

- `site_firewall_get({ project_id, environment })` - read-only. The last 7 days for that tier
  (`production` | `staging` | `development`): `totals` (`challenged`, `blocked`, `rateLimited`),
  `window.through` (the latest rolled day; null when nothing has rolled yet - the numbers are
  rolled once a day from the access logs, so today's traffic shows tomorrow), `clients[]` (top 20
  by requests: `userAgent`, `asn`, `country`, `requests`, `lastSeen`, `outcome`, `allowed`) and
  `exceptions[]` (the active allowances: `id`, `kind`, `value`, `note`, `createdBy`, `createdAt`).
- `site_firewall_allow({ project_id, kind: 'ip' | 'user_agent', value, note? })` - adds one
  allowance and pushes it to the edge. Returns the exception and `edge: 'applied' | 'pending'`;
  `pending` means saved and picked up within the day, not failed. This is a write on a customer's
  site: the `hiveku` server prompts before it runs, and you confirm with the user first the way
  every other site write is confirmed.
- `site_firewall_remove({ project_id, exception_id })` - removes one allowance (the id comes from
  `site_firewall_get`) and pushes the change to the edge. Also prompts.

The same three operations are `GET`, `POST` and `DELETE` on
`/api/olympus/builder/projects/{projectId}/firewall[...]` for a script that talks to Olympus
directly. If the tools are not on your key yet, say so and hand the user the path
(Site > Hosting > Firewall) instead of guessing at another tool.

## The play: "my monitor says the site is blank"

1. Confirm the shape. Ask what the client received: a 202 with an empty body, or a response
   carrying `x-amzn-waf-action`, is the challenge. If the customer saw the blank page in a real
   browser, this is not the firewall: run the `hiveku-diagnose-deploy` skill.
2. Read the site: `site_firewall_get({ project_id, environment: "production" })`. Find the
   client's row in `clients[]`; `userAgent` is the string it sent, and `outcome` must be
   `challenged` for an allowance to help.
3. Allow it by its product token, never by a browser token. The value for `kind: 'user_agent'`
   is the distinctive part of the client's own user agent, 3 to 64 characters, matched
   case-insensitively as a substring: `MyMonitor/2.1`, `StatusCake`, `Site24x7`. The route
   refuses any token that would exempt browsers or verified bots - one that is, or contains,
   `Mozilla`, `Chrome`, `Safari`, `Firefox`, `Googlebot`, `bot`, `http`, `www` and the like - and
   its message names what to send instead; relay that message, do not try a second browser token.
   `bot` is refused even inside a product name (`UptimeRobot` contains it), so such a client is
   allowed by address instead; the common monitors are exempt already and rarely appear in the
   table. When the client's user agent is generic (a bare `python-requests` or `Go-http-client`)
   allow its address: `kind: 'ip'`, one IPv4 or IPv6 address or a small CIDR (IPv4 prefix 24 to
   32, IPv6 48 to 128; private, loopback and multicast ranges are refused).
4. Read `edge` in the answer. `applied` means the edge has it now; `pending` means saved and
   picked up within the day - tell the customer that, not "it failed".
5. Tell the customer what the allowance does and does not do (next section). The other fix is on
   their side: a monitor that sends a user agent naming its product and version is what the
   allowance matches, and one that identifies as Hiveku is never challenged.

## What an allowance does and does not do

- It skips the browser check only. The per-address rate limit, the block on known scraper
  networks and the fleet-wide volume challenge still apply, so an allowed monitor that hammers
  the site is still rate limited, and a spoofed token that starts walking a site at scale is
  still challenged.
- A user-agent allowance works on that site's hostnames only: a token can be copied by anyone, so
  it must not open other customers' sites. An IP allowance is trusted wherever that address goes
  on Hiveku hosting: an address identifies one machine.
- Ten active allowances per site. At the cap the route refuses with a clear message; remove one
  the customer no longer needs before adding another.
- Nothing turns the protection off. If a customer asks for that, the answer is no, with the
  allowance as the alternative; there is no tool, route or setting for it.
- A client that has not appeared in `clients[]` yet can still be allowed by token or address when
  the customer knows what it sends; the table fills after the next daily rollup.

## Hiveku's own tools never need an allowance

Every Hiveku fetcher identifies itself with a user agent containing `Hiveku` and runs from
Hiveku's exempt addresses. If a Hiveku tool's answer says it was challenged, that is a defect in
the fetcher, not something to fix with an allowance; report it. Never ask for a customer's monitor
to be added to Hiveku's own exempt address set: that set is for Hiveku's tools, and the customer's
allowance is self-service in Site > Hosting > Firewall.

## Not in this round

A weekly digest of challenged clients does not exist yet. Do not promise one; the customer reads
the 7-day window in the Firewall section, or you read it for them with `site_firewall_get`.

## Related skills
- `hiveku-orient` - the standing rule: identify as Hiveku on every terminal fetch of a hosted site.
- `hiveku-diagnose-deploy` - a blank page seen in a real browser is a serving problem, not the firewall.
- `hiveku-ship` - confirming the live URL after a deploy.
