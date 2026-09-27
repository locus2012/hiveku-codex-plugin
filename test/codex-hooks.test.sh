#!/usr/bin/env bash
# Shell tests for the Codex versions hooks (plugins/hiveku/hooks/pre-tool-use.sh,
# post-tool-use.sh and stop.sh), run against fixture payloads and transcripts
# shaped like Codex 0.131's (test/fixtures/codex-hooks, see the note in each
# hook for the shape).
#
# Codex 0.131 runs PostToolUse only for a call that succeeded, so there are no
# failure payloads for post-tool-use.sh (one defensive case aside): a failed
# version call is covered end to end instead, PreToolUse attempt + transcript
# + Stop.
#
# bash with grep, sed and tr only, like the hooks, so it runs where node is absent.
# Run: bash test/codex-hooks.test.sh   (node --test also runs it, through
# test/codex-hooks.test.mjs). Exit status 0 when every case passes.
#
# Each case gets its own TMPDIR (where the ledger lives), cwd and HOME.
# Scratch goes under the system temp dir and is left for the OS to clear.

ROOT=$(cd "$(dirname "$0")/.." && pwd)
HOOKS="$ROOT/plugins/hiveku/hooks"
FIX="$ROOT/test/fixtures/codex-hooks"
BASH_BIN=${BASH:-bash} # the hooks run under the same bash as this suite
SESSION=019a0000-0000-7000-8000-00000000c0de
P1=8f14e45f-ceea-467a-9575-2f3b5e6a1c01
P2=0c7b9d2e-1a2b-4c3d-9e8f-7a6b5c4d3e02
BR=feature/new-pricing

WORK=$(mktemp -d "${TMPDIR:-/tmp}/hiveku-codex-hooks-test.XXXXXX") || exit 1
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); printf 'ok - %s\n' "$1"; }
not_ok() { FAIL=$((FAIL + 1)); printf 'not ok - %s\n' "$1"; shift; printf '  %s\n' "$@"; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else not_ok "$1" "expected: $2" "actual:   $3"; fi
}
check_match() { # name ERE actual
  if printf '%s' "$3" | grep -E -q -e "$2"; then ok "$1"; else not_ok "$1" "pattern:  $2" "actual:   $3"; fi
}

fresh() {
  CASE=$(mktemp -d "$WORK/case.XXXXXX")
  mkdir -p "$CASE/tmp" "$CASE/home/work" "$CASE/cwd"
  CWD="$CASE/cwd"
  HOME_DIR="$CASE/home"
  TRANSCRIPT="$CASE/transcript.jsonl"
  LEDGER="$CASE/tmp/hiveku-vcs/$SESSION.jsonl"
}
payload() { sed -e "s#__CWD__#$CWD#" -e "s#__TRANSCRIPT__#$TRANSCRIPT#" "$FIX/$1"; }
run_hook() { TMPDIR="$CASE/tmp/" HOME="$HOME_DIR" "$BASH_BIN" "$@"; }
post() { payload "$1" | run_hook "$HOOKS/post-tool-use.sh"; }
pre() { payload "$1" | run_hook "$HOOKS/pre-tool-use.sh"; }
stop() { payload "$1" | run_hook "$HOOKS/stop.sh"; }
transcript() { cp "$FIX/$1" "$TRANSCRIPT"; }
# The ledger as "kind project branch[ call]" lines ("" when there is none).
events() {
  [ -f "$LEDGER" ] || return 0
  sed -n \
    -e 's/^{"t":[0-9]*,"kind":"\([a-z]*\)","project_id":"\([^"]*\)","branch":"\([^"]*\)"}$/\1 \2 \3/p' \
    -e 's/^{"t":[0-9]*,"kind":"attempted","project_id":"\([^"]*\)","branch":"\([^"]*\)","call":"\([^"]*\)"}$/attempted \1 \2 \3/p' \
    "$LEDGER"
}
nl=$'\n'

