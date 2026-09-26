#!/usr/bin/env bash
# Hiveku plugin for Codex: PostToolUse hook, the versions ledger (part 1 of 3;
# hooks/pre-tool-use.sh and hooks/stop.sh are the others).
#
# Records, per Codex session, which Hiveku website projects this session
# changed and which it saved as a version, so the Stop hook can ask for ONE
# version before the agent finishes. Same ledger and rules as the Claude Code
# plugin's PostToolUse hook (notes/DESIGN-versions-and-rollback-2026-09-24.md,
# sections E1 and E2), without anything that needs a network: this file never
# reads a credential and never calls Hiveku.
#
# bash with grep, sed and tr only (node may be absent on a brew install); bash 3.2 safe.
# Failure-open: every path exits 0 and prints nothing, so it can never fail,
# delay or rewrite the tool call it observes.
#
# What Codex 0.131 sends (codex-rs core/src/tools/registry.rs, handlers/mcp.rs
# and hooks/src/schema.rs at rust-v0.131.0):
#   - PostToolUse runs ONLY for a call that succeeded. An MCP answer with
#     isError:true (every non-2xx answer from Hiveku, 409 nothing_to_commit and
#     409 rollback_incomplete included) never reaches this hook, and 0.131 has
#     no failure event. So a failed version call is not seen here:
#     hooks/pre-tool-use.sh records the ATTEMPT, and hooks/stop.sh reads how it
#     ended from the session transcript.
#   - one compact JSON object on stdin, keys in this order: session_id,
#     turn_id, transcript_path, cwd, hook_event_name, model, permission_mode,
#     tool_name, tool_input, tool_response, tool_use_id;
#   - tool_name "mcp__<server>__<tool>" for an MCP tool ("mcp__hiveku__...");
#   - tool_input = the call's arguments as plain JSON;
#   - tool_response = the MCP CallToolResult: {"content":[{"type":"text",
#     "text":"<Hiveku's answer as a JSON string>"}]}. Hiveku sets no
#     structuredContent, so every field of the answer arrives escaped one
#     level: \"versioning\":\"saved\".
#
# Ledger: ${TMPDIR:-/tmp}/hiveku-vcs/<session_id>.jsonl, one line per event,
#   {"t":<unix seconds>,"kind":"write"|"versioned","project_id":"<id>","branch":"<name>"}
# (pre-tool-use.sh adds "attempted" lines, stop.sh "notified" ones).
# Append-only, so parallel tool hooks cannot clobber each other (each line is
# far below PIPE_BUF, and >> opens with O_APPEND).

# Tools whose success changes a project's files. assets_upload is not one:
# it writes the shared asset store, which versions do not cover.
WRITE_TOOLS=" project_file_save project_file_save_async project_files_bulk_save project_file_delete project_files_bulk_delete project_file_move project_folder_create project_folder_delete project_import_finalize project_files_finalize "
# The only write tools that have a dry run. Every other tool's proxy drops a
# dry_run argument and the write runs, so there it means nothing.
DRY_RUN_TOOLS=" project_files_bulk_save project_files_bulk_delete project_import_finalize "
# The older restore lanes (they write Your site). On the current platform they
# record themselves as a version and say how in data.versioning (saved |
# included | unchanged | deferred); an answer without it comes from an older
# platform. None of them has a dry run.
RESTORE_TOOLS=" project_file_restore project_checkpoint_restore checkpoint_restore history_restore_to_time "

ID_RE='^[A-Za-z0-9-]{1,64}$'
BRANCH_RE='^[A-Za-z0-9._/-]{1,200}$'
SESSION_RE='^[A-Za-z0-9._-]{1,128}$'

