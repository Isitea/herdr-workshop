# herdr-workshop

Layouts, mods and agent skills for the [Herdr app](https://herdr.dev) and herdr-core (`hc`), kept in one place.

## What's here

| Path | What | Install |
|---|---|---|
| [`layouts/dynamic-board/`](layouts/dynamic-board/) | **Dynamic Board** and **RTS Command**: an agent and terminal board with live terminals and Files/Changes/Git panels | see its [README](layouts/dynamic-board/README.md) |
| [`docs/platform-notes.md`](docs/platform-notes.md) | How herdr-core and the Herdr app actually behave where the manual is wrong or silent, and how to check | read before changing a mod |
| [`docs/proposals/`](docs/proposals/) | Decisions about this repository | |

Each folder under `layouts/` is a self-contained unit, laid out like a Herdr home (`layouts/`, `mods/`, `themes/`),
with its own `LICENSE` and `THIRD-PARTY-NOTICES.md`. To install one, give a Herdr agent its folder URL, for example:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/Isitea/herdr-workshop/tree/main/layouts/dynamic-board
```

## History

`layouts/dynamic-board/` was the repository [Isitea/herdr-dynamic-board](https://github.com/Isitea/herdr-dynamic-board)
until 2026-11-12. Its full history was brought here with every path moved under `layouts/dynamic-board/`, so the commits
have new hashes. The original repository is left as it was.

## License

MIT ([`LICENSE`](LICENSE)) for everything outside the units under `layouts/`. Each unit keeps its own license: Dynamic
Board is under the Apache License 2.0, as a modified version of Herdr's layout example (see its `LICENSE` and
`THIRD-PARTY-NOTICES.md`). Material from other projects at the root is listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