block_json() { # project branch [others] -> the exact block answer
  local on='' arg=''
  if [ "$2" != main ]; then on=" on branch \`$2\`"; arg=", branch: \\\"$2\\\""; fi
  printf '{"decision":"block","reason":"Before you finish: your changes to project `%s`%s are live in the preview but not saved as a version. Call `project_vcs_commit({ project_id: \\"%s\\"%s, message: \\"a plain-language name of what changed for visitors, such as Updated the pricing section on the Home page\\" })` with NO files — one version for this piece of work. It also holds others'"'"' unsaved changes: check `project_vcs_status({ project_id, detail: \\"files\\" })` first and name it for all of it.%s If the user asked you not to save a version yet, say so in one line and stop."}' "$1" "$on" "$1" "$arg" "${3:-}"
}
notice_json() { # who -> the exact notice
  printf '{"systemMessage":"Hiveku: your changes to %s are saved but not a named version yet. Ask Codex to save one, or Hiveku saves them as a version before the next publish."}' "$1"
}
deny_json() { # names them each -> the exact deny answer
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Not run: this hiveku_batch carries %s, which Codex asks the person about before every call. Call %s on its own, not inside hiveku_batch, so the person is asked about %s; batch only the other calls"}}' "$1" "$2" "$3"
}

# ─── post-tool-use.sh: one fixture, the ledger it leaves ───────────────────

post_case() { # fixture expected-events
  fresh
  local out status
  out=$(post "$1"); status=$?
  check "post $1: exits 0" 0 "$status"
  check "post $1: prints nothing" "" "$out"
  check "post $1: ledger" "$2" "$(events)"
}

post_case post-bulk-save-main.json "write $P1 main"
post_case post-file-save-branch.json "write $P1 $BR"
post_case post-file-save-branch-main.json "write $P1 main"
post_case post-file-delete.json "write $P2 main"
post_case post-bulk-save-dry-run.json ""
post_case post-bulk-delete-dry-run.json ""
# A tool without a dry run ignores dry_run (the proxy drops it): the write ran.
post_case post-file-save-stray-dry-run.json "write $P1 main"
# The shared asset store is not versioned, so an upload is not a change to version.
post_case post-assets-upload.json ""
# Defensive: Codex 0.131 never sends a failed call here; if one arrives, nothing is recorded.
post_case post-file-save-error.json ""
post_case post-commit-main.json "versioned $P1 main"
post_case post-commit-branch.json "versioned $P1 $BR"
post_case post-commit-if-dirty-clean.json "versioned $P1 main"
post_case post-rollback-dry-run.json ""
post_case post-rollback-apply.json "versioned $P1 main"
post_case post-rollback-apply-noop.json ""
post_case post-rollback-apply-message-lookalike.json "versioned $P1 main"
post_case post-deploy-production-pinned.json "versioned $P1 main"
post_case post-deploy-production-prod.json "versioned $P1 main"
post_case post-deploy-production-unpinned.json ""
post_case post-deploy-development.json ""
post_case post-checkpoint-restore-saved.json "versioned $P1 main"
post_case post-checkpoint-restore-included.json "versioned $P1 main"
post_case post-checkpoint-restore-deferred.json "write $P1 main"
post_case post-checkpoint-restore-unchanged.json ""
# A restore has no dry run: a stray dry_run:true still restored.
post_case post-checkpoint-restore-stray-dry-run.json "write $P1 main"
post_case post-history-restore-old-platform.json "write $P1 main"
post_case post-batch-writes.json "write $P1 main${nl}write $P2 main"
post_case post-batch-branch-writes.json "write $P1 $BR"
# Each member on its own project and branch, never another member's.
post_case post-batch-mixed-branches.json "write $P1 $BR${nl}write $P2 main"
post_case post-batch-dry-run-members.json "write $P2 main${nl}write $P1 main"
post_case post-batch-nested-lookalike.json "write $P1 main"
post_case post-batch-reads.json ""
post_case post-other-server.json ""

# File content that looks like payload fields is never read as one.
fresh
post post-bulk-save-main.json >/dev/null
check "post: a project_id inside file content is ignored" 0 "$(grep -c ffffffff "$LEDGER")"

# Ledger lines are well-formed JSON-lines with a numeric time.
check_match "post: ledger line shape" \
  '^\{"t":[0-9]+,"kind":"write","project_id":"[0-9a-f-]+","branch":"main"\}$' "$(cat "$LEDGER")"

