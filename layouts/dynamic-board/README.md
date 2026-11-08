# herdr-isitea-layouts

Two Herdr app layouts that work as a pair (private, not published to herdr.dev):

| Folder | Layout | Mod |
|---|---|---|
| `board-isitea/` | `Board-isitea`: agent kanban board | `board-isitea` |
| `herdr-isitea/` | `Herdr-isitea`: Herdr's default window + a Board button | `layout-switch-isitea` |

Each folder has its own `RECIPE.md` (what it is and how it's built) and `preview.png`.

## Install on another computer

Copy the `layouts/` and `mods/` contents of **both** folders into the Herdr home. Leave `RECIPE.md`, `preview.png` and `LICENSE` out:

- Windows: `%USERPROFILE%\.config\herdr-app\`
- macOS / Linux: `~/.config/herdr-app/` (or `$HERDR_APP_HOME`)

Copy each mod's `mod.json` before its `main.js` (or copy whole folders at once), so Herdr doesn't dock the mod into the shown layout. Then:

```sh
herdr-app check ~/.config/herdr-app/mods/board-isitea
herdr-app check ~/.config/herdr-app/mods/layout-switch-isitea
herdr-app do layout.switch --name Herdr-isitea
```

Or give an agent running inside Herdr this folder and ask it to install the layouts. AGENTS.md tells it how. If a name is already taken, rename the new one instead of overwriting.

To remove: delete the two layout files and the two mod folders; `ctrl-shift-l` switches layouts.

## License

`board-isitea` is a modified version of the `board` example in herdrdev/herdr-layout-examples, licensed under the Apache License 2.0 (`board-isitea/LICENSE`). The changes are listed at the top of `mods/board-isitea/main.js`. `Herdr-isitea.json` is a clone of Herdr's shipped `main` layout.
