# herdr-dynamic-board

A Herdr app layout: an agent and terminal kanban board with live terminals, Files/Changes panels, a status bar and its own window buttons. See [RECIPE.md](RECIPE.md) for what it shows and how it's built.

![Dynamic Board](preview.png)

## Install

In Herdr, ask the agent running there:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/Isitea/herdr-dynamic-board
```

The agent follows Herdr's AGENTS.md. It reads the recipe and files, and says what the mods do outside their folders:
- `dynamic-board`: read-only `git rev-parse` and `git status` in each space's folder, also on other machines, for the Space popup and the card menu; no network, no file access of its own.
- `dynamic-board-files` (the Files panel): what Herdr's Files does, plus, when you press Download, `scp` from that machine (or, for a machine not reached over ssh, `wc` / `dd | base64` there, or PowerShell on Windows), writing only into your `Downloads` folder, or a folder you pick when Downloads can't be written.

Then it copies the layout and the two mods into the Herdr home, runs `herdr-app check` and switches to the layout. Your own layout stays as it was.

## RTS Command layout

Cards are 75% of their earlier width in both layouts.

A second layout, `rts-command`, shows the same board as a 90s real-time-strategy command console. It's an original theme in that genre, not a copy of any game's art, fonts or sounds. Switch to it with `ctrl-shift-l` or Settings → Look → Layout.

- A green-on-black theme (`themes/rts-command.json`) in light and dark mode, with Share Tech Mono as the board's font.
- Columns renamed to AWAITING ORDERS, ENGAGED, MISSION COMPLETE and STANDING BY.
- Cards, chips and buttons with raised metal-panel edges. Blocked cards get a pulsing frame and an ALERT tag; Working cards get a turning radar sweep.
- Scanlines behind the terminals, with the terminals slightly see-through.
- **SITREP** in the status bar: when agents start (ENGAGED), stop for orders (AWAITING ORDERS) and finish (MISSION COMPLETE), newest first; the last 9 per space, kept across restarts.
- A **radar** at the board's left, as tall as the board: one sector per space, one blip per agent, closer to the center the more urgent it is (blocked, done, working, idle). Hovering a blip outlines its card and hovering a card rings its blip; click a blip to go to the agent, a sector to filter the board to that space (again, or the center, to clear). A line joins a blip and its card: solid for the hovered one, dashed for the focused agent. A card out of sight (below its column's footer, or in a column you scrolled) is pointed to at its column's footer; hovering its blip shows a small card beside the radar. Working blips have a blinking halo.
- A startup sound, once per launch of the window: put your own MP3 at `sounds/rts-command-startup.mp3` in the Herdr home. The repository ships none; with no file, nothing plays. It needs `sh`, so it doesn't play on Windows.

Installing it also needs `layouts/rts-command.json` and `themes/rts-command.json` (see By hand). Its look comes from the header's `skin` prop in the layout, so the Dynamic Board layout is unchanged.

## Supported mods

The layout works with these separately installed mods. They aren't part of this repository: install each one from its own repository, and the layout picks it up by itself.

- **[Git Graph](https://github.com/rabeeh-ta/herdr-git-graph)** (`git-graph`): a commit graph of the focused terminal's repository. Once it's installed, a **Git** button appears beside Files and Changes in the title bar and opens it in the same side panel, remembered per space like the others. Without it there is no Git button, and nothing else changes. To add it, ask the agent in Herdr: `Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/rabeeh-ta/herdr-git-graph`. What it runs and fetches is described in its own README.

To update, ask:

```text
Update the dynamic-board layout from https://github.com/Isitea/herdr-dynamic-board. It is the same layout and mod: overwrite them instead of adding renamed copies.
```

Without the last sentence the agent keeps the installed copy and adds the new one under another name, as AGENTS.md tells it to for names already taken.

The layout follows the system's light or dark mode (`paper` and `graphite`, or settings.json's `appearance`); a theme picked in Settings → Look still wins.

What doesn't move to another computer: the board height you dragged (each computer's `layouts/.state/`; use − / + again), and fonts and theme (your Herdr settings).

To switch away use `ctrl-shift-l` or Settings → Look → Layout. To remove it, delete `layouts/dynamic-board.json`, `mods/dynamic-board/` and `mods/dynamic-board-files/` from the Herdr home (a supported mod such as `mods/git-graph/` is its own: keep or delete it separately).

Downloads from another machine use `scp` with the name Herdr connected it by, so they need the same passwordless ssh Herdr already uses. One download must finish within 30 s (Herdr's limit for one command). A file from a machine not reached over ssh can be up to 100 MB. Files go to your Downloads folder: on Linux the one your desktop names (`~/.config/user-dirs.dirs`, e.g. `~/다운로드`), on Windows wherever it was moved to, also outside your home folder (e.g. `D:\…\Downloads`).

When a download fails, the status line says at which step (preparing the folder, copying, saving) and why (no permission to write the folder, the ssh key or connection, the file can't be read, the 30 s limit). If the folder can't be written (a policy, a read-only or missing drive), **Choose folder…** opens the system's folder picker, downloads there from then on, and tries again; **Use Downloads** goes back. The choice is kept on that computer only. On Windows the download runs only plain PowerShell cmdlets, so it also works where PowerShell is restricted to Constrained Language Mode.

Notes per system:
- macOS: the first download asks whether Herdr may use the Downloads folder; allow it once. The system's window buttons sit at the bar's left; the bar leaves them room.
- Remote machines: the Space popup's repository names and worktree nesting need git 2.31 or later there (Ubuntu 20.04 ships 2.25).
- Linux: `Show` after a download opens the folder with `xdg-open`, which desktop environments include.

### By hand

Copy `layouts/dynamic-board.json` and the `mods/dynamic-board/` and `mods/dynamic-board-files/` folders into the Herdr home. For the RTS Command layout, also copy `layouts/rts-command.json` into `layouts/` and `themes/rts-command.json` into `themes/`. Leave out `RECIPE.md`, `README.md`, `preview.png`, `LICENSE`, `THIRD-PARTY-NOTICES.md`, `.gitattributes`, `.gitignore`, `docs/` and `scripts/` (keep `mods/dynamic-board-files/icons/LICENSE`).

The Herdr home is `$HERDR_APP_HOME` when that's set, otherwise:

- Windows: `%USERPROFILE%\.config\herdr-app\`
- macOS / Linux: `~/.config/herdr-app/`

Copy `mod.json` before `main.js`, so Herdr doesn't dock the mod into the shown layout. Clone the repository (`git clone https://github.com/Isitea/herdr-dynamic-board`, or download it as a ZIP from GitHub and unpack it as `herdr-dynamic-board`). Then, from the folder that holds it:

