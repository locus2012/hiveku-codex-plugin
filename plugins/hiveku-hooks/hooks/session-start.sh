#!/usr/bin/env bash
# Hiveku hooks plugin for Codex: SessionStart hook. Speaks up only with what's load-bearing:
# a missing key (the hiveku MCP would silently fail to authenticate), the
# disciplines that prevent the most common incidents, and the rule that Hiveku
# Memory is the source of truth (skills load only when the model opens them;
# this channel reaches every session). Kept to a few lines so it informs
# without nagging.
#
# Which key the session's hiveku server uses (HK-897, Codex 0.165.0). The
# plugin's .mcp.json declares `hiveku` with bearer_token_env_var HIVEKU_TOKEN.
# A Codex config.toml that defines [mcp_servers.hiveku] (a folder set up by
# Hiveku Desktop, hiveku-sync or the VS Code extension, with the account's own
# Authorization header) REPLACES that entry whole in a session started in that
# folder: a configured server outranks a plugin's server of the same name
# (codex-mcp catalog.rs, RegistrationPrecedence Config over Plugin), so
# HIVEKU_TOKEN is not used there and is not needed. Codex merges the config
# layers key by key first: ~/.codex/config.toml (or $CODEX_HOME's), then each
# .codex/config.toml from the project root (the nearest folder up with a .git)
# down to the session's folder, or that folder's alone when there is no .git.
# This hook reads the same files to say which key the session has. It reads
# key NAMES only: every quoted value is blanked before a line is looked at,
# except an environment variable's name, so no key is ever read out. It cannot
# see whether Codex trusts the folder (an untrusted folder's config is not
# loaded), and it never contacts Hiveku.
#
# bash with grep, sed and tr only (node may be absent on a brew install); bash 3.2 safe.
set -u

VAR_RE='^[A-Za-z_][A-Za-z0-9_]{0,127}$'