HOOK_DIR=${0%/*}
[ "$HOOK_DIR" = "$0" ] && HOOK_DIR=.

# The payload up to and including its "tool_name" member, read with `read`
# (which stops exactly at each comma), so the rest of stdin is still there for
# the pass that fits the tool. Sets HEADER (the bytes read) and TOOL_NAME.
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

# The value of the first `"key":"value"` token of a kind in the arguments.
first_value() {
  printf '%s\n' "$INPUT" | sed -n "s/^\"$1\":\"\\([^\"]*\\)\"\$/\\1/p" | sed -n '1p'
}

# Order-preserving de-duplication without awk (bash 3.2, no associative arrays).
uniq_in_order() {
  local seen=' ' line
  while IFS= read -r line; do
    case "$seen" in
      *" $line "*) ;;
      *) seen="$seen$line "; printf '%s\n' "$line" ;;
    esac
  done
}

input_has() {
  printf '%s\n' "$INPUT" | grep -E -q -e "$1"
}

answer_token() {
  printf '%s\n' "$ANSWER" | grep -E -q -e "$1"
}

# An escaped answer field, \"key\":<value> (the answer is a JSON string), with
# $2 an ERE for the value. A pretty-printed answer puts \n and spaces around it.
answer_has() {
  answer_token "^(\\\\n| )*\\\\\"$1\\\\\":[[:space:]]*$2(\\\\n| )*\$"
}

normalize_branch() {
  if [ -z "$1" ] || [ "$1" = "-" ] || [ "$1" = "main" ]; then printf 'main'; else printf '%s' "$1"; fi
}

open_ledger() { # session_id -> sets LEDGER; non-zero when there is none to use
  [[ $1 =~ $SESSION_RE ]] || return 1
  local dir="${TMPDIR:-/tmp}"
  dir="${dir%/}/hiveku-vcs"
  mkdir -p "$dir" || return 1
  LEDGER="$dir/$1.jsonl"
}

record() { # kind project_id branch
  local kind=$1 pid=$2 branch
  branch=$(normalize_branch "$3")
  [[ $pid =~ $ID_RE ]] || return 0
  [[ $branch =~ $BRANCH_RE ]] || return 0
  printf '{"t":%s,"kind":"%s","project_id":"%s","branch":"%s"}\n' \
    "$(date +%s)" "$kind" "$pid" "$branch" >> "$LEDGER"
}

# hiveku_batch. The members' own answers are cut to fit one text block, so a
# member is judged on its own arguments: a file-writing member marks ITS
# project and branch as changed (a restore lane always writes Your site).
# A false positive costs one version call that answers nothing_to_commit; a
# version saved inside a batch is not credited (pre-tool-use.sh refuses a
# batch that carries one, so the person is asked about it on its own).
record_batch() {
  local session
  session=$(printf '%s' "$HEADER" | tr ',{' '\n\n' | sed -n 's/^"session_id":"\([^"\\]*\)"$/\1/p' | sed -n '1p')
  open_ledger "$session" || return 0
  declare -F batch_members >/dev/null || return 0 # json-walk.sh did not load
  local member pid branch dry
  { printf '%s' "$HEADER"; cat; } | json_tokens | batch_members | while read -r member pid branch dry; do
    case "$WRITE_TOOLS" in
      *" $member "*)
        case "$DRY_RUN_TOOLS" in *" $member "*) [ "$dry" = true ] && continue ;; esac
        printf '%s %s\n' "$pid" "$(normalize_branch "$branch")" ;;
    esac
    case "$RESTORE_TOOLS" in *" $member "*) printf '%s main\n' "$pid" ;; esac
  done | uniq_in_order | while read -r pid branch; do
    record write "$pid" "$branch"
  done
}

main() {
  read_header
  case $TOOL_NAME in
    mcp__hiveku__hiveku_batch) record_batch; return 0 ;;
  esac

  # One streaming pass pulls out only the lines the rules need, so a bulk save
  # carrying megabytes of file content costs a tr and a grep, not a parse:
  # tr puts every JSON member on its own line (it splits on , { } [ ] , which
  # never occur inside the ids, branch names and codes read here), and grep
  # keeps the lines that start with a key the rules read.
  # The lines stay in order, and the top-level "tool_response": key (unescaped,
  # so never inside a string) splits them: the arguments before it, Hiveku's
  # answer after it. Unescaped keys are read only from the arguments (file
  # contents are strings, so their quotes are escaped) and the \" keys only
  # from the answer, so a saved file whose text looks like an answer is never
  # read as one.
  local tokens
  tokens=$({ printf '%s' "$HEADER"; cat; } | tr ',{}[]' '\n\n\n\n\n' | grep -E \
    -e '^"(session_id|tool_name|project_id|branch|environment)":"[^"\\]*"$' \
    -e '^"dry_run":[[:space:]]*(true|false)$' \
    -e '^"tool_response":$' \
    -e '^"isError":[[:space:]]*true$' \
    -e '^(\\n| )*\\"(versioning|vcs_commit_id|noop|dry_run)\\":')
  printf '%s\n' "$tokens" | grep -q '^"tool_response":$' || return 0
  INPUT=$(printf '%s\n' "$tokens" | sed '/^"tool_response":$/,$d')
  ANSWER=$(printf '%s\n' "$tokens" | sed -n '/^"tool_response":$/,$p')

  local tool_name tool
  tool_name=$(first_value tool_name)
  case "$tool_name" in
    mcp__hiveku__*) tool=${tool_name#mcp__hiveku__} ;;
    *) return 0 ;;
  esac
  open_ledger "$(first_value session_id)" || return 0

  # Codex 0.131 never sends a failure here; if a later Codex does, a failure
  # records nothing (the Stop hook reads failed version calls from the
  # transcript).
  answer_token '^"isError":[[:space:]]*true$' && return 0

  local pid branch
  pid=$(first_value project_id)
  branch=$(first_value branch)

  case "$WRITE_TOOLS" in
    *" $tool "*)
      case "$DRY_RUN_TOOLS" in
        *" $tool "*) input_has '^"dry_run":[[:space:]]*true$' && return 0 ;;
      esac
      record write "$pid" "$branch"
      return 0 ;;
  esac

  case "$RESTORE_TOOLS" in
    *" $tool "*)
      if answer_has versioning '\\"(saved|included)\\"'; then
        record versioned "$pid" main
      elif answer_has versioning '\\"unchanged\\"'; then
        : # no file changed: nothing to record
      else
        record write "$pid" main
      fi
      return 0 ;;
  esac

  case "$tool" in
    project_vcs_commit)
      # A success leaves the branch versioned (with if_dirty on a clean
      # branch too: it already was).
      record versioned "$pid" "$branch" ;;
    project_vcs_rollback)
      # A dry run (the default: anything but a literal false) changes nothing.
      input_has '^"dry_run":[[:space:]]*false$' || return 0
      answer_has dry_run true && return 0
      answer_has noop true && return 0
      record versioned "$pid" "$branch" ;;
    deploy_site)
      # A production deploy saves anything pending on Your site as a version
      # and ships it; data.vcs_commit_id is that version. Without it (an older
      # platform, or the save failed and the deploy shipped unpinned) nothing
      # is known to be versioned. The route trims and lower-cases the tier
      # and takes "prod" for production.
      local environment
      environment=$(first_value environment | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      case "$environment" in production | prod) ;; *) return 0 ;; esac
      answer_has vcs_commit_id '\\"[A-Za-z0-9-]+\\"' && record versioned "$pid" main ;;
  esac
  return 0
}

export LC_ALL=C # byte-wise text tools: fast, and never trip on a locale
set -f          # values are split on whitespace below, never globbed
umask 077       # the ledger is this user's alone
. "$HOOK_DIR/json-walk.sh" 2>/dev/null
main 2>/dev/null
exit 0
