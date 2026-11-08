# herdr-dynamic-board

A Herdr app layout: an agent and terminal kanban board with live terminals, Files/Changes panels, a status bar and its own window buttons. See [RECIPE.md](RECIPE.md) for what it shows and how it's built.

![Dynamic Board](preview.png)

## Install

Copy `layouts/dynamic-board.json` and the `mods/dynamic-board/` folder into the Herdr home. Leave out `RECIPE.md`, `README.md`, `preview.png` and `LICENSE`.

The Herdr home is `$HERDR_APP_HOME` when that's set, otherwise:

- Windows: `%USERPROFILE%\.config\herdr-app\`
- macOS / Linux: `~/.config/herdr-app/`

Copy `mod.json` before `main.js`, so Herdr doesn't dock the mod into the shown layout. The repository is private, so clone it with an account that has access (for example `gh repo clone Isitea/herdr-dynamic-board`). Then, from the folder that holds the clone:

Windows (PowerShell):

```powershell
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { "$env:USERPROFILE\.config\herdr-app" }
New-Item -ItemType Directory -Force "$h\mods\dynamic-board" | Out-Null
Copy-Item herdr-dynamic-board\mods\dynamic-board\mod.json "$h\mods\dynamic-board\"
Copy-Item herdr-dynamic-board\mods\dynamic-board\* "$h\mods\dynamic-board\"
Copy-Item herdr-dynamic-board\layouts\dynamic-board.json "$h\layouts\"
herdr-app check "$h\mods\dynamic-board"
herdr-app do layout.switch --name dynamic-board
```

macOS / Linux:

```sh
h="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mkdir -p "$h/mods/dynamic-board"
cp herdr-dynamic-board/mods/dynamic-board/mod.json "$h/mods/dynamic-board/"
cp herdr-dynamic-board/mods/dynamic-board/* "$h/mods/dynamic-board/"
cp herdr-dynamic-board/layouts/dynamic-board.json "$h/layouts/"
herdr-app check "$h/mods/dynamic-board"
herdr-app do layout.switch --name dynamic-board
```

`herdr-app check` takes the mod's folder path; a bare name like `dynamic-board` isn't found.

You can also give an agent running inside Herdr this repository and ask it to install the layout. Herdr's AGENTS.md tells it how. If the name is already taken, rename the new one instead of overwriting.

To switch away use `ctrl-shift-l` or Settings → Look → Layout. To remove it, delete the layout file and the mod folder.

## License

A modified version of the `board` example in herdrdev/herdr-layout-examples, under the Apache License 2.0 (`LICENSE`). The changes are listed at the top of `mods/dynamic-board/main.js`.
