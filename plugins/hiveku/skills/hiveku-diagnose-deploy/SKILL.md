---
name: hiveku-diagnose-deploy
description: "Diagnose a Hiveku deploy that reports ready but the live URL 403s / 404s / serves blank, or a deploy that failed with 'live site FAILS verification'. Runs deploy_doctor and acts on its findings — never guess, never delete infrastructure blindly."
---
When a deployed Hiveku URL misbehaves (403/404/blank while the deploy said ready, or a deploy failed
verification), do **not** guess and do **not** propose deleting or recreating a Lambda / distribution.
The serving path has layers you can't see from tool output; diagnose it.

## Steps
0. **Rule out the edge firewall first.** An automated client the firewall cannot identify gets a
   202 challenge (empty body, `x-amzn-waf-action: challenge`) or a 403 with
   `x-hiveku-firewall: blocked`; a request from a known bulk-scraper network gets a 403 with
   `x-hiveku-firewall: blocked-network`; a 403 without that header comes from the site itself. If
   YOUR probe of the live URL (a terminal `curl`, a script, or the customer's monitor) got one of
   the firewall's answers, that is not a serving failure: re-probe with
   `curl -A 'Hiveku-Session/1.0 (+https://hiveku.com)'` or `curl -I` before running the doctor. A
   403 without `x-hiveku-firewall`, and a blank page seen in a real browser, are not the firewall:
   run the doctor. The doctor and the deploy smoke run from Hiveku's servers and are exempt. A
   customer's own client that is refused at the browser check is allowed in Site > Hosting >
   Firewall: the `hiveku-firewall` skill.
1. **Run the doctor.** `deploy_doctor({ project_id, environment })`. Read-only. It checks: CloudFront
   wiring (is the default origin the right kind for this project?), the attached edge function, a
   CDN-vs-origin-direct probe of the same routes, and project-tree red flags.
2. **Read the CDN-vs-origin diff — the decisive signal:**
   - **origin serves 200 / CDN broken** → the fault is the platform serving path (CloudFront behavior
     mapping, attached function, or origin policy), NOT your build. The finding's `fix` text says what
     to do — usually redeploy (which reasserts the mapping and self-heals), or escalate to Hiveku infra.
   - **both broken** → the fault is your build/artifact. Run `project_test_build`, confirm the route
     exists in the build output, then redeploy.
3. **Relay each CRITICAL finding's `fix` text verbatim** to the user — it names the exact next action.
4. **Common findings and their fixes:**
   - `framework_source_without_package_json` → push the COMPLETE tree (package.json, next.config.*,
     tsconfig.json, app/layout.tsx), `site_reanalyze`, `project_test_build`, redeploy.
   - `static_url_routing_function_on_lambda` → redeploy; the platform detects and regenerates the edge
     function SSR-safe (self-heals).
   - `reserved_cdn_prefix_page_collision` → rename the colliding page route (e.g. `/videos` → `/video`).
   - `framework_project_served_from_s3` → ensure package.json is present so the deploy takes the build
     path, then redeploy.
5. **Escalation is a LAST resort, only after the doctor.** If it reports the platform serving path is
   broken and a normal redeploy does not fix it, that is a Hiveku infrastructure issue: report the
   `deploy_doctor` output to the user/Hiveku — do not attempt infrastructure surgery yourself.

Reference: `hiveku_docs_get("Reserved CDN Asset Path Prefixes")`,
`hiveku_playbook_get("debug-failed-deploy")`.