# Garbage, empty and hostile input: exit 0, no output, nothing written.
fresh
out=$(printf 'not json at all' | run_hook "$HOOKS/post-tool-use.sh"); status=$?
check "post: garbage stdin exits 0" 0 "$status"
check "post: garbage stdin prints nothing" "" "$out"
out=$(run_hook "$HOOKS/post-tool-use.sh" </dev/null); status=$?
check "post: empty stdin exits 0" 0 "$status"
payload post-bulk-save-main.json | sed "s#\"session_id\":\"$SESSION\"#\"session_id\":\"../../escaped\"#" \
  | run_hook "$HOOKS/post-tool-use.sh"
payload post-batch-writes.json | sed "s#\"session_id\":\"$SESSION\"#\"session_id\":\"../../escaped\"#" \
  | run_hook "$HOOKS/post-tool-use.sh"
check "post: a session id that is a path writes nothing" "" "$(find "$CASE" -name '*.jsonl')"
fresh
payload post-file-save-branch.json | sed "s#\"project_id\":\"$P1\"#\"project_id\":\"not-an-id!\"#" \
  | run_hook "$HOOKS/post-tool-use.sh"
payload post-file-save-branch.json | sed "s#\"branch\":\"$BR\"#\"branch\":\"has space\"#" \
  | run_hook "$HOOKS/post-tool-use.sh"
payload post-batch-mixed-branches.json | sed "s#\"branch\":\"$BR\"#\"branch\":\"has+plus\"#" \
  | sed "s#\"project_id\":\"$P2\"#\"project_id\":\"not an id\"#" | run_hook "$HOOKS/post-tool-use.sh"
check "post: a project id or branch that is not a name writes nothing" "" "$(events)"
payload post-commit-main.json | sed 's/"tool_response":/"tool_answer":/' | run_hook "$HOOKS/post-tool-use.sh"
check "post: a payload without tool_response writes nothing" "" "$(events)"

# A hook folder without json-walk.sh still records single calls, and skips batches.
fresh
mkdir -p "$CASE/plugin/hooks"
cp "$HOOKS/post-tool-use.sh" "$CASE/plugin/hooks/"
payload post-batch-writes.json | run_hook "$CASE/plugin/hooks/post-tool-use.sh"
payload post-file-delete.json | run_hook "$CASE/plugin/hooks/post-tool-use.sh"
check "post: without json-walk.sh a batch records nothing and a single write still does" "write $P2 main" "$(events)"

# Parallel tool hooks append without clobbering each other.
fresh
i=0
while [ "$i" -lt 20 ]; do
  post post-file-save-branch.json &
  i=$((i + 1))
done
wait
check "post: 20 parallel hooks leave 20 lines" 20 "$(grep -c '' "$LEDGER")"
check "post: every parallel line is whole" 20 "$(grep -c -E '^\{"t":[0-9]+,"kind":"write","project_id":"[0-9a-f-]+","branch":"feature/new-pricing"\}$' "$LEDGER")"

# ─── pre-tool-use.sh ───────────────────────────────────────────────────────

pre_case() { # fixture expected-output expected-events
  fresh
  local out status
  out=$(pre "$1"); status=$?
  check "pre $1: exits 0" 0 "$status"
  check "pre $1: output" "$2" "$out"
  check "pre $1: ledger" "$3" "$(events)"
}

pre_case pre-commit-main.json "" "attempted $P1 main call_commit_1"
pre_case pre-commit-branch.json "" "attempted $P1 $BR call_commit_2"
# File content and a nested key that look like fields are never read as the call's.
pre_case pre-commit-lookalike.json "" "attempted $P1 main call_commit_1"
pre_case pre-rollback-apply.json "" "attempted $P1 main call_rollback_1"
# A rollback is a dry run unless dry_run is literally false.
pre_case pre-rollback-dry-run.json "" ""
pre_case pre-rollback-dry-run-string.json "" ""
pre_case pre-batch-reads.json "" ""
# A tool name inside a member's arguments or a string is not a member.
pre_case pre-batch-lookalike.json "" ""
pre_case pre-other-server.json "" ""
pre_case pre-batch-rollback.json \
  "$(deny_json project_vcs_rollback it 'that call')" ""
