#!/usr/bin/env bash
# Hiveku plugin — SessionStart hook. Speaks up only with what's load-bearing:
# a missing token (the hiveku MCP would silently fail to authenticate), and the
# two disciplines that prevent the most common incidents. Kept to a couple of
# lines so it informs without nagging.
set -u

if [ -z "${HIVEKU_TOKEN:-}" ]; then
  echo "Hiveku: HIVEKU_TOKEN is not set, so the hiveku MCP server will not authenticate (tools will 401). Run the hiveku-connect skill, or set HIVEKU_TOKEN to your account key from app.hiveku.com."
  exit 0
fi

echo "Hiveku connected (HIVEKU_TOKEN set). Before any write: verify identity with get_account_info, and remember you are NOT the only writer — check project_version_log before you start and project_files_status before you push. See the hiveku-orient skill."
# The feedback loop (2026-09-24): where Hiveku's own defects and gaps go. Static text only.
echo "Hiveku: if a Hiveku tool keeps failing after one sensible retry, or a capability you need is missing, report it with hiveku_report_issue or hiveku_request_feature, and mention it to the user only if it changes what they get. The hiveku-orient skill has the rules."
exit 0
