# Fetches catppuccin/vscode-icons (MIT) at a pinned commit into
# mods/dynamic-board-files/icons/: the Latte and Macchiato SVGs, the LICENSE, and
# map.json built from src/defaults/fileIcons.ts and folderIcons.ts.
#   pwsh scripts/update-icons.ps1 [-Commit <sha>]
# Then copy the folder into the Herdr home as with the rest of the mod.
param([string]$Commit = "b6915da9f6889b683a110aa747de96c2820a537d")
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $repo "mods/dynamic-board-files/icons"
$tmp = Join-Path ([IO.Path]::GetTempPath()) "ctp-icons-$Commit"
New-Item -ItemType Directory -Force $tmp | Out-Null
$archive = Join-Path $tmp "src.tar.gz"
Invoke-WebRequest "https://codeload.github.com/catppuccin/vscode-icons/tar.gz/$Commit" -OutFile $archive
tar -xzf $archive -C $tmp
$src = Get-ChildItem $tmp -Directory | Where-Object Name -like "vscode-icons-*" | Select-Object -First 1

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
foreach ($flavor in "latte", "macchiato") {
  New-Item -ItemType Directory -Force (Join-Path $dest $flavor) | Out-Null
  Copy-Item (Join-Path $src.FullName "icons/$flavor/*.svg") (Join-Path $dest $flavor)
}
Copy-Item (Join-Path $src.FullName "LICENSE") (Join-Path $dest "LICENSE")

# The TS files are one object literal each: `  'key': {` entries whose fields
# (fileExtensions, fileNames, folderNames, languageIds) hold quoted strings.
function Read-Icons($path) {
  $entries = [ordered]@{}; $key = $null; $field = $null; $inside = $false
  foreach ($line in Get-Content $path) {
    if (-not $inside) { if ($line -match '^const \w+: \w+ = \{$') { $inside = $true }; continue }
    if ($line -eq '}') { break }
    if ($line -match "^  ['""]?([^'"":]+)['""]?: \{") { $key = $Matches[1]; $entries[$key] = @{}; $field = $null }
    if ($line -match '^\s+(\w+): \[') { $field = $Matches[1]; $entries[$key][$field] = [Collections.Generic.List[string]]::new() }
    if ($field) { foreach ($m in [regex]::Matches(($line -replace '^\s+\w+: \[', ''), "['""]([^'""]+)['""]")) { $entries[$key][$field].Add($m.Groups[1].Value) } }
    if ($line -match '\]') { $field = $null }
  }
  $entries
}

$map = [ordered]@{ commit = $Commit; fileNames = [ordered]@{}; fileExtensions = [ordered]@{}; folderNames = [ordered]@{} }
$files = Read-Icons (Join-Path $src.FullName "src/defaults/fileIcons.ts")
foreach ($icon in $files.Keys) {
  foreach ($n in $files[$icon].fileNames) { $map.fileNames[$n.ToLower()] = $icon }
  foreach ($e in $files[$icon].fileExtensions) { $map.fileExtensions[$e.ToLower()] = $icon }
}
$folders = Read-Icons (Join-Path $src.FullName "src/defaults/folderIcons.ts")
foreach ($icon in $folders.Keys) { foreach ($n in $folders[$icon].folderNames) { $map.folderNames[$n.ToLower()] = "folder_$icon" } }

# Every mapped icon must exist in both flavors (folders also need their _open twin).
foreach ($flavor in "latte", "macchiato") {
  $have = @{}; Get-ChildItem (Join-Path $dest $flavor) | ForEach-Object { $have[$_.BaseName] = $true }
  $missing = @($map.fileNames.Values + $map.fileExtensions.Values + $map.folderNames.Values + ($map.folderNames.Values | ForEach-Object { "${_}_open" })) |
    Sort-Object -Unique | Where-Object { -not $have[$_] }
  if ($missing) { Write-Warning "$flavor lacks: $($missing -join ', ')" }
}

$map | ConvertTo-Json -Depth 4 -Compress | Set-Content (Join-Path $dest "map.json") -Encoding utf8NoBOM
Remove-Item $tmp -Recurse -Force
"icons: $((Get-ChildItem $dest -Recurse -File).Count) files; names $($map.fileNames.Count), extensions $($map.fileExtensions.Count), folders $($map.folderNames.Count)"