# Every tool .mcp.json sets to prompt, each named once, in order.
pre_case pre-batch-prompt-tools.json \
  "$(deny_json 'deploy_site, project_files_bulk_save' 'each of them' 'each call')" ""

# Without .mcp.json the version tools and deploy_site are still refused.
fresh
mkdir -p "$CASE/plugin/hooks"
cp "$HOOKS/pre-tool-use.sh" "$HOOKS/json-walk.sh" "$CASE/plugin/hooks/"
out=$(payload pre-batch-prompt-tools.json | run_hook "$CASE/plugin/hooks/pre-tool-use.sh")
check "pre: without .mcp.json deploy_site is still refused" "$(deny_json deploy_site it 'that call')" "$out"
# Without json-walk.sh a batch is let through (failure-open) and attempts are still recorded.
cp "$ROOT/plugins/hiveku/.mcp.json" "$CASE/plugin/"
mv "$CASE/plugin/hooks/json-walk.sh" "$CASE/plugin/json-walk.sh.away"
out=$(payload pre-batch-rollback.json | run_hook "$CASE/plugin/hooks/pre-tool-use.sh"); status=$?
check "pre: without json-walk.sh a batch exits 0" 0 "$status"
check "pre: without json-walk.sh a batch is not refused" "" "$out"
payload pre-commit-main.json | run_hook "$CASE/plugin/hooks/pre-tool-use.sh"
check "pre: without json-walk.sh an attempt is still recorded" "attempted $P1 main call_commit_1" "$(events)"

fresh
out=$(printf '{"session_id":' | run_hook "$HOOKS/pre-tool-use.sh"); status=$?
check "pre: garbage stdin exits 0" 0 "$status"
check "pre: garbage stdin prints nothing" "" "$out"
payload pre-commit-main.json | sed 's/"tool_use_id":"call_commit_1"/"tool_use_id":"call \\"x"/' \
  | run_hook "$HOOKS/pre-tool-use.sh"
check "pre: a call id that is not a name records nothing" "" "$(events)"

# ─── stop.sh ───────────────────────────────────────────────────────────────

fresh
out=$(stop stop.json); status=$?
check "stop: no ledger exits 0" 0 "$status"
check "stop: no ledger says nothing" "" "$out"

fresh
post post-bulk-save-main.json; post post-commit-main.json
check "stop: write then version says nothing" "" "$(stop stop.json)"

fresh
post post-bulk-save-main.json
check "stop: an unversioned write on Your site blocks with the exact reason" "$(block_json "$P1" main)" "$(stop stop.json)"
check "stop: blocking records nothing" "write $P1 main" "$(events)"

fresh
post post-file-save-branch.json
check "stop: an unversioned write on a branch names the branch" "$(block_json "$P1" "$BR")" "$(stop stop.json)"

fresh
post post-commit-main.json; post post-bulk-save-main.json
check "stop: a write after the version still blocks" "$(block_json "$P1" main)" "$(stop stop.json)"

# A version call that failed: PreToolUse saw the attempt, PostToolUse never
# ran, and the transcript says how it ended.
fresh
post post-bulk-save-main.json; pre pre-commit-main.json
transcript transcript-commit-nothing-to-commit.jsonl
check "stop: a commit answered nothing_to_commit counts as a version" "" "$(stop stop-transcript.json)"
check "stop: ... and nothing is told to the person either" "" "$(stop stop-transcript-active.json)"

fresh
post post-bulk-save-main.json; pre pre-commit-main.json
transcript transcript-commit-branch-busy.jsonl
check "stop: a commit that failed otherwise still blocks" "$(block_json "$P1" main)" "$(stop stop-transcript.json)"
check "stop: ... and with stop_hook_active the person is told" "$(notice_json 'Your site')" "$(stop stop-transcript-active.json)"

fresh
post post-bulk-save-main.json; pre pre-commit-main.json
transcript transcript-commit-hint-mentions-code.jsonl
check "stop: nothing_to_commit in another field is not the code" "$(block_json "$P1" main)" "$(stop stop-transcript.json)"