# The session's folder: "cwd" from the SessionStart payload Codex writes to stdin
# (hooks/src/schema.rs, SessionStartCommandInput), else the folder Codex runs the
# hook in (the same one). Never a relative or missing folder.
session_dir() {
  local input='' dir=''
  [ -t 0 ] || input=$(head -c 65536 2>/dev/null)
  dir=$(printf '%s' "$input" | grep -o -E '"cwd"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' | sed -n '1p' \
    | sed -E -e 's/^"cwd"[[:space:]]*:[[:space:]]*"//' -e 's/"$//' \
    | sed -e 's/\\"/"/g' -e 's/\\\//\//g' -e 's/\\\\/\\/g')
  case $dir in
    /*) [ -d "$dir" ] && { printf '%s' "$dir"; return 0; } ;;
  esac
  printf '%s' "$PWD"
}

# The folders whose .codex/config.toml Codex reads for a session in $1, one per
# line, outermost first: the project root down to $1, or $1 alone when no
# folder up from it has a .git (a folder holding HEAD, or a worktree's file),
# as Codex's default project_root_markers find it (config/src/loader/mod.rs).
project_layers() {
  local dir=${1%/} chain='' hops=0 parent
  [ -n "$dir" ] || dir=/
  while [ "$hops" -lt 64 ]; do
    chain="$dir"$'\n'"$chain"
    if { [ -d "$dir/.git" ] && [ -e "$dir/.git/HEAD" ]; } || [ -f "$dir/.git" ]; then
      printf '%s' "$chain"
      return 0
    fi
    [ "$dir" = / ] && break
    parent=${dir%/*}
    dir=${parent:-/}
    hops=$((hops + 1))
  done
  printf '%s\n' "${1%/}"
}

# One config.toml with every quoted value blanked to _, except the variable
# NAME of bearer_token_env_var and of an Authorization entry in an inline
# env_http_headers, which are kept as KEY=NAME. Comments are dropped.
key_names_only() {
  sed -E \
    -e 's/^[[:space:]]+//' \
    -e '/^#/d' \
    -e 's/^bearer_token_env_var[[:space:]]*=[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)"[[:space:]]*(#.*)?$/bearer_token_env_var=\1/' \
    -e 's/^env_http_headers[[:space:]]*=.*"?[Aa][Uu][Tt][Hh][Oo][Rr][Ii][Zz][Aa][Tt][Ii][Oo][Nn]"?[[:space:]]*=[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)".*$/env_http_headers=\1/' \
    -e 's/=[[:space:]]*"([^"\\]|\\.)*"/=_/g' \
    -e "s/=[[:space:]]*'[^']*'/=_/g" \
    -e 's/[[:space:]]*#.*$//' \
    "$1" 2>/dev/null
}

# What one config.toml says about the hiveku server, one fact per line:
# "entry" (it defines [mcp_servers.hiveku]), "bearer NAME", "header" (an
# Authorization header of its own), "envheader NAME", "enabled true|false".
hiveku_entry() {
  local file=$1 line table='' head
  [ -f "$file" ] && [ -r "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in
      '['*)
        head=$(printf '%s' "$line" | tr -d " \t\"'")
        case $head in
          '[mcp_servers.hiveku]') table=main; echo entry ;;
          '[mcp_servers.hiveku.http_headers]') table=headers; echo entry ;;
          *) table='' ;;
        esac
        continue ;;
    esac
    case $table in
      main)
        case $line in
          bearer_token_env_var=*)
            echo "bearer ${line#bearer_token_env_var=}" ;;
          env_http_headers=*)
            [ "${line#env_http_headers=}" = _ ] || echo "envheader ${line#env_http_headers=}" ;;
          http_headers*)
            printf '%s\n' "$line" | grep -q -i 'authorization' && echo header ;;
          enabled*)
            printf '%s\n' "$line" | grep -q -E '^enabled[[:space:]]*=[[:space:]]*false' && echo 'enabled false'
            printf '%s\n' "$line" | grep -q -E '^enabled[[:space:]]*=[[:space:]]*true' && echo 'enabled true' ;;
        esac ;;
      headers)
        printf '%s\n' "$line" | grep -q -i -E '^"?authorization"?[[:space:]]*=' && echo header ;;
    esac
  done < <(key_names_only "$file")
}

# Which key the session's hiveku server has, from the merged layers:
#   token              no config entry; the plugin's, with HIVEKU_TOKEN set
#   none               no config entry and no HIVEKU_TOKEN
#   own home|folder    the entry's own Authorization header (in the Codex home's config, or a folder's)
#   var NAME           the entry's bearer_token_env_var or env_http_headers variable, set
#   missing NAME       that variable is not set
#   var-merged NAME, missing-merged NAME
#                      the same for the Codex home's bearer_token_env_var merged into a
#                      folder's entry that has its own key: once NAME is set, Codex sends
#                      NAME's key in place of the folder's own (rmcp-client
#                      http_client_adapter.rs sets the bearer over a configured
#                      Authorization header; confirmed with Codex 0.165.0)
#   nokey              an entry with no key at all
#   off                the entry is switched off (enabled = false)
key_source() {
  local cwd=$1 home_cfg='' file fact seen=0 bearer='' bearer_home=0 header='' envheader='' enabled='' value merged
  if [ -n "${CODEX_HOME:-}" ]; then
    home_cfg="${CODEX_HOME%/}/config.toml"
  elif [ -n "${HOME:-}" ]; then
    home_cfg="${HOME%/}/.codex/config.toml"
  fi
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    while IFS= read -r fact; do
      case $fact in
        entry) seen=1 ;;
        'bearer '*)
          bearer=${fact#bearer }
          if [ "$file" = "$home_cfg" ]; then bearer_home=1; else bearer_home=0; fi ;;
        header)
          if [ "$file" = "$home_cfg" ]; then header=${header:-home}; else header=folder; fi ;;
        'envheader '*) envheader=${fact#envheader } ;;
        'enabled '*) enabled=${fact#enabled } ;;
      esac
    done < <(hiveku_entry "$file")
  done < <(
    [ -n "$home_cfg" ] && printf '%s\n' "$home_cfg"
    project_layers "$cwd" | while IFS= read -r dir; do
      [ -n "$dir" ] && printf '%s\n' "${dir%/}/.codex/config.toml"
    done
  )

  if [ "$seen" = 0 ]; then
    if [ -n "${HIVEKU_TOKEN:-}" ]; then echo token; else echo none; fi
    return 0
  fi
  [ "$enabled" = false ] && { echo off; return 0; }
  # bearer_token_env_var wins: Codex resolves it before any header and refuses
  # to start the server when the variable is unset (rmcp_client.rs).
  if [[ $bearer =~ $VAR_RE ]]; then
    value=${!bearer:-}
    merged=''
    [ "$bearer_home" = 1 ] && [ "$header" = folder ] && merged='-merged'
    if [ -n "$value" ]; then echo "var$merged $bearer"; else echo "missing$merged $bearer"; fi
    return 0
  fi
  [ -n "$header" ] && { echo "own $header"; return 0; }
  if [[ $envheader =~ $VAR_RE ]]; then
    value=${!envheader:-}
    if [ -n "$value" ]; then echo "var $envheader"; else echo "missing $envheader"; fi
    return 0
  fi
  echo nokey
}

source=$(key_source "$(session_dir)")
case $source in
  token) via='HIVEKU_TOKEN set' ;;
  'own home') via="the account key in your Codex config.toml, used instead of HIVEKU_TOKEN" ;;
  'own folder') via="this folder's own account key in its .codex/config.toml, which Codex uses instead of HIVEKU_TOKEN once it trusts the folder" ;;
  'var '*) via="${source#var } set, as the Codex config here asks" ;;
  'var-merged '*) via="${source#var-merged } set, which Codex sends in place of this folder's own key because the [mcp_servers.hiveku] entry in your Codex home's config.toml names it, so check that get_account_info names this folder's account" ;;
  'missing-merged '*)
    echo "Hiveku: ${source#missing-merged } is not set, and the [mcp_servers.hiveku] entry in your Codex home's config.toml names it (bearer_token_env_var). Codex merges that entry into this folder's own, so the hiveku MCP server will not start even though this folder has its own key. Take bearer_token_env_var, or the whole entry, out of your Codex home's config.toml: the hiveku plugin already provides the server. Setting ${source#missing-merged } instead would start the server with that key in place of this folder's own."
    exit 0 ;;
  'missing '*)
    echo "Hiveku: ${source#missing } is not set, and the Codex config here names it for the hiveku MCP server, so the server will not authenticate (tools will 401 or not load). Set ${source#missing } to your account key from app.hiveku.com, or run the hiveku-connect skill."
    exit 0 ;;
  nokey)
    echo "Hiveku: the Codex config here defines the hiveku MCP server without an account key (no Authorization header and no bearer_token_env_var), and it replaces the plugin's, so HIVEKU_TOKEN is not used and the tools will 401. Run the hiveku-connect skill."
    exit 0 ;;
  off)
    echo "Hiveku: the hiveku MCP server is switched off here (enabled = false in a Codex config.toml), so no Hiveku tools load in this session."
    exit 0 ;;
  *)
    echo "Hiveku: HIVEKU_TOKEN is not set, so the hiveku MCP server will not authenticate (tools will 401). Run the hiveku-connect skill, or set HIVEKU_TOKEN to your account key from app.hiveku.com."
    exit 0 ;;
esac

echo "Hiveku connected ($via). Before any write: verify identity with get_account_info, and remember you are NOT the only writer — check project_version_log before you start and project_files_status before you push. See the hiveku-orient skill."
# The source-of-truth rule (2026-10-03), in the MCP server's own words (MCP #100, with the two
# sentences MCP #174 adds on About your business and a local copy). Static text only.
echo "Hiveku: Hiveku Memory is the source of truth for this business: read it before you act, and follow it over your own assumptions, local files or earlier conversation. When something disagrees with memory, trust memory and say so. About your business is read with \`account_memory_get\`; memory_list and memory_get leave it out. A local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read it again from Hiveku before you act on it. When \`memory_log_add\` is listed, record your work: a Doing line when you start a task for the person and a Done line when it ends. Save what you learned with the memory_* tools."
# What Hiveku records in the memory log itself (MCP #174): a session's Doing at its first change and
# its Done when it goes quiet or ends. The same words as the Claude Code plugin. Static text only.
echo "Hiveku: Hiveku records this session's Doing at its first change and its Done when the session goes quiet or ends. When the work ends, send a Done with \`memory_log_add\` and a one-line summary of what you did, if you want the log to say more than the count of changes; leave \`thread\` out."
# Hiveku's own rules (2026-10-09): they outrank memory where the two disagree, and today they cover
# emailing a group of people. The same words as the Claude Code plugin's shim. Static text only.
echo "Hiveku: Hiveku's own rules are \`platform_rules\` in account_context_get: they apply to every account and outrank this account's memory where the two disagree, so follow the rule and say why. Before you email a group of people, find out how the list was built: a cold list (people who never asked to hear from the business) goes through a cold email platform, never Hiveku email marketing."
# Versions (2026-09-25): a save is live in the preview but is not a version. Static text only.
echo "Hiveku: version your change with project_vcs_commit before you finish: once per change, after it is saved and verified, with NO files and a plain-language name for the site owner."
# The feedback loop (2026-09-24): where Hiveku's own defects and gaps go. Static text only.
# A refused memory write (403 memory_write_refused) is named apart (2026-10-03):
# "one retry, then report" turned that deliberate refusal into a bogus report.
echo "Hiveku: if a Hiveku tool keeps failing after one sensible retry, or a capability you need is missing, report it with hiveku_report_issue or hiveku_request_feature, and mention it to the user only if it changes what they get. A memory write refused with memory_write_refused is not a failure: show the person its message and link, follow its hint, and never retry it unchanged or report it. The hiveku-orient skill has the rules."
# The account's plan and its limits (agent plan and usage, builder #1332, MCP #225): the builder's
# PLAN_LIMIT_LINE, word for word, right after the line with the memory_write_refused carve-out,
# and where to read the plan. Static text only.
echo "Hiveku: A tool answer with limit_kind (a plan's number reached, something the plan does not include, AI credits used up, billing that needs attention, an add-on or phones not set up, a chat's spending limit reached) is not a fault: nothing was done. Never retry it unchanged or report it; tell the person its message and do what its hint says. Only for plan_limit, not_on_plan and ai_credits, also say when it starts again and the next plan and its number, using account_usage_get or the answer for every number, and point an owner or admin to its billing_url. Before work the plan counts, call account_usage_get."
exit 0