Windows (PowerShell):

```powershell
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { "$env:USERPROFILE\.config\herdr-app" }
foreach ($m in "dynamic-board", "dynamic-board-files") {
  New-Item -ItemType Directory -Force "$h\mods\$m" | Out-Null
  Copy-Item herdr-dynamic-board\mods\$m\mod.json "$h\mods\$m\"
  Copy-Item -Recurse -Force herdr-dynamic-board\mods\$m\* "$h\mods\$m\"
  herdr-app check "$h\mods\$m"
}
Copy-Item herdr-dynamic-board\layouts\dynamic-board.json "$h\layouts\"
# RTS Command layout (optional):
Copy-Item herdr-dynamic-board\layouts\rts-command.json "$h\layouts\"
New-Item -ItemType Directory -Force "$h\themes" | Out-Null
Copy-Item herdr-dynamic-board\themes\rts-command.json "$h\themes\"
herdr-app do layout.switch --name dynamic-board
```

macOS / Linux:

```sh
h="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
for m in dynamic-board dynamic-board-files; do
  mkdir -p "$h/mods/$m"
  cp herdr-dynamic-board/mods/$m/mod.json "$h/mods/$m/"
  cp -R herdr-dynamic-board/mods/$m/. "$h/mods/$m/"
  herdr-app check "$h/mods/$m"
done
cp herdr-dynamic-board/layouts/dynamic-board.json "$h/layouts/"
# RTS Command layout (optional):
cp herdr-dynamic-board/layouts/rts-command.json "$h/layouts/"
mkdir -p "$h/themes" && cp herdr-dynamic-board/themes/rts-command.json "$h/themes/"
herdr-app do layout.switch --name dynamic-board
```

`herdr-app check` takes the mod's folder path; a bare name like `dynamic-board` isn't found.

You can also give an agent running inside Herdr this repository and ask it to install the layout. Herdr's AGENTS.md tells it how. If the name is already taken, rename the new one instead of overwriting.

To switch away use `ctrl-shift-l` or Settings → Look → Layout. To remove it, delete the layout file and both mod folders (and `layouts/rts-command.json` and `themes/rts-command.json` if you added them).

## Develop

Read [`docs/platform-notes.md`](docs/platform-notes.md) before changing a mod. It lists how herdr-core and the Herdr app actually behave where the manual is wrong or silent, and how to check that on screen. Those notes, and the method for checking and recording platform behaviour, come from [shoaibkhanz/emergence](https://github.com/shoaibkhanz/emergence) (MIT). We re-checked them on newer Herdr. The method covers only those platform notes. The layouts and mods are this repository's own.

If you installed by symlink, saving in the repo doesn't reload what's on screen. Run `touch -h ~/.config/herdr-app/mods/dynamic-board`, or switch layouts away and back.

## License

A modified version of the `board` example in herdrdev/herdr-layout-examples, under the Apache License 2.0 (`LICENSE`). The changes are listed at the top of `mods/dynamic-board/main.js`.

`mods/dynamic-board-files/` is a `mod.clone` of Herdr's shipped `files` mod with Download added. Its file and folder icons come from another repository, [catppuccin/vscode-icons](https://github.com/catppuccin/vscode-icons) (the Latte and Macchiato icons, at commit `b6915da`), under the MIT License: Copyright (c) 2023 Catppuccin, Copyright (c) 2023 thang-nm (`mods/dynamic-board-files/icons/LICENSE`).

[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) lists everything taken from other projects, with their licenses.

To refetch the icons at a pinned commit (only when updating them; installing doesn't need this):

- Windows: `powershell -ExecutionPolicy Bypass -File scripts\update-icons.ps1 [-Commit <sha>]` (or `pwsh -File …`)
- macOS / Linux: `sh scripts/update-icons.sh [<sha>]` (uses curl, tar and awk)
