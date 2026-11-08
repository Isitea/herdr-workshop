# Third-party notices

This repository includes material from other projects. Their licenses apply to those parts.

## catppuccin/vscode-icons

- Source: https://github.com/catppuccin/vscode-icons
- Version: commit `b6915da9f6889b683a110aa747de96c2820a537d`
- License: MIT. Copyright (c) 2023 Catppuccin, Copyright (c) 2023 thang-nm. The full text is below and in `mods/dynamic-board-files/icons/LICENSE`.
- Used in: `mods/dynamic-board-files/icons/`
  - `latte/` and `macchiato/`: the project's Latte and Macchiato SVG icons, copied unchanged.
  - `map.json`: built from the project's `src/defaults/fileIcons.ts` and `folderIcons.ts` (which icon goes with which file name, extension or folder name).
- Fetched by `scripts/update-icons.ps1` / `scripts/update-icons.sh`.

```text
MIT License

Copyright (c) 2023 Catppuccin
Copyright (c) 2023 thang-nm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## herdrdev/herdr-layout-examples

- Source: https://github.com/herdrdev/herdr-layout-examples (the `board` example)
- License: Apache License 2.0, in `LICENSE`.
- Used in: `mods/dynamic-board/` and `layouts/dynamic-board.json`, modified. The changes are listed at the top of `mods/dynamic-board/main.js`.

## Herdr's shipped `files` mod

- Source: the `files` mod that ships with the Herdr app (version 0.1.13), copied with Herdr's `mod.clone` as `mods/dynamic-board-files/`.
- Changed: Download and the catppuccin icons above; the changes are described at the top of `mods/dynamic-board-files/main.js`.
