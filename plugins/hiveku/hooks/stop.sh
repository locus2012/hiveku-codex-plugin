#!/usr/bin/env bash
# Hiveku plugin for Codex: Stop hook, the versions reminder (part 3 of 3;
# hooks/post-tool-use.sh and hooks/pre-tool-use.sh keep the ledger this reads).
#
# When this session changed a Hiveku website project and did not save the
# change as a version, the agent is asked once, before it finishes, to save
# ONE version with a plain-language name. Same rules as the Claude Code
# plugin's Stop hook (notes/DESIGN-versions-and-rollback-2026-09-24.md,
# sections E1 and E2) without its network confirm: this file never reads a
# credential and never calls Hiveku, so it trusts the ledger.
#
#   1. Opt-out: the nearest .hiveku/guardrails.json, walking up from the
#      session's cwd and stopping below the home folder (the same lookup as
#      the Claude Code plugin), decides: its top-level "version_reminder":
#      false turns this off; a file without it keeps the reminder on.
#   2. Fold the ledger: a project/branch pair is waiting when its latest event
#      is a write. None waiting: exit quietly (one file read).
#      An "attempted" line (a version call pre-tool-use.sh saw start, which no
#      later line settles) is resolved from the transcript Codex names in
#      transcript_path, because Codex 0.131 runs PostToolUse only for calls
#      that succeeded: an answer with code nothing_to_commit counts as a
#      version, rollback_incomplete as a write, any other answer (another
#      error, a declined call) leaves the pair as it was. When the call's
#      answer cannot be found (no transcript, unreadable, not written yet) the
#      pair is UNKNOWN: it is neither blocked on nor reported to the person.
#   3. stop_hook_active (Codex is finishing a turn this hook already asked
#      about): never ask again. Tell the person once in a systemMessage, record
#      that ("notified"), and exit. A pair stays quiet after that until the
#      session writes to it again.
#   4. Otherwise block with the reason, naming the most recent pair (and up to
#      two more, before the reason's last sentence).
#   5. Failure-open: any error exits 0 with no output.
#
# Codex 0.131 sends (hooks/src/schema.rs, StopCommandInput): session_id,
# turn_id, transcript_path (a string or null), cwd, hook_event_name, model,
# permission_mode, stop_hook_active (required boolean), last_assistant_message,
# in that order, as one compact JSON object. It reads {"decision":"block",
# "reason":...} as "continue the turn with this reason as the prompt" and
# {"systemMessage":...} as a warning shown to the person
# (hooks/src/events/stop.rs). The reason reaches the model HTML-escaped, so
# it carries no angle brackets.
#
# bash with grep, sed and tr only (node may be absent on a brew install); bash 3.2 safe.

ID_RE='^[A-Za-z0-9-]{1,64}$'
BRANCH_RE='^[A-Za-z0-9._/-]{1,200}$'
SESSION_RE='^[A-Za-z0-9._-]{1,128}$'
CALL_RE='^[A-Za-z0-9_.:-]{1,128}$'
MAX_NAMED=3

HOOK_DIR=${0%/*}
[ "$HOOK_DIR" = "$0" ] && HOOK_DIR=.

# 0 = the reminder is turned off for this folder.
opted_out() {
  local dir=${1%/} home=${HOME%/} hops=0 file
  [ -n "$dir" ] || return 1
  declare -F top_level_scalar >/dev/null || return 1 # json-walk.sh did not load
  while [ "$hops" -lt 20 ]; do
    { [ -z "$dir" ] || [ "$dir" = "$home" ]; } && return 1
    file="$dir/.hiveku/guardrails.json"
    if [ -f "$file" ] && [ -r "$file" ]; then
      [ "$(json_tokens < "$file" | top_level_scalar version_reminder)" = false ] && return 0
      return 1
    fi
    dir=${dir%/*}
    hops=$((hops + 1))
  done
  return 1
}

# How each attempted call ended, from the transcript: "|<call>=<outcome>|"
# entries, outcome nothing_to_commit | rollback_incomplete | other. A call
# with no answer line is absent. One pass over the transcript for all calls.
call_outcomes() { # transcript call...
  local transcript=$1 call line code patterns=()
  shift
  [ -n "$transcript" ] && [ -f "$transcript" ] && [ -r "$transcript" ] || return 0
  for call in "$@"; do patterns+=(-e "\"call_id\":\"$call\""); done
  [ "${#patterns[@]}" -gt 0 ] || return 0
  printf '|'
  grep -F "${patterns[@]}" "$transcript" \
    | grep -E '"type":"(function_call_output|mcp_tool_call_end)","call_id":"' \
    | while IFS= read -r line; do
        call=$(printf '%s\n' "$line" | sed -E -n 's/.*"type":"(function_call_output|mcp_tool_call_end)","call_id":"([^"]*)".*/\2/p' | sed -n '1p')
        [[ $call =~ $CALL_RE ]] || continue
        # The answer is escaped once (mcp_tool_call_end) or twice
        # (function_call_output): \"code\":\"nothing_to_commit\".
        if printf '%s\n' "$line" | grep -E -q 'code(\\)*"[[:space:]]*:[[:space:]]*(\\)*"nothing_to_commit(\\)*"'; then
          code=nothing_to_commit
        elif printf '%s\n' "$line" | grep -E -q 'code(\\)*"[[:space:]]*:[[:space:]]*(\\)*"rollback_incomplete(\\)*"'; then
          code=rollback_incomplete
        else
          code=other
        fi
        printf '%s=%s|' "$call" "$code"
      done
}

