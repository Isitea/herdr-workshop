#!/bin/sh
# Fetches catppuccin/vscode-icons (MIT) at a pinned commit into
# mods/dynamic-board-files/icons/: the Latte and Macchiato SVGs, the LICENSE, and
# map.json built from src/defaults/fileIcons.ts and folderIcons.ts.
# The same as update-icons.ps1, for macOS and Linux (sh, curl, tar, awk).
#   sh scripts/update-icons.sh [commit]
# Then copy the folder into the Herdr home as with the rest of the mod.
set -eu
commit="${1:-b6915da9f6889b683a110aa747de96c2820a537d}"

repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="$repo/mods/dynamic-board-files/icons"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "https://codeload.github.com/catppuccin/vscode-icons/tar.gz/$commit" | tar -xzf - -C "$tmp"
src="$(find "$tmp" -maxdepth 1 -type d -name 'vscode-icons-*' | head -n 1)"

rm -rf "$dest"
for flavor in latte macchiato; do
  mkdir -p "$dest/$flavor"
  cp "$src/icons/$flavor/"*.svg "$dest/$flavor/"
done
cp "$src/LICENSE" "$dest/LICENSE"

# The TS files are one object literal each: `  'key': {` entries whose fields
# (fileExtensions, fileNames, folderNames, languageIds) hold quoted strings.
# Prints "field<TAB>value<TAB>icon" lines.
read_icons() {
  awk -v prefix="$2" '
    !inside { if ($0 ~ /^const [A-Za-z]+: [A-Za-z]+ = \{$/) inside = 1; next }
    $0 == "}" { exit }
    {
      line = $0
      if (line ~ /^  [\047"]?[^\047":]+[\047"]?: \{/) {
        key = line; sub(/^  [\047"]?/, "", key); sub(/[\047"]?: \{.*/, "", key); field = ""
      }
      if (line ~ /^ +[A-Za-z]+: \[/) {
        field = line; sub(/^ +/, "", field); sub(/: \[.*/, "", field); sub(/^ +[A-Za-z]+: \[/, "", line)
      }
      if (field != "") {
        rest = line
        while (match(rest, /\047[^\047]+\047|"[^"]+"/)) {
          print field "\t" tolower(substr(rest, RSTART + 1, RLENGTH - 2)) "\t" prefix key
          rest = substr(rest, RSTART + RLENGTH)
        }
      }
      if (line ~ /\]/) field = ""
    }' "$1"
}

{ read_icons "$src/src/defaults/fileIcons.ts" ""; read_icons "$src/src/defaults/folderIcons.ts" "folder_"; } |
awk -F '\t' -v commit="$commit" '
  function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
  function add(group, k, v) {
    if (!((group, k) in val)) order[group, ++count[group]] = k
    val[group, k] = v
  }
  $1 == "fileNames" { add("fileNames", $2, $3) }
  $1 == "fileExtensions" { add("fileExtensions", $2, $3) }
  $1 == "folderNames" { add("folderNames", $2, $3) }
  END {
    printf "{\"commit\":\"%s\"", commit
    n = split("fileNames fileExtensions folderNames", groups, " ")
    for (g = 1; g <= n; g++) {
      printf ",\"%s\":{", groups[g]
      for (i = 1; i <= count[groups[g]]; i++) {
        k = order[groups[g], i]
        printf "%s\"%s\":\"%s\"", (i > 1 ? "," : ""), esc(k), esc(val[groups[g], k])
      }
      printf "}"
    }
    printf "}\n"
  }' > "$dest/map.json"

# Every mapped icon must exist in both flavors (folders also need their _open twin).
for flavor in latte macchiato; do
  { grep -o '"[^"]*":"[^"]*"' "$dest/map.json" | sed 's/.*:"\(.*\)"$/\1/' | grep -v "^$commit\$"
    grep -o '"[^"]*":"folder_[^"]*"' "$dest/map.json" | sed 's/.*:"\(.*\)"$/\1_open/'; } | sort -u |
  while read -r icon; do
    [ -f "$dest/$flavor/$icon.svg" ] || echo "warning: $flavor lacks $icon" >&2
  done
done

echo "icons: $(find "$dest" -type f | wc -l | tr -d ' ') files"
