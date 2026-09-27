#!/usr/bin/env bash
# Hiveku plugin for Codex: PreToolUse hook (part 2 of 3 of the versions
# reminder, with hooks/post-tool-use.sh and hooks/stop.sh). Two jobs:
#
#   1. project_vcs_commit, and project_vcs_rollback with dry_run literally
#      false: append an "attempted" line with the call's id to the session
#      ledger. Codex 0.131 runs PostToolUse only for a call that succeeded, so
#      a version call answered 409 nothing_to_commit (already a version) or
#      409 rollback_incomplete (files written, no version) leaves no other
#      trace; stop.sh reads how an attempted call ended from the transcript.
#   2. hiveku_batch: refuse ("deny") a batch that carries a tool this plugin's
#      .mcp.json sets to "prompt" (project_vcs_rollback, deploy_site, ...).
#      Codex asks the person per tool NAME, so inside a batch such a call
#      would ride on the batch's single approval. The reason tells the agent
#      to call it on its own. (hiveku_batch is itself set to "prompt", so the
#      batch is still asked about where hooks are not trusted.)
#
# What Codex 0.131 sends (hooks/src/schema.rs PreToolUseCommandInput): one
# compact JSON object, keys in this order: session_id, turn_id,
# transcript_path, cwd, hook_event_name, model, permission_mode, tool_name,
# tool_input, tool_use_id (the call id the transcript uses). It reads
# {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":
# "deny","permissionDecisionReason":"..."}} as "do not run the call; give the
# model this reason" (hooks/src/engine/output_parser.rs; 0.131 supports deny,
# not ask). The hook runs before Codex's own approval prompt.
#
# bash with grep, sed and tr only (node may be absent on a brew install);
# bash 3.2 safe. No credentials, no network. Failure-open: any error exits 0
# with no output, which lets the call run as Codex would without the hook.

ID_RE='^[A-Za-z0-9-]{1,64}$'
BRANCH_RE='^[A-Za-z0-9._/-]{1,200}$'
SESSION_RE='^[A-Za-z0-9._-]{1,128}$'
CALL_RE='^[A-Za-z0-9_.:-]{1,128}$'
TOOL_RE='^[a-z0-9_]{1,80}$'
# Asked about even when .mcp.json cannot be read.
ALWAYS_PROMPT=" project_vcs_rollback project_vcs_commit deploy_site "

HOOK_DIR=${0%/*}
[ "$HOOK_DIR" = "$0" ] && HOOK_DIR=.

# The payload up to and including its "tool_name" member (see post-tool-use.sh).
HEADER=''
TOOL_NAME=''
read_header() {
  local part n=0
  while :; do
    if ! IFS= read -r -d , part; then
      HEADER="$HEADER$part"
      return 0
    fi
    HEADER="$HEADER$part,"
    case $part in
      '"tool_name":"'*'"')
        TOOL_NAME=${part#\"tool_name\":\"}
        TOOL_NAME=${TOOL_NAME%\"}
        return 0 ;;
    esac
    n=$((n + 1))
    [ "$n" -lt 16 ] || return 0
  done
}

json_string() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# The tools this plugin's .mcp.json sets to "prompt", space-separated and
# padded (" a b "). The file sits next to hooks/ in the installed plugin.
prompt_tools() {
  local list
  list=$(tr -d ' \t\r\n' < "$HOOK_DIR/../.mcp.json" 2>/dev/null \
    | grep -o -E '"[a-z0-9_]+":\{[^{}]*"approval_mode":"prompt"[^{}]*\}' \
    | sed 's/^"\([a-z0-9_]*\)".*/\1/' | tr '\n' ' ')
  printf ' %s%s' "$list" "$ALWAYS_PROMPT"
}

deny_batch() {
  declare -F batch_members >/dev/null || return 0 # json-walk.sh did not load
  local prompted members member rest found=' ' names='' count=0
  prompted=$(prompt_tools)
  members=$({ printf '%s' "$HEADER"; cat; } | json_tokens | batch_members)
  while read -r member rest; do
    [[ $member =~ $TOOL_RE ]] || continue
    [ "$member" = hiveku_batch ] && continue
    case "$prompted" in *" $member "*) ;; *) continue ;; esac
    case "$found" in *" $member "*) continue ;; esac
    found="$found$member "
    count=$((count + 1))
    if [ -z "$names" ]; then names=$member; else names="$names, $member"; fi
  done <<< "$members"
  [ "$count" -gt 0 ] || return 0
  local them='it' each='that call'
  if [ "$count" -gt 1 ]; then them='each of them'; each='each call'; fi
  # No final period: Codex appends ". Tool: <name>" to a PreToolUse refusal.
  local reason="Not run: this hiveku_batch carries $names, which Codex asks the person about before every call. Call $them on its own, not inside hiveku_batch, so the person is asked about $each; batch only the other calls"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
    "$(json_string "$reason")"
}

record_attempt() { # tool
  local tokens
  tokens=$({ printf '%s' "$HEADER"; cat; } | tr ',{}[]' '\n\n\n\n\n' | grep -E \
    -e '^"(session_id|project_id|branch|tool_use_id)":"[^"\\]*"$' \
    -e '^"dry_run":[[:space:]]*(true|false)$')
  # A rollback is a dry run unless dry_run is literally false, the route's rule.
  if [ "$1" = project_vcs_rollback ]; then
    printf '%s\n' "$tokens" | grep -E -q '^"dry_run":[[:space:]]*false$' || return 0
  fi
  local session pid branch call
  session=$(printf '%s\n' "$tokens" | sed -n 's/^"session_id":"\(.*\)"$/\1/p' | sed -n '1p')
  pid=$(printf '%s\n' "$tokens" | sed -n 's/^"project_id":"\(.*\)"$/\1/p' | sed -n '1p')
  branch=$(printf '%s\n' "$tokens" | sed -n 's/^"branch":"\(.*\)"$/\1/p' | sed -n '1p')
  # The top-level tool_use_id comes after tool_input, so it is the last one.
  call=$(printf '%s\n' "$tokens" | sed -n 's/^"tool_use_id":"\(.*\)"$/\1/p' | sed -n '$p')
  { [ -z "$branch" ] || [ "$branch" = main ]; } && branch=main
  [[ $session =~ $SESSION_RE ]] || return 0
  [[ $pid =~ $ID_RE ]] || return 0
  [[ $branch =~ $BRANCH_RE ]] || return 0
  [[ $call =~ $CALL_RE ]] || return 0
  local dir="${TMPDIR:-/tmp}"
  dir="${dir%/}/hiveku-vcs"
  mkdir -p "$dir" || return 0
  printf '{"t":%s,"kind":"attempted","project_id":"%s","branch":"%s","call":"%s"}\n' \
    "$(date +%s)" "$pid" "$branch" "$call" >> "$dir/$session.jsonl"
}

main() {
  read_header
  case $TOOL_NAME in
    mcp__hiveku__hiveku_batch) deny_batch ;;
    mcp__hiveku__project_vcs_commit) record_attempt project_vcs_commit ;;
    mcp__hiveku__project_vcs_rollback) record_attempt project_vcs_rollback ;;
  esac
  return 0
}

export LC_ALL=C # byte-wise text tools: fast, and never trip on a locale
set -f          # no value is ever globbed
umask 077       # the ledger is this user's alone
. "$HOOK_DIR/json-walk.sh" 2>/dev/null
out=$(main 2>/dev/null)
[ -n "$out" ] && printf '%s\n' "$out"
exit 0
