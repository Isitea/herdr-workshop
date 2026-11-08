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
- `dynamic-board-files` (the Files panel): what Herdr's Files does, plus, when you press Download, `scp` from that machine (or `wc` / `dd | base64` there for a machine not reached over ssh), writing only into your `Downloads` folder.

Then it copies the layout and the two mods into the Herdr home, runs `herdr-app check` and switches to the layout. Your own layout stays as it was.

The repository is private, so the agent has to be able to read it. Sign in once on that computer with an account that has access, `gh auth login`, and the agent clones it with `gh`. Without that, copy the repository there yourself and give the agent its folder instead of the URL.

To update, ask:

```text
Update the dynamic-board layout from https://github.com/Isitea/herdr-dynamic-board. It is the same layout and mod: overwrite them instead of adding renamed copies.
```

Without the last sentence the agent keeps the installed copy and adds the new one under another name, as AGENTS.md tells it to for names already taken.

What doesn't move to another computer: the board height you dragged (each computer's `layouts/.state/`; use − / + again), and fonts and theme (your Herdr settings).

To switch away use `ctrl-shift-l` or Settings → Look → Layout. To remove it, delete `layouts/dynamic-board.json`, `mods/dynamic-board/` and `mods/dynamic-board-files/` from the Herdr home.

Downloads from another machine use `scp` with the name Herdr connected it by, so they need the same passwordless ssh Herdr already uses. One download must finish within 30 s (Herdr's limit for one command).

### By hand

Copy `layouts/dynamic-board.json` and the `mods/dynamic-board/` and `mods/dynamic-board-files/` folders into the Herdr home. Leave out `RECIPE.md`, `README.md`, `preview.png`, `LICENSE` and `scripts/`.

The Herdr home is `$HERDR_APP_HOME` when that's set, otherwise:

- Windows: `%USERPROFILE%\.config\herdr-app\`
- macOS / Linux: `~/.config/herdr-app/`

Copy `mod.json` before `main.js`, so Herdr doesn't dock the mod into the shown layout. Clone the repository with an account that has access (for example `gh repo clone Isitea/herdr-dynamic-board`). Then, from the folder that holds the clone:

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
herdr-app do layout.switch --name dynamic-board
```

`herdr-app check` takes the mod's folder path; a bare name like `dynamic-board` isn't found.

You can also give an agent running inside Herdr this repository and ask it to install the layout. Herdr's AGENTS.md tells it how. If the name is already taken, rename the new one instead of overwriting.

To switch away use `ctrl-shift-l` or Settings → Look → Layout. To remove it, delete the layout file and both mod folders.

## License

A modified version of the `board` example in herdrdev/herdr-layout-examples, under the Apache License 2.0 (`LICENSE`). The changes are listed at the top of `mods/dynamic-board/main.js`.

`mods/dynamic-board-files/` is a `mod.clone` of Herdr's shipped `files` mod with Download added. Its file and folder icons are [catppuccin/vscode-icons](https://github.com/catppuccin/vscode-icons) (Latte and Macchiato), under the MIT License (`mods/dynamic-board-files/icons/LICENSE`). `scripts/update-icons.ps1` refetches them at a pinned commit.
