#!/usr/bin/env bash
# Hiveku plugin — SessionStart hook. Speaks up only with what's load-bearing:
# a missing token (the hiveku MCP would silently fail to authenticate), the
# disciplines that prevent the most common incidents, and the rule that Hiveku
# Memory is the source of truth (skills load only when the model opens them;
# this channel reaches every session). Kept to a few lines so it informs
# without nagging.
set -u

if [ -z "${HIVEKU_TOKEN:-}" ]; then
  echo "Hiveku: HIVEKU_TOKEN is not set, so the hiveku MCP server will not authenticate (tools will 401). Run the hiveku-connect skill, or set HIVEKU_TOKEN to your account key from app.hiveku.com."
  exit 0
fi

echo "Hiveku connected (HIVEKU_TOKEN set). Before any write: verify identity with get_account_info, and remember you are NOT the only writer — check project_version_log before you start and project_files_status before you push. See the hiveku-orient skill."
# The source-of-truth rule (2026-10-03), in the MCP server's own words (MCP #100, with the two
# sentences MCP #174 adds on About your business and a local copy). Static text only.
echo "Hiveku: Hiveku Memory is the source of truth for this business: read it before you act, and follow it over your own assumptions, local files or earlier conversation. When something disagrees with memory, trust memory and say so. About your business is read with \`account_memory_get\`; memory_list and memory_get leave it out. A local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read it again from Hiveku before you act on it. When \`memory_log_add\` is listed, record your work: a Doing line when you start a task for the person and a Done line when it ends. Save what you learned with the memory_* tools."
# What Hiveku records in the memory log itself (MCP #174): a session's Doing at its first change and
# its Done when it goes quiet or ends. The same words as the Claude Code plugin. Static text only.
echo "Hiveku: Hiveku records this session's Doing at its first change and its Done when the session goes quiet or ends. When the work ends, send a Done with \`memory_log_add\` and a one-line summary of what you did, if you want the log to say more than the count of changes; leave \`thread\` out."
# Versions (2026-09-25): a save is live in the preview but is not a version. Static text only.
echo "Hiveku: version your change with project_vcs_commit before you finish: once per change, after it is saved and verified, with NO files and a plain-language name for the site owner."
# The feedback loop (2026-09-24): where Hiveku's own defects and gaps go. Static text only.
# A refused memory write (403 memory_write_refused) is named apart (2026-10-03):
# "one retry, then report" turned that deliberate refusal into a bogus report.
echo "Hiveku: if a Hiveku tool keeps failing after one sensible retry, or a capability you need is missing, report it with hiveku_report_issue or hiveku_request_feature, and mention it to the user only if it changes what they get. A memory write refused with memory_write_refused is not a failure: show the person its message and link, follow its hint, and never retry it unchanged or report it. The hiveku-orient skill has the rules."
exit 0