fresh
post post-bulk-save-main.json; pre pre-commit-main.json
transcript transcript-commit-unanswered.jsonl
check "stop: an attempt with no answer in the transcript does not block" "" "$(stop stop-transcript.json)"
check "stop: ... and sends no notice" "" "$(stop stop-transcript-active.json)"
check "stop: ... and records nothing" "write $P1 main${nl}attempted $P1 main call_commit_1" "$(events)"
check "stop: an attempt with no transcript (null) does not block" "" "$(stop stop.json)"
TRANSCRIPT="$CASE/missing.jsonl"
check "stop: an attempt whose transcript is missing does not block" "" "$(stop stop-transcript.json)"
TRANSCRIPT="$CASE/transcript.jsonl"
post post-file-save-branch-main.json
check "stop: a write after an unsettled attempt blocks again" "$(block_json "$P1" main)" "$(stop stop-transcript.json)"

fresh
post post-bulk-save-main.json; pre pre-commit-main.json; post post-commit-main.json
check "stop: an attempt that then succeeded needs no transcript" "" "$(stop stop.json)"

fresh
post post-deploy-production-pinned.json; pre pre-rollback-apply.json
transcript transcript-rollback-incomplete.jsonl
check "stop: rollback_incomplete leaves changes that are not a version" "$(block_json "$P1" main)" "$(stop stop-transcript.json)"

fresh
post post-deploy-production-pinned.json; pre pre-rollback-apply.json
transcript transcript-rollback-branch-changed.jsonl
check "stop: a refused rollback changed nothing" "" "$(stop stop-transcript.json)"

fresh
post post-bulk-save-main.json; pre pre-rollback-dry-run.json
transcript transcript-rollback-incomplete.jsonl
check "stop: a rollback dry run is no attempt" "$(block_json "$P1" main)" "$(stop stop-transcript.json)"

# stop_hook_active: tell the person once, never block again, then stay quiet
# until the session writes to that pair again.
fresh
post post-bulk-save-main.json
out=$(stop stop-active.json)
check "stop: stop_hook_active gives only a systemMessage, in plain words" "$(notice_json 'Your site')" "$out"
check "stop: stop_hook_active records the notice" "write $P1 main${nl}notified $P1 main" "$(events)"
check "stop: after the notice the next stop is quiet" "" "$(stop stop.json)"
check "stop: a second active stop is quiet too" "" "$(stop stop-active.json)"
post post-file-save-branch-main.json
check "stop: a new write after the notice blocks again" "$(block_json "$P1" main)" "$(stop stop.json)"

fresh
post post-file-save-branch.json; post post-file-delete.json
check "stop: the notice names a branch plainly and joins pairs, most recent first" \
  "$(notice_json 'Your site and the branch \"feature/new-pricing\"')" "$(stop stop-active.json)"

fresh
post post-bulk-save-main.json; post post-file-delete.json
check "stop: the notice counts projects instead of naming ids" \
  "$(notice_json 'Your site on 2 projects')" "$(stop stop-active.json)"

fresh
post post-commit-main.json
check "stop: stop_hook_active with nothing waiting says nothing" "" "$(stop stop-active.json)"

