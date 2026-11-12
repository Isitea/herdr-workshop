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

## The Herdr app's shipped mods

- Source: the mods that ship with the Herdr app (https://herdr.dev). License: Apache License 2.0 (the app's `LICENSE`; the same text as this repository's `LICENSE`).
- `mods/dynamic-board-files/`: the `files` mod (version 0.1.13), copied with Herdr's `mod.clone` and changed: Download and the catppuccin icons above. The changes are described at the top of its `main.js`.
- `mods/dynamic-board/main.js`: adapted from the `new-menu` mod: `keyLabel` (shortcut text per OS) and the `newtab` popup (new-menu's tab rows). Listed in the change notice at the top of the file.

## Share Tech Mono

- Source: https://github.com/google/fonts (`ofl/sharetechmono`)
- License: SIL Open Font License 1.1. Copyright (c) 2012, Carrois Type Design, Ralph du Carrois, with Reserved Font Name 'Share'. The full text is in `mods/dynamic-board/fonts/OFL-ShareTechMono.txt`.
- Used in: `mods/dynamic-board/fonts/ShareTechMono-Regular.ttf`, unchanged; the RTS Command layout's board font.

## Lucide icons (and Feather, which some of them come from)

- Source: https://github.com/lucide-icons/lucide (Feather: https://github.com/feathericons/feather)
- Used in `mods/dynamic-board-files/`: `chevron-down.svg`, `chevron-right.svg`, `file.svg`, `folder.svg` (as the shipped `files` mod has them) and `download.svg` (Lucide's `download` icon).
- Used in `mods/dynamic-board/`: `copy.svg`, `maximize-2.svg`, `minimize-2.svg` (Lucide's `copy`, `maximize-2` and `minimize-2` icons).
- License: ISC for Lucide; `chevron-down`, `chevron-right`, `download`, `maximize-2` and `minimize-2` derive from Feather, also under MIT. Both texts are below and in each mod's `LICENSE-Lucide.txt`.

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

```text
The MIT License (MIT) (for chevron-down, chevron-right and download)

Copyright (c) 2013-present Cole Bemis

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
