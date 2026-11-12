# Proposal: one repository for several Herdr layouts and mods

Status: **decided 2026-11-12**, done differently from what is proposed below.

- **Name:** `herdr-workshop`.
- **How:** a new repository instead of renaming this one. `Isitea/herdr-dynamic-board` stays as it was. Its history
  was rewritten so every path sits under `layouts/dynamic-board/` (`git filter-branch --index-filter`, contents
  unchanged), then brought into the new repository.
- **Layout:** units live under `layouts/<unit>/` (the proposal below put them at the root). Repository-wide documents,
  such as `docs/platform-notes.md`, moved to the root. Agent skills go under `skills/`.
- **Why now:** a worktree-management skill built around herdr-core (`hc`) needed a home next to the layouts. A
  repository made only for one layout had no place for it.
- **rts-command:** stays inside the `dynamic-board` unit, as recommended.

The original proposal follows, unchanged.

## Idea

Rename this repository (now `herdr-dynamic-board`) and make it the home for several Herdr app layouts and mods, one folder per installable unit, as Herdr's AGENTS.md suggests for sharing more than one ("one folder each if there are several"). Herdr agents can install from a GitHub folder URL.

## Proposed layout

```
herdr-<new-name>/
├── README.md                 list of units, how to install each
├── dynamic-board/            one unit, laid out like a Herdr home
│   ├── README.md, RECIPE.md, preview.png, LICENSE, THIRD-PARTY-NOTICES.md
│   ├── layouts/dynamic-board.json
│   ├── layouts/rts-command.json
│   ├── themes/rts-command.json
│   └── mods/dynamic-board/, mods/dynamic-board-files/
├── <another-layout>/
└── <a-standalone-mod>/       just mods/<name>/ (and maybe keys.json)
```

## Decisions to make

1. **Name.** Candidates: `herdr-workshop`, `herdr-kit`, `herdr-layouts`, `herdr-isitea`.
2. **Where rts-command lives.** It is a skin of the `dynamic-board` mod (the header's `skin` prop), not a mod of its own.
   - Recommended: inside the `dynamic-board/` unit, as a second layout. One copy of the mod.
   - A separate unit would need either a second copy of the mod kept in sync, or a "install dynamic-board first" requirement.
3. **Licence files.** Units are installed by copying their folder, so each unit should carry its own `LICENSE` and notices.

## What a rename affects

- GitHub redirects the old URL to the new one, so existing clones and links keep working, until a new repository takes the old name.
- README install and update prompts: new URL, and folder URLs per unit.
- herdr.dev: the listing's URL changes. How the gallery shows a repository with several unit folders (each needs its own `RECIPE.md` and `preview.png`) is not yet checked.
- Local setups that link the installed files to a clone (symbolic links into `~/.config/herdr-app/`) must point at the new paths. Installed layout and mod names don't change, so Herdr itself is unaffected.

## Suggested order

1. Move the current files under `dynamic-board/` and write the top-level README (one commit).
2. Rename the repository on GitHub (`gh repo rename`).
3. Update local clones' remotes and any symbolic links.

## Also pending (not part of the rename)

- `mods/dynamic-board/rts-preview.svg` still shows rts-command before the in-board radar, the column names and the font.
- rts-command's startup MP3 is the user's own file (`sounds/rts-command-startup.mp3` in the Herdr home); none is shipped.
- Option B from the RTS work: a right-hand sidebar laid out like a production queue (radar on top, cards stacked), replacing the top board.
