# Dynamic Board

A complete Herdr window built around a kanban board of every agent and terminal across every machine.
- Each one is a card in a status column (Needs you, Working, Done, Idle).
- Sub-agents an agent started appear as dashed cards linked to their parent.
- Chips filter the board by machine, space and type.
- A + popup creates spaces, tabs and worktrees.
- The active tab's terminals stay live underneath, with Herdr's Files and Changes panels and status bar.
- It draws its own window buttons, so it needs no other layout.

![Dynamic Board](preview.png)

Based on the `board` example in [herdrdev/herdr-layout-examples](https://github.com/herdrdev/herdr-layout-examples) (Apache License 2.0, see `LICENSE`). Renamed to `dynamic-board` and changed as listed at the top of `mods/dynamic-board/main.js`.

## What you see

Top to bottom, light `paper` theme, Geist 13, background `#f6f7f9`, accent `#7465db`:

1. **Header**: 100 px, white, drags the window.
   - **Row 1, left**: a three-bar violet logo, then the title (the filtered space or machine, else the active space), then `/ Agent board` in grey.
   - **Row 1, right**:
     - a count, e.g. "10 agents · 3 terminals across 9 spaces", or "4 of 13 shown (…)" when filtered;
     - `Files` and `Changes` buttons (27 px, violet when their panel is open);
     - minimize, maximize/restore and close (34×27 px). Close turns red on hover. On Windows they use Herdr's vector icons.
   - **Row 2**: chips `Board`, `Machine ▾`, `Space ▾`, `Agent ▾` (27 px, violet when selected). At the right: `● Live updates`, a square `+`, a square ⚙.
2. **Cards**: 355 px, bordered, four status columns.
   - Column colors: Needs you `#d79032`, Working `#7465db`, Done `#39a380`, Idle `#99a0ad`.
   - An empty column folds into a 136 px strip at the far left: only its title, dot and `0`, stacked.
   - Open columns keep the card width they'd have with all four open. Room freed by folded columns becomes extra card slots, so cards flow side by side and wrap like floats. Extra slots go first to the column hiding the most cards.
   - A column with more cards than fit shows an always-visible scrollbar and a footer: "N cards · scroll to see all ↕".
3. **Card**: 86 px, white, 7 px radius, 3 px status bar at the left.
   - Line 1: program icon and name, then the terminal address (`t15`).
   - Line 2: the tab name, bold.
   - Line 3: a machine tag (monitor icon for this computer, server icon for others), the space name, and "N m observed".
   - A parent card adds `↳ N sub`, with one status dot per sub-agent.
   - A sub-agent card has a dashed `#c9cdd6` border, a faded bar, a `SUB` tag, its name on line 2, and `↳ <parent tab> (t15)` in violet on line 3.
   - A plain terminal card has a `TERMINAL` tag.
4. **Work area**:
   - On the left, the live workspace: a 34 px strip, "Live workspace · space / tab · TERMINALS". Under it, the active tab's panes as white cards (gap 12, radius 7), each with a 28 px header showing icon, name and status dot.
   - On the right, the Files / Changes panel: 368 px wide, resizable from 280 to 900, hidden until opened.
5. **Status bar**: 28 px, Herdr's `workspace-status`.

## How it behaves

- **Status mapping**: blocked → Needs you, working → Working, done → Done, idle → Idle.
  - Plain terminals report no status. A shell waiting at its prompt sits in Idle. A program running in the foreground (a build, `gh auth login`, a server) sits in Working.
  - "N m observed" counts from when the board first saw the current status. The board re-renders every 30 s.
- **Click**:
  - An agent card focuses it (`agent.focus`).
  - A terminal card focuses its pane (`pane.focus`).
  - A sub-agent card peeks at it over the tab (`terminal.peek`); `↳ parent` focuses the parent.
- **Right-click an agent or terminal card**: a menu combining Herdr's tab and space menus.
  - Rename / New / Close tab.
  - Rename space, New / Open worktree (in a git repo), Remove worktree (linked worktrees), Close space.
  - ↑ ↓ Enter Esc work in the menu.
- **Right-click a sub-agent card**: Peek; Keep as tab (`terminal.keep` with `place: "tab"`); Go to parent; Kill sub-agent…, which asks with Herdr's `confirm` dialog first.
- **Chips** open a popup just under the chip:
  - Machine, with layout state dots;
  - Space, only the chosen machine's spaces;
  - Type: each agent program plus one `Terminal` type.

  Rows show counts. `Board` clears every filter. The filter is shared as `dynamic-board.filter`. Sub-agents follow their parent's machine and space.
- **`+`** opens Create, right-aligned under the button:
  - Mode: New space / New tab / Worktree.
  - Machine, then Space for tab and worktree modes.
  - Worktree mode: New worktree (branch) or Open worktree…, both through Herdr's `worktree` dialog.
  - Start: Terminal or any `knownAgents` agent, installed first, then "Show N more (not installed)".
  - Names are left to Herdr's defaults; an agent tab is named after the agent.
- **⚙** opens `app.settings`.
- **Files / Changes** select that child of the `panel-body` stack and show `panel`. Pressing the open one hides it. Which buttons appear follows shared `workspace.panels`, else both.
- **Window buttons** run `window.minimize`, `window.maximize` (or restore) and `window.close`. They are drawn only when `window().buttons` says the system draws none.
- `agent.next` / `agent.prev` follow the board's order, for paned agents only.

## Built from

- **`layouts/dynamic-board.json`**: a root column (`titlebar: none`, `paper`, preview `mods/dynamic-board/preview.svg`). Its children, top to bottom:
  - `board-header`: `{mod: "dynamic-board", props: {role: "header"}}`.
  - `board-cards`: `{mod: "dynamic-board"}`.
  - `work-body`, a resizable row with a divider, containing:
    - the `workspace` column: the `workspace-title` block (`role: "terminals"`) and `{tab: "active"}` with pane headers (`role: "pane"`);
    - the hidden `panel` column: a stack `panel-body` with the `files` and `changes` blocks.
  - `status`: `{mod: "workspace-status"}`.
- **`mods/dynamic-board/main.js`**: one mod with several roles.
  - Block roles: `header`, the default board, `terminals`, `pane`.
  - Popup roles opened with `openOverlay`: `pick`, `menu`, `create`.
- **Herdr data**: `agents()`, `terminals()` (sub-agents: `parent`, `state`, `name`), `panes()` (plain terminals: no `status`), `spaces()`, `machines()`, `layout()`, `window()`, `knownAgents({on})`, `shared` / `setShared`, `setAgentOrder`, `keys()`.
- **Commands**:
  - focus and terminals: `agent.focus`, `pane.focus`, `terminal.peek`, `terminal.keep`, `terminal.kill`;
  - tabs and spaces: `tab.new|rename|close`, `space.new|rename|close`;
  - layout: `layout.select|show|hide`;
  - window and app: `window.minimize|maximize|close`, `app.settings`.
- **Shipped pieces used**:
  - mods `files`, `changes`, `workspace-status`, `worktree`, `confirm`;
  - icons in `mods/workspace-chrome/`, `mods/tabs/win-*.svg`, `mods/files/file.svg`, `mods/changes/changes.svg`, `icons/shell.svg`;
  - the `new-menu.agents` shared cache.
- **Runs programs**: `git rev-parse --show-toplevel` and `--git-common-dir`, through `exec`, in a space's folder on that space's machine, to tell whether the worktree items apply. The shipped Files and Changes panels read and change files and git state in the active space as they do in Herdr's default window. The board itself has no network access and reads no files.

## Watch out

- **Popups**: popups collapse with `size_full` / `flex_1`. Use `w_full` and fixed list heights, and pass `width`/`height` to `openOverlay`. `herdr-app check` doesn't render popup roles, so test them on screen.
- **Colors**: colors must be hex or theme names. Use `#ffffff00`, not `transparent`.
- **Measuring size**: measure with `on_size_change` on the root only. The first frame uses flexible columns until the size arrives.
- **Popup anchors**: anchor popups at `position − local_position` from `on_mouse_down`.
- **Where the data comes from**:
  - `agents()` lists paned agents only.
  - Sub-agents come from `terminals()` with `parent`.
  - Plain terminals come from `panes()` entries with a `terminal` and no `status`.
  - Remote addresses are machine-qualified (`vps/t17`) everywhere, so they match.
- **Layout names**: letters, digits and hyphens only. A name with parentheses or spaces is silently ignored by `layout.switch`.
- **Mod setup**: write `mod.json` (`{"place":"none"}`) before `main.js`. Otherwise Herdr docks the mod into the shown layout.
- **Panel ids**: the Files/Changes buttons look for the ids `panel` and `panel-body`. Keep them if you restructure the layout.

## Done when

- `herdr-app check <home>/mods/dynamic-board` passes, and `herdr-app status` shows no errors on `dynamic-board`.
- **Columns**: empty status columns appear only as stacked titles at the left. A full column shows a scrollbar and the "N cards" footer before any scrolling.
- **Filters**: picking a machine narrows the Space popup to it. The Type popup lists a `Terminal` row.
- **New terminal**: opening a new terminal adds a `TERMINAL` card. Running a command in it moves the card to Working.
- **Sub-agents**: a terminal started by an agent with `hc run` appears as a dashed card, and its parent shows `↳ 1 sub`.
- **Panels**: `Changes` opens the panel on the right with the active space's git changes. Pressing it again hides the panel.
- **Window buttons**: on Windows and Linux, minimize, maximize/restore and close act on the window.
