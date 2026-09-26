# Hiveku plugin for Codex: a small JSON walker shared by the hooks (sourced,
# never run on its own). bash with grep, sed and tr only; bash 3.2 safe.
#
# The other hook code reads flat `"key":"value"` tokens, which is enough when
# the key names one field. Two questions need the structure as well:
#   - which project and branch each MEMBER of a hiveku_batch names (its own
#     args, never another member's), and
#   - whether "version_reminder" is a TOP-LEVEL key of .hiveku/guardrails.json.
# json_tokens makes strings safe to walk and puts one token per line;
# batch_members and top_level_scalar walk those lines, counting depth.

# stdin JSON -> one token per line:
#   { } [ ]          structure
#   "key":           a key whose value is an object or an array (the next line opens it)
#   "key":<scalar>   a key and its scalar value ("key":"value", "key":true, "key":12)
#   <scalar>         an array element
# First, every string that is not a short plain name (letters, digits and
# . _ / : @ -, at most 200 of them; no space) becomes "~", so no brace,
# bracket, comma or space inside a string (file contents, messages, an escaped
# answer) can be read as structure or split a field. The string pattern starts
# at a quote outside any string and consumes escapes, so it frames each JSON
# string exactly.
json_tokens() {
  local soh
  soh=$(printf '\001')
  sed -E "s/\"([^\"\\\\]|\\\\.)*\"/${soh}&${soh}/g" \
    | tr "$soh" '\n' \
    | sed -E '/^"/{/^"[A-Za-z0-9._\/:@-]{0,200}"$/!s/.*/"~"/;}' \
    | tr -d '\n' \
    | sed -e 's/[][{}]/\
&\
/g' \
    | tr ',' '\n' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^\("[^"]*"\)[[:space:]]*:[[:space:]]*/\1:/' \
    | grep -v '^$'
}

# A token's scalar value without its quotes ("" for an object or array value).
token_value() {
  local v=${1#*\":}
  v=${v#\"}
  printf '%s' "${v%\"}"
}

# stdin: json_tokens of a hook payload. stdout: one line per member of
# tool_input.calls, "<tool> <project_id> <branch> <dry_run>", each "-" when
# the member does not set it. Only the member's own "tool" and the top-level
# keys of its own "args" are read; anything nested deeper is not.
batch_members() {
  local tok depth=0 key1='' key2='' key4='' in_member=0 k tool pid branch dry
  grep -E '^([][{}]|"[^"]*":|"(tool|project_id|branch|dry_run)":.+)$' | {
    while IFS= read -r tok; do
      case $tok in
        '{' | '[')
          depth=$((depth + 1))
          if [ "$depth" -eq 4 ] && [ "$key1" = tool_input ] && [ "$key2" = calls ]; then
            in_member=1 tool=- pid=- branch=- dry=- key4=''
          fi ;;
        '}' | ']')
          if [ "$depth" -eq 4 ] && [ "$in_member" = 1 ]; then
            printf '%s %s %s %s\n' "$tool" "$pid" "$branch" "$dry"
            in_member=0
          fi
          depth=$((depth - 1)) ;;
        '"'*'":'*)
          k=${tok%%\":*}
          k=${k#\"}
          case $depth in
            1) key1=$k key2='' ;;
            2) key2=$k ;;
            4)
              if [ "$in_member" = 1 ]; then
                key4=$k
                [ "$k" = tool ] && tool=$(token_value "$tok")
              fi ;;
            5)
              if [ "$in_member" = 1 ] && [ "$key4" = args ]; then
                case $k in
                  project_id) pid=$(token_value "$tok") ;;
                  branch) branch=$(token_value "$tok") ;;
                  dry_run) dry=$(token_value "$tok") ;;
                esac
              fi ;;
          esac ;;
      esac
    done
  }
}

# stdin: json_tokens of one JSON object. $1: a key. Prints that key's scalar
# value when it is a key of the top-level object, and nothing when it is not
# or when the brackets do not balance (a broken file states nothing).
top_level_scalar() {
  local tok depth=0 opened=0 value='' found=0
  while IFS= read -r tok; do
    case $tok in
      '{' | '[')
        depth=$((depth + 1))
        opened=1 ;;
      '}' | ']')
        depth=$((depth - 1))
        [ "$depth" -ge 0 ] || return 0 ;;
      "\"$1\":"?*)
        if [ "$depth" -eq 1 ] && [ "$found" = 0 ]; then
          value=$(token_value "$tok")
          found=1
        fi ;;
    esac
  done
  [ "$opened" = 1 ] && [ "$depth" -eq 0 ] && printf '%s' "$value"
  return 0
}
