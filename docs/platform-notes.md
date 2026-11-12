# Herdr app: platform notes

Herdr behaviours that the manual (`~/.config/herdr-app/AGENTS.md`) gets wrong or leaves out. The types are in
`herdr.d.ts` and `gpui-kit.d.ts` (800 KB: grep it, don't read it).

**Where this comes from.** This file started as `docs/platform-notes.md` in
[shoaibkhanz/emergence](https://github.com/shoaibkhanz/emergence) (commit `0c2c302`, MIT, Copyright (c) 2026 Shoaib
Khan; see `THIRD-PARTY-NOTICES.md`).

**What the borrowed method covers.** From emergence we take one method, and use it only for this document: how we
learn what the platform does (herdr-core and the Herdr app) and record it for reuse. That means:

- seeing a behaviour live before writing it down;
- checking it with a probe mod and `herdr-app shot`;
- keeping the result here, so later work can rely on it.

The rest of this repository (the layouts, mods, themes, skills and their design) is our own work and doesn't come
from emergence. We re-checked every note on our setup, changed the ones that had moved on, and added what this repository
ran into.

**Checked against:** Herdr app 0.1.15, herdr-core (`hc`) 0.1.20, Linux, 2026-11-12, with a throwaway probe mod (see
[Verifying UI](#verifying-ui)).

Each note is marked:

- **[checked]**: seen again on the versions above.
- **[changed]**: the original note no longer holds, or holds differently. What we saw is written here.
- **[new]**: not in the original; found while working on this repository.
- **[carried over]**: not re-checked (it needs a person at the mouse, or rare conditions). Treat it as likely, not
  certain.

## Sizes and zoom

- **[checked]** `on_size_change` reports real px (zoom applied), not the logical px the manual says. Divide by
  `settings().zoom`. At zoom 1.1 a `w(150)` element reports 165 and a 400×300 window reports 438×328.
- **[checked]** `PathBuilder` coordinates are scaled by zoom like element px. Draw them in the same units as
  `.left()` / `.top()`, with no extra factor: at zoom 1.1 a 200-unit path and a `w(200)` div both drew 220 px wide,
  starting at the same x. This covers the radar's lines and blip-to-card links in `layouts/dynamic-board/mods/dynamic-board`.
- **[carried over]** A popup is only as tall as its content; mod.json `height` is a cap. To fill a share of the
  window, give the root `viewport_size().height * share / zoom`.
- **[changed]** `line_height` accepts a number now (the type is `number | LengthString`), but the number is a
  **multiple of the font size, not px**: `line_height(20)` on 13 px text gave 260 px lines. Use a string for px
  (`line_height("20px")`).

## Layout state

- **[checked]** A shown node has no `hidden` key at all. Test `!node.hidden`, never `node.hidden === false`.
- **[checked]** `<mod>.<command>` only reaches copies that are shown (the manual now says so too). A collapsed column
  counts as not shown, so a block that must always get commands belongs in a column that never collapses.
- **[changed]** Edits reload open copies in place, panel copies and windows included, **when the files are real
  files under the Herdr home.** A window's code changed within 3 s of saving, with no layout switch.
- **[new]** **Edits under a symlinked mod folder don't reload.** This repository installs by symlink
  (`~/.config/herdr-app/mods/dynamic-board → <repo>/layouts/dynamic-board/mods/dynamic-board`). Herdr watches the link, not where it
  points, so saving in the repo changes nothing on screen, even minutes later. Either touch the link itself, which
  reloads every copy in place:

  ```sh
  touch -h ~/.config/herdr-app/mods/dynamic-board
  ```

  or switch layouts away and back (`herdr-app do layout.switch '{"name":"main"}'`, then back to yours).

## Windows

- **[carried over]** An invisible window (`frame: "none"`, empty view) still takes every press, and a press drags
  it. A kept window stays where it was dropped (`windows.json` `places`) across restarts and layouts. In emergence, a
  1 px window ended up over a panel and ate its clicks. Host resident mods in a 0 px layout block instead.
- **[checked]** `herdr-app do overlay.close --id <key>` doesn't close a window: it returned ok and the window stayed.
  `closeOverlay(props().overlay)` from inside the mod does close it.
- **[new]** `herdr-app do mod.open --name <mod>` on a mod whose window is open closes it (as the manual's
  "again: closes it" says). Run it twice to restart a window.
- **[checked]** `openOverlay` with an open window's `key` replaces it in place, at the new spec's size (one overlay
  before and after; the root went from 398×298 to 498×198).

## Runtime

- **[checked]** `fs/promises` has no `appendFile` (`typeof` is `"undefined"`). It has `readFile`, `writeFile`,
  `readdir`, `exists`, `unlink`, `rmdir` and `mkdir`.
- **[checked]** `readTextFile` of a missing file resolves `null`, and `JSON.parse(null)` is `null`.
- **[carried over]** `props()` is `null` under `herdr-app check`. A probe's async writes from `init` never landed
  under `check`, so we couldn't see it either way. Guard `props()?.x` anyway.
- **[carried over]** A View method named `close` collides with the lifecycle `async close(cx)`. Use another name
  (`dismiss`).
- **[checked]** `InputState.set_value` doesn't fire `change`.
- **[carried over]** `.tooltip()` on tiny elements (an 11 px square) never showed for the person. An `on_hover` that
  sets state, with a readout drawn elsewhere, always works. We hit the same thing in reverse: the radar's blip tooltip
  covered the small card, so the blips use hover state only.
- **[checked]** `run("<mod>.<command>")` from one mod reaches another mod's `nextCommand()`.
- **[changed]** `render()` has a time limit, and it is shorter than the original ~100 ms. A render that blocked for
  50 ms finished; 90, 150 and 300 ms were cut off, and the window showed *"This view could not be re-rendered; showing
  the last version that worked — interrupted"*. `herdr-app status` listed no error. Work inside `cx.spawn` isn't
  limited: do heavy sums in a task, keep the result keyed on its inputs, and `cx.notify()` when it lands.
- **[carried over]** After a few dozen reloads of a panel holding several MB of data, `JSON.parse` of a 3 MB string
  threw `null` until Herdr restarted (probably out of memory; not proven).

## Verifying UI

- Never synthesize OS mouse or keyboard events: Herdr usually isn't frontmost, and they land in another app.
- **A probe mod.** Make `~/.config/herdr-app/mods/<probe>/` with a mod.json `overlay` of `kind: "window"`:
  1. Open it with `herdr-app do mod.open --name <probe>`.
  2. Have it record what it sees (`on_size_change`, `layout()`, `agents()`, `settings()`) into
     `~/.config/herdr-app/data/<probe>.json` with `fs/promises` `writeFile`.
  3. Drive it with a `nextCommand()` loop (`herdr-app do <probe>.<cmd>`).
  4. Look with `herdr-app shot <file.png>`. To measure a drawing, paint it in a pure colour and find those pixels.
  5. Delete the probe folder and its data file afterwards.

  Write the file at the end of the step you're checking. One written from the command loop *before* `cx.notify()`
  can't contain anything that `render()` does after it.
- Right after a `layout.switch`, commands can land in a copy that isn't the shown one, and a screenshot can catch the
  layout mid-start. Wait a second, or put a temporary default in `init` and switch once.
- To learn whether pointer events arrive at all, log from the handlers into the data file and ask the person to
  click.
- **[checked]** A synthetic agent for a test. `tab.new` with an `argv` that prints
  `\033]0;<title>\007\033]7501;state=working:app=claude\033\\`, then a moment later `state=blocked`, and then sleeps.
  It shows up in `agents()` as `{status: "blocked", program: "claude"}` and on the board under AWAITING ORDERS with
  its ALERT tag. `herdr-app do tab.new` prints the new tab's id; close it with `tab.close --id <tab>` afterwards.
  - **[carried over]** `done` needs a `working` report first and must land while another tab is in front, or it reads
    as idle.