# The latest state per pair, as "|<project> <branch>=<kind>|" entries ordered
# oldest-updated first. Only lines in these hooks' own format are read.
# $2: call outcomes (call_outcomes); "raw" keeps attempted lines unresolved.
fold_ledger() { # ledger outcomes|raw
  local lines kind pid branch call key state=''
  lines=$(sed -n \
    -e 's/^{"t":[0-9]*,"kind":"\([a-z]*\)","project_id":"\([A-Za-z0-9-]*\)","branch":"\([A-Za-z0-9._\/-]*\)"}$/\1 \2 \3 -/p' \
    -e 's/^{"t":[0-9]*,"kind":"attempted","project_id":"\([A-Za-z0-9-]*\)","branch":"\([A-Za-z0-9._\/-]*\)","call":"\([A-Za-z0-9_.:-]*\)"}$/attempted \1 \2 \3/p' \
    "$1")
  while read -r kind pid branch call; do
    [[ $pid =~ $ID_RE ]] || continue
    [[ $branch =~ $BRANCH_RE ]] || continue
    case "$kind" in
      write | versioned | notified) ;;
      attempted)
        [[ $call =~ $CALL_RE ]] || continue
        if [ "$2" != raw ]; then
          case "$2" in
            *"|$call=nothing_to_commit|"*) kind=versioned ;;
            *"|$call=rollback_incomplete|"*) kind=write ;;
            *"|$call=other|"*) continue ;;
            *) kind=unknown ;;
          esac
        fi ;;
      *) continue ;;
    esac
    key="$pid $branch"
    state=${state//"|$key=write|"/}
    state=${state//"|$key=versioned|"/}
    state=${state//"|$key=notified|"/}
    state=${state//"|$key=attempted|"/}
    state=${state//"|$key=unknown|"/}
    state="$state|$key=$kind|"
  done <<< "$lines"
  printf '%s' "$state"
}

json_string() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# The waiting pairs as the person reads them: "Your site", "the branch "x"",
# one project named plainly, several counted ("Your site on 2 projects").
# Most recent first. Never an id.
person_names() { # pair...
  local pair branch names=() counts=() i found out='' n
  for pair in "$@"; do
    branch=${pair#* }
    found=''
    i=0
    while [ "$i" -lt "${#names[@]}" ]; do
      if [ "${names[$i]}" = "$branch" ]; then
        counts[$i]=$((counts[$i] + 1))
        found=1
        break
      fi
      i=$((i + 1))
    done
    [ -n "$found" ] || { names+=("$branch"); counts+=(1); }
  done
  n=${#names[@]}
  i=0
  while [ "$i" -lt "$n" ]; do
    if [ "$i" -gt 0 ] && [ "$i" -eq $((n - 1)) ]; then
      out="$out and "
    elif [ "$i" -gt 0 ]; then
      out="$out, "
    fi
    if [ "${names[$i]}" = main ]; then out="${out}Your site"; else out="${out}the branch \"${names[$i]}\""; fi
    [ "${counts[$i]}" -gt 1 ] && out="$out on ${counts[$i]} projects"
    i=$((i + 1))
  done
  printf '%s' "$out"
}

# The reason for one pair; $3 (other pairs) goes before its last sentence.
block_reason() { # project branch [others]
  local on_branch='' branch_arg=''
  if [ "$2" != main ]; then
    on_branch=" on branch \`$2\`"
    branch_arg=", branch: \"$2\""
  fi
  printf '%s' "Before you finish: your changes to project \`$1\`$on_branch are live in the preview but not saved as a version. Call \`project_vcs_commit({ project_id: \"$1\"$branch_arg, message: \"a plain-language name of what changed for visitors, such as Updated the pricing section on the Home page\" })\` with NO files — one version for this piece of work. It also holds others' unsaved changes: check \`project_vcs_status({ project_id, detail: \"files\" })\` first and name it for all of it.${3:-} If the user asked you not to save a version yet, say so in one line and stop."
}

main() {
  local tokens session cwd transcript active=false
  tokens=$(grep -o -E \
    -e '"session_id":"[^"\\]*"' \
    -e '"transcript_path":("([^"\\]|\\.)*"|null)' \
    -e '"cwd":"([^"\\]|\\.)*"' \
    -e '"stop_hook_active":[[:space:]]*(true|false)')
  [ -n "$tokens" ] || return 0
  session=$(printf '%s\n' "$tokens" | sed -n 's/^"session_id":"\(.*\)"$/\1/p' | sed -n '1p')
  cwd=$(printf '%s\n' "$tokens" | sed -n 's/^"cwd":"\(.*\)"$/\1/p' | sed -n '1p' \
    | sed -e 's/\\"/"/g' -e 's/\\\//\//g' -e 's/\\\\/\\/g')
  transcript=$(printf '%s\n' "$tokens" | sed -n 's/^"transcript_path":"\(.*\)"$/\1/p' | sed -n '1p' \
    | sed -e 's/\\"/"/g' -e 's/\\\//\//g' -e 's/\\\\/\\/g')
  printf '%s\n' "$tokens" | grep -E -q '^"stop_hook_active":[[:space:]]*true$' && active=true
  [[ $session =~ $SESSION_RE ]] || return 0

  local dir="${TMPDIR:-/tmp}"
  local ledger="${dir%/}/hiveku-vcs/$session.jsonl"
  [ -f "$ledger" ] || return 0

  # Anything waiting or unsettled at all? Most stops end here.
  local state
  state=$(fold_ledger "$ledger" raw)
  case "$state" in *'=write|'* | *'=attempted|'*) ;; *) return 0 ;; esac

  opted_out "${cwd:-$PWD}" && return 0

  # Settle attempted version calls from the transcript (one pass for all).
  case "$state" in
    *'=attempted|'*)
      local calls
      calls=$(sed -n 's/^{"t":[0-9]*,"kind":"attempted","project_id":"[^"]*","branch":"[^"]*","call":"\([A-Za-z0-9_.:-]*\)"}$/\1/p' "$ledger")
      # shellcheck disable=SC2086 # call ids are [A-Za-z0-9_.:-]: split, never globbed
      state=$(fold_ledger "$ledger" "$(call_outcomes "$transcript" $calls)") ;;
  esac

  # Waiting pairs ("<project> <branch>"), most recently written first.
  local rest entry pairs=() pair
  rest=$state
  while [ -n "$rest" ]; do
    rest=${rest#|}
    entry=${rest%%|*}
    case "$rest" in *'|'*) rest=${rest#*|} ;; *) rest='' ;; esac
    [ "${entry##*=}" = write ] && pairs=("${entry%=*}" "${pairs[@]}")
  done
  local count=${#pairs[@]}
  [ "$count" -gt 0 ] || return 0

  if [ "$active" = true ]; then
    local now
    now=$(date +%s)
    for pair in "${pairs[@]}"; do
      printf '{"t":%s,"kind":"notified","project_id":"%s","branch":"%s"}\n' \
        "$now" "${pair%% *}" "${pair#* }" >> "$ledger"
    done
    printf '{"systemMessage":"%s"}\n' "$(json_string "Hiveku: your changes to $(person_names "${pairs[@]}") are saved but not a named version yet. Ask Codex to save one, or Hiveku saves them as a version before the next publish.")"
    return 0
  fi

  local others='' more=0 n=0
  for pair in "${pairs[@]:1}"; do
    n=$((n + 1))
    if [ "$n" -lt "$MAX_NAMED" ]; then
      if [ "${pair#* }" = main ]; then
        others="$others Do the same for project \`${pair%% *}\`."
      else
        others="$others Do the same for project \`${pair%% *}\` on branch \`${pair#* }\`."
      fi
    else
      more=$((more + 1))
    fi
  done
  if [ "$more" -eq 1 ]; then
    others="$others 1 more project or branch also has changes that are not a version yet."
  elif [ "$more" -gt 1 ]; then
    others="$others $more more projects or branches also have changes that are not a version yet."
  fi
  printf '{"decision":"block","reason":"%s"}\n' \
    "$(json_string "$(block_reason "${pairs[0]%% *}" "${pairs[0]#* }" "$others")")"
  return 0
}

export LC_ALL=C # byte-wise text tools: fast, and never trip on a locale
set -f          # no value is ever globbed
umask 077
. "$HOOK_DIR/json-walk.sh" 2>/dev/null
out=$(main 2>/dev/null)
[ -n "$out" ] && printf '%s\n' "$out"
exit 0
