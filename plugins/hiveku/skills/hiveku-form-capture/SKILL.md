---
name: hiveku-form-capture
description: "Choose which forms Hiveku captures on a hosted site: app sign-ins, portal or admin screens showing up as leads; 'stop capturing our login form'; leads that went quiet after a capture change; erasing submissions captured by mistake. Read first, preview before excluding, save only on an explicit yes. The erase is permanent: dry run first."
---
By default Hiveku captures every form on a Hiveku-hosted site, and each submission becomes a CRM
contact, a lead notification, a workflow run and possibly a paid-ad conversion. On a web app that
turns sign-ins, password resets, admin screens and end users' data entry into "leads". A project
can now choose what is captured. Every write here waits for the owner's explicit yes, and Codex
prompts before both writes.

## The tools
- `marketing_form_capture_settings_get({ project_id })` - the switch (`enabled`), `site_type`
  (`marketing_site` | `web_app`), `skip_sign_in_forms`, `path_rules[]`, `form_rules[]`.
- `marketing_form_capture_list({ project_id, days })` - one row per form: `status` (`captured` |
  `not_captured` | `mixed`), `reason_text`, its own `rule`, `recorded_now_excluded` (roughly what
  an erase would remove; the erase's dry run is exact), `skipped_30d` (null means unknown, never
  zero), `sign_in_page`.
- `marketing_form_capture_preview({ project_id, exclude_paths, include_paths, mode, enabled,
  skip_sign_in_forms, days })` - a candidate policy against recorded submissions, never saved. The
  path lists are comma-separated strings.
- `marketing_form_capture_settings_update({ project_id, enabled, mode, skip_sign_in_forms,
  path_rules, form_rules })` - send only what changes. Prompts.
- `marketing_form_capture_purge({ project_id, since, limit, dry_run, confirm, confirm_token })` -
  the permanent erase. Prompts.

The `project_id` is a website project from `sites_list` or `project_get`, not a PM project from
`list_projects`.

## How a submission is decided (most specific wins)
Switch off (beats everything) -> markup on the `<form>` (`data-hiveku-capture="off"` or `"on"`) ->
a rule for that exact form (exclude / include) -> the sign-in default (skips credential-shaped
submissions on sign-in or password pages, to auth endpoints, or with a password field; it never
skips a signup that asks for a name) -> the most specific path rule (exclude wins a tie) -> Web app
mode (`mode: "allowlist"`: skipped unless something above included it) -> captured. Only automatic
capture is governed: hosted Hiveku forms and wired workflow webhooks are never affected.

Path rules start with `/` and match the page the form was on. `/login` is that page only, `*` is
exactly one segment, and a trailing `/*` is the page and everything below it (`/portal/*` matches
`/portal` and `/portal/x/y`). A bare `/*` or `*`, `**`, full URLs, `?`, `#` and spaces are refused.

## The flow
1. Read: `marketing_form_capture_settings_get`, then `marketing_form_capture_list`. Show the owner
   each form, its page, submissions, status and reason.
2. Decide with the owner. Marketing site (`mode: "all"`, the default): capture everything, exclude
   app-like paths. Web app (sign-in, a portal, admin screens, end-user data entry):
   `mode: "allowlist"`, with the real lead forms included in the same update (a form rule, or
   `data-hiveku-capture="on"` in the code). Nothing should be captured: `enabled: false`.
3. Preview before any exclusion: `marketing_form_capture_preview`, and read every row of
   `impact.by_form`. If a form it would stop capturing looks like a real lead form, narrow the rule
   or include that form. Never exclude a form producing real enquiries without the owner's yes.
4. Save on an explicit yes: `marketing_form_capture_settings_update`. `path_rules` and `form_rules`
   MERGE (`{ "/portal/*": "exclude", "/old": "remove" }`: `"remove"` deletes a rule, rules not named
   are kept). The answer carries `impact` and `conversions_held`; report both.
5. Verify: `marketing_form_capture_list` again. New submissions follow the rules at once, with no
   redeploy; markup changes arrive with the site's next deploy.

Muting a form's notifications is not the same as not capturing it: a muted form still creates
contacts, runs workflows and sends conversions.

## Erasing what was captured by mistake
A rule stops new captures only. `marketing_form_capture_purge` PERMANENTLY erases the automatically
captured submissions the CURRENT rules exclude, their files and CRM notes, and the contacts that
exist only because of them. Exclude first, then erase.
- Dry run (the default). Show the owner `total_excluded_submissions`, `batch.by_form`,
  `batch.contacts_erasable` and `batch.contacts_kept`, and every line of `cannot_undo`.
- Only on an explicit yes: the same call with `confirm: true` and the `confirm_token`, the same
  `since` and `limit`, within 15 minutes. A 409 `stale_plan` means dry-run again.
- Until agent execution is switched on, the execute answers 403 `agent_execute_disabled`: say so
  and send the owner to Analytics > Forms > Capture > Erase in the dashboard. Do not retry.
- One batch per yes; never loop batches without the owner seeing the total.

## Related skills
- `hiveku-orient` - identity first, and the approval rails every write here follows.