# Several pairs: the most recent first, two more named, the rest counted.
fresh
post post-bulk-save-main.json   # P1 main
post post-file-delete.json      # P2 main
post post-file-save-branch.json # P1 branch (most recent)
check "stop: several pairs, most recent first, before the last sentence" \
  "$(block_json "$P1" "$BR" " Do the same for project \`$P2\`. Do the same for project \`$P1\`.")" "$(stop stop.json)"

fresh
mkdir -p "$(dirname "$LEDGER")"
for b in one two three four five; do
  printf '{"t":1,"kind":"write","project_id":"%s","branch":"%s"}\n' "$P1" "$b" >> "$LEDGER"
done
check_match "stop: two pairs past the named three are counted" \
  'on branch `five`.*name it for all of it\. Do the same for project `[^`]*` on branch `four`\. Do the same for project `[^`]*` on branch `three`\. 2 more projects or branches also have changes that are not a version yet\. If the user asked' \
  "$(stop stop.json)"
printf '{"t":1,"kind":"versioned","project_id":"%s","branch":"one"}\n' "$P1" >> "$LEDGER"
check_match "stop: one pair past the named three reads in the singular" \
  ' 1 more project or branch also has changes that are not a version yet\. If the user asked you not to save a version yet' "$(stop stop.json)"

# Opt-out: the nearest .hiveku/guardrails.json below the home folder decides,
# by its top-level "version_reminder".
fresh
post post-bulk-save-main.json
mkdir -p "$CWD/.hiveku"
printf '{ "version_reminder": false }\n' > "$CWD/.hiveku/guardrails.json"
check "stop: version_reminder false in the folder turns it off" "" "$(stop stop.json)"
check "stop: turned off, stop_hook_active says nothing too" "" "$(stop stop-active.json)"

fresh
post post-bulk-save-main.json
mkdir -p "$CWD/.hiveku" "$CWD/site/src"
printf '{"other_guardrail": true,\n "version_reminder":false}\n' > "$CWD/.hiveku/guardrails.json"
out=$(sed "s#__CWD__#$CWD/site/src#" "$FIX/stop.json" | run_hook "$HOOKS/stop.sh")
check "stop: version_reminder false in a parent folder turns it off" "" "$out"
mkdir -p "$CWD/site/.hiveku"
printf '{"version_reminder": true}\n' > "$CWD/site/.hiveku/guardrails.json"
out=$(sed "s#__CWD__#$CWD/site/src#" "$FIX/stop.json" | run_hook "$HOOKS/stop.sh")
check "stop: a nearer version_reminder true wins over a parent false" "$(block_json "$P1" main)" "$out"
printf '{"deploy_confirm": false}\n' > "$CWD/site/.hiveku/guardrails.json"
out=$(sed "s#__CWD__#$CWD/site/src#" "$FIX/stop.json" | run_hook "$HOOKS/stop.sh")
check "stop: a nearer file without the key keeps it on over a parent false" "$(block_json "$P1" main)" "$out"

fresh
post post-bulk-save-main.json
mkdir -p "$CWD/.hiveku"
printf '{"deploy_confirm": false}\n' > "$CWD/.hiveku/guardrails.json"
check "stop: a guardrails file without the key does not turn it off" "$(block_json "$P1" main)" "$(stop stop.json)"
printf '{"deploys": {"version_reminder": false}, "note": "version_reminder: false"}\n' > "$CWD/.hiveku/guardrails.json"
check "stop: only a top-level version_reminder counts" "$(block_json "$P1" main)" "$(stop stop.json)"
printf '{"version_reminder": false\n' > "$CWD/.hiveku/guardrails.json"
check "stop: a malformed file does not turn it off" "$(block_json "$P1" main)" "$(stop stop.json)"

fresh
post post-bulk-save-main.json
mkdir -p "$HOME_DIR/.hiveku"
printf '{"version_reminder": false}\n' > "$HOME_DIR/.hiveku/guardrails.json"
CWD="$HOME_DIR/work"
check "stop: a guardrails file in the home folder is not read" "$(block_json "$P1" main)" "$(stop stop.json)"

# Failure-open.
fresh
post post-bulk-save-main.json
printf 'garbage line\n{"t":1,"kind":"write","project_id":"not an id","branch":"main"}\n{"kind":"write"}\n{"t":1,"kind":"attempted","project_id":"%s","branch":"main","call":"bad id"}\n' "$P2" >> "$LEDGER"
check "stop: malformed ledger lines are ignored" "$(block_json "$P1" main)" "$(stop stop.json)"
chmod 000 "$LEDGER"
out=$(stop stop.json); status=$?
chmod 600 "$LEDGER"
check "stop: an unreadable ledger exits 0" 0 "$status"
check "stop: an unreadable ledger says nothing" "" "$out"
out=$(printf '{"session_id":' | run_hook "$HOOKS/stop.sh"); status=$?
check "stop: garbage stdin exits 0" 0 "$status"
check "stop: garbage stdin says nothing" "" "$out"

printf '# pass %s fail %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
