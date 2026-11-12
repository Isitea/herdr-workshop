# Agent environment kit: design

Date: 2026-11-12. Repository: herdr-workshop. Status: ready for the user's review.

## Intent

The user runs coding agents in a fixed pattern. They talk only to one main session per project, the **Commander**. The
Commander plans the work, makes a git worktree per piece of work, starts a sub session there, gives it instructions,
asks the user when a sub session is blocked, and finishes the work: merges the PR and cleans up. The user doesn't
manage worktrees or PRs.

The environment that makes this work was built inside one project, co2-simulator (`scripts/setup/`, `mise.dev.toml`,
`.config/wt.toml`, `.worktreeinclude`, `CLAUDE.md`). The next project lives on another machine and has nothing to do
with co2-simulator, but needs the same environment. This kit takes that environment out of co2-simulator so any
repository on any machine can get it.

**Why it matters (the user's failure test):** if a new repository ends up with a different set of plugins or skills
from the others, the kit has failed, even if everything runs.

## Where it runs

- **Work machine:** has herdr-core (`hc`) only. Agents, worktrees and the kit run here, from a shell.
- **Client:** has the Herdr app and connects to the work machine through `hc machine`. Not part of this kit.
- The kit must never depend on the Herdr app, on mods, or on `herdr-app` commands. It uses `hc`, `git`, `wt`, `jq`,
  `claude`, `trail` and `mise`.

## How a repository gets set up (user's order)

1. Once per machine, by hand, outside the kit: install mise, the agents (Claude Code, Codex, …) and herdr-core.
2. Make the repository (new folder, or clone).
3. Write its `mise.toml`, with or without the agent tasks.
4. Run the kit's setup **in that repository**. It runs per repository, not per machine, because each repository's
   environment comes from its own mise configuration.

## Goals

1. **Same environment everywhere.** One list, kept in herdr-workshop, says which plugin marketplaces, plugins and
   repository skills every repository gets. Setup installs from that list and nowhere else.
2. **Check, not just install.** A check command compares a repository's real state with the list. It reports what is
   missing and what is installed but not on the list.
3. **General worktree lifecycle.** co2-simulator's `worktree.sh` (`create`, `prepare`, `doctor`, `remove`, `sync`)
   becomes repository-independent. A repository adds its own preparation through a hook.
4. **Commander rules as a skill.** The rules the Commander follows live in a skill that setup installs. Today they live
   in co2-simulator's `CLAUDE.md`.
5. **Sub sessions are real sub sessions.** A sub session is started with the Commander as its `hc` parent and
   `--outlive-parent`, replacing today's `--no-parent` (see "Parent links").

## Non-goals

- Installing mise, the agents or herdr-core (step 1 above).
- Anything on the client: layouts, mods, the Herdr app. Showing Commander and sub sessions on the board is a separate,
  later project in this repository. It will read only what `hc` records: parent links, labels, cwd and branch.
- agy-bridge (Antigravity ↔ Claude Code over MCP). It exists for setups without Herdr. With `hc`, agents talk through
  `hc`. It stays in co2-simulator's own preparation.
- `CLAUDE_CONFIG_DIR`. The kit assumes the agents' default config folders. On a machine where mise sets
  `CLAUDE_CONFIG_DIR`, the kit installs into whatever folder `claude` uses, with no special handling. (This machine
  still sets it; merging its two folders is deferred, and not this project's job.)
- Moving co2-simulator onto the kit in this project. Its sessions are working for at least 8 more days. The kit must
  make that move possible later (see "co2-simulator later").

## Anti-goals

- Two repositories set up with the kit ending up with different plugins or skills.
- Each repository carrying its own copy of the list. A copied list will drift.
- Setup silently removing plugins the user installed themselves. A plugin that isn't on the list is reported, not
  removed.
- Plugin installs approved with `-y`. A marketplace can declare commands that run on install. The user reads and
  approves them, as `install-claude-plugins.sh` does today.
- Worktree removal that kills a terminal it didn't start, or deletes a worktree while a terminal runs in it.

## Constraints (from the user)

- Agent versions: latest.
- Agent config folders: defaults (`~/.claude`, …).
- Order of setup as above. Setup runs per repository under that repository's mise environment.
- License: MIT (repository root).

## Where co2-simulator is today (what the kit replaces)

| Layer | Today | What it does |
|---|---|---|
| Plugins | `scripts/setup/install-claude-plugins.sh` | adds marketplaces `im-not-ai`, `ponytail`, `worktrunk`; installs `superpowers`, `humanize-korean`, `worktrunk`, `ponytail`; prints the target config folder; never `-y` |
| Repository wiring | `scripts/setup/dev-environment.sh` (`MISE_ENV=dev mise run dev:environment`) | graft CLI and map (now Trail-code: `npm install -g @trailhq/trail-code`, `trail init`; `graft` still works), agy-bridge, the `hc` skill from `hc --skill` with front matter added, a check of `wt` hook approvals |
| Agent tasks | `mise.dev.toml` | `install-claude` (official installer), `install-claude-plugins`, `install-graft`, `install-worktrunk` (`cargo install worktrunk && wt config shell install`), `dev:environment` |
| Worktrees | `scripts/setup/worktree.sh` (585 lines), `.config/wt.toml` (pre-start hook → `prepare`), `.worktreeinclude` (`.env`) | see "Worktree lifecycle" |
| Rules | `CLAUDE.md` "Worktrees and Subagents" | create only through the script; never `Agent` with `isolation: "worktree"`; `--open` only for a new session; the script starts no agent; `remove` stops only the shell it started |
| Tests | `code-test/test_worktree_registry.py` (47 tests, pytest) | registry and helper logic, with the git common dir pointed at a temp folder |

**Drift already exists.** The installer lists 4 plugins. This machine has 7: also `diagram-design@diagram-design`,
`frontend-design@claude-plugins-official` and `telegram@claude-plugins-official`. That is the failure the kit exists
to prevent, and it has to be settled when the list is written (see "Open questions").

## What the kit contains

All under one folder at the repository root, `agent-env/` (name: my call).

```
agent-env/
  README.md              how to use it on a new machine and a new repository
  manifest.toml          the one list: marketplaces, plugins, repository skills
  setup.sh               per repository: install from the manifest and wire the repository
  check.sh               per repository: compare the real state with the manifest (read-only)
  mise.dev.toml.example  the agent tasks a repository copies into its own mise configuration
  skills/
    commander/SKILL.md   the Commander's rules (worktrees, sub sessions, cleanup)
  worktree/
    worktree.sh          the general worktree lifecycle
  tests/                 tests for worktree.sh and check.sh
```

### How a repository reaches the kit

The list must exist once, so each repository uses one clone of herdr-workshop per machine instead of copying files.
The clone sits at `~/.local/share/herdr-workshop` unless `HERDR_WORKSHOP` says otherwise, and setup puts the fixed
command `agent-worktree` on the PATH (see "Calls made after review", 3). The example mise tasks call the clone's
`agent-env/setup.sh`. Updating the kit means `git pull` in that clone, then running setup or check again in each
repository. (My call.)

### manifest.toml

- `[[marketplace]]`: `name`, `source` (GitHub `owner/repo`).
- `[[plugin]]`: `id` (`name@marketplace`).
- `[[skill]]`: repository skills that setup puts in the repository's `.agents/skills/` (linked from `.claude/skills/`). For now: `hc` (generated from
  `hc --skill`, as today) and `commander` (from `agent-env/skills/commander/`).
- `[[user_skill]]`: skills fetched from a git repository and copied into the config folder's `skills/` (user scope,
  like the plugins). Each entry names `source` (`owner/repo`), `path` inside it and a pinned `commit`, so every
  machine gets the same files. Updating one means changing its commit in the manifest (my call). For now: `unslop`
  (`heydamir/unslop`, `skills/unslop`; CC BY 4.0, installed from the source, not copied into this repository).

The list, decided by the user on 2026-11-12. Rule: only items every agent can get from their own source; Claude-only items are left out.

| Kind | Entries |
|---|---|
| Marketplaces | `claude-plugins-official` (built in), `im-not-ai` (`epoko77-ai/im-not-ai`), `ponytail` (`DietrichGebert/ponytail`), `worktrunk` (`max-sixty/worktrunk`), `diagram-design` (`cathrynlavery/diagram-design`) |
| Plugins | `superpowers@claude-plugins-official`, `humanize-korean@im-not-ai`, `worktrunk@worktrunk`, `ponytail@ponytail`, `diagram-design@diagram-design` |
| User skills | `unslop` |
| Left out | `frontend-design@claude-plugins-official`: offered for Claude only (Anthropic's Claude Code marketplace and `anthropics/skills`, "skills for Claude"); no Codex, Antigravity or Grok marketplace has it. Its content is a plain `SKILL.md` (Apache 2.0) that other agents could read, but the kit would then have to carry and update a copy. The user's rule: an item that only Claude gets is left out of the kit. It stays installed in Claude on this machine and shows up as extra. |
| Never | `telegram@claude-plugins-official`: didn't work. Removed from this machine on 2026-11-12 (11 local-scope records in both config folders, all but one pointing at worktrees that no longer exist). |

`check.sh` also reports plugins installed at project or local scope (this machine has project-scope installs in
`research-assistant` and the home folder), as extra, not as failures.

### Agents: Claude Code, Codex, Antigravity, Grok Build (user decision, 2026-11-12)

The same list goes to four agents. Research on 2026-11-12 (official docs where they exist, agy's bundled docs and
help on this machine) gave this picture. Routes marked *untested* must be tried before the plan relies on them (see
"First step of the build").

| | Claude Code (`claude`) | Codex CLI (`codex`) | Antigravity CLI (`agy`) | Grok Build (`grok`, xAI) |
|---|---|---|---|---|
| Plugins | marketplaces + `claude plugin install` (the source of truth) | own marketplaces: `codex plugin marketplace add owner/repo`, `codex plugin add name@mkt` | `agy plugin import claude` copies what Claude has at user scope (skips project-only and disabled plugins) *untested*; or `agy plugin install <dir \| name@mkt>` | reads Claude Code's marketplaces, plugins and skills with no setup *untested*; own route `grok plugin install … --trust`, some plugins off by default |
| User skills | `~/.claude/skills` | `~/.agents/skills` | `~/.gemini/config/skills` (bundled docs; third-party guides disagree) | `~/.grok/skills`, also `~/.agents/skills` |
| Project skills | `.claude/skills` | `.agents/skills` | `.agents/skills` | `.grok/skills`, and Claude's `.claude/` |
| Listing for `check.sh` | `claude plugin list --json` | `codex plugin list --json`, `codex plugin marketplace list --json` | `agy plugin list --json` (checked here) | `grok inspect --json` |
| Config folder | `~/.claude` | `~/.codex` (`CODEX_HOME`) | `~/.gemini/config` (shared with the IDE), `~/.gemini/antigravity-cli` | `~/.grok` |

Per item, from each project's own README:

| Item | Codex | Antigravity | Grok |
|---|---|---|---|
| superpowers | `superpowers@openai-curated` | in `antigravity-plugins-partners`; or import | in `xai-official`; or Claude compatibility |
| humanize-korean | skill folder (its `install.sh --codex-only` links into the old `~/.codex/skills`) | import, or install the clone | Claude compatibility |
| worktrunk | `codex plugin marketplace add max-sixty/worktrunk` + `worktrunk@worktrunk` | import, or install the clone | Claude compatibility |
| ponytail | `ponytail@ponytail` from `DietrichGebert/ponytail` (hooks need trusting) | `agy plugin install https://github.com/DietrichGebert/ponytail` | `grok plugin install DietrichGebert/ponytail --trust`, then enable |
| diagram-design | `diagram-design@diagram-design` from `cathrynlavery/diagram-design` | import | Claude compatibility |
| unslop, hc, commander (skills) | `~/.agents/skills` / `.agents/skills` | `.agents/skills` | `~/.agents/skills` / `.claude/skills` |

What follows for the kit (my calls):

- **Claude Code is installed first and is the reference.** Grok and Antigravity are then brought in line from it
  (compatibility, import). Codex gets its own routes. The manifest therefore lists each item once, with a per-agent
  `route` only where the default ("from Claude") doesn't apply.
- **Repository skills live once, in `.agents/skills/`.** `.claude/skills/<name>` is a link to it. That covers all four
  agents with one copy. User skills (unslop) likewise go to `~/.agents/skills/` and are linked into
  `~/.claude/skills/` and agy's user skills folder.
- **Agents that aren't installed are skipped, not failed.** Installing agents is step 1, outside the kit. `setup.sh`
  and `check.sh` say which agents they found and checked. A repository is "the same" when every installed agent
  matches the manifest.
- **`grok` must be Grok Build.** The community `grok-cli` installs a command of the same name; `check.sh` tells them
  apart (Grok Build has `grok inspect`).
- `trail init` gets `--agents claude codex antigravity grok`, limited to the agents found.

### First step of the build: try the untested routes

On a throwaway repository and with each agent installed by the user first: `agy plugin import claude`,
`agy plugin install <github-url>`, Grok reading Claude's plugins, Codex adding the Claude-format marketplaces,
agy's real user skills folder, and how to choose "Just me" in `trail init` without its prompt (needed because
`prepare` runs with nobody at the terminal). Each result is written into this document before the per-agent code is written. A
route that fails falls back to copying the plugin's skills as plain skill folders, which all four agents read.
- Trail-code: run `trail init` in "Just me" mode for the agents found.

### setup.sh (per repository, idempotent)

1. Print where things will go: the repository, the config folder `claude` will use, and which of the four agents it
   found. Stop if `claude` (the reference agent), `hc`, `git`, `jq` or `wt` is missing, naming what's missing. The
   other agents are optional.
2. Marketplaces and plugins from the manifest, Claude Code first, then each other agent found by its route (see
   "Agents"): add what's missing, never `-y` or `--trust` on the person's behalf, so marketplace and hook commands are
   approved by the person at the terminal. Leave everything else installed as it is.
3. Trail-code: install the CLI if missing, then `trail init` in "Just me" mode, with `--agents` set to the agents
   found and `--no-global`, which keeps writes inside the repository. Without `--no-global`, `trail init --agents …`
   removes other agents' wiring, including user-level files.
4. Repository skills from the manifest into `.agents/skills/`, with `.claude/skills/<name>` linking to each; user
   skills into `~/.agents/skills/` with links from the other agents' user skills folders. Linked or copied from the
   kit: builder's call, as long as `check.sh` catches a skill that differs from the kit's.
5. Report the `wt` hook approval state, as `dev-environment.sh` does today. Never approve on the user's behalf.
6. End with `check.sh`'s report.

### check.sh (read-only)

- Plugins and marketplaces, per agent found: missing → fail; installed but not in the manifest → listed as "extra",
  not a failure. Agents not installed are listed as skipped.
- Repository skills: missing or different from the kit's → fail.
- Trail-code wiring present when the manifest asks for it.
- Exit status non-zero on any failure, so a mise task or a Commander can act on it.

## Worktree lifecycle (`agent-env/worktree/worktree.sh`)

Keep the commands, their order contracts and their safety rules from co2-simulator. Change only what is
co2-specific.

| Part | Keep | Change |
|---|---|---|
| Paths | `<repo>.<sanitized-branch>` next to the main checkout; ask git for an existing worktree's path, never compute it | — |
| `create <branch> [--base <ref>] [--open]` | through `wt switch --create … --no-cd`; prepare; `--open` starts one `hc` shell | the shell gets a parent (below) |
| `prepare <path>` | idempotent; stops on the first failure and says how to rerun | copies the gitignored files listed in the repository's `.worktreeinclude` (today hard-coded `.env`, `mise.local.toml`); then runs kit setup for the worktree; then the repository's own hook if it has one (`mise run worktree:prepare` if that task exists: my call). co2's `uv:sync` and `dev-environment.sh` move into co2's hook |
| `doctor` | read-only; `wt` approvals; per-worktree wiring; `hc` terminals per worktree; registry vs `hc` | wiring columns come from `.worktreeinclude` plus `check.sh`, not the fixed `graft .env .mcp.json .venv`; **add** a "left behind" section: worktrees with no live `hc` terminal, and whether their branch is merged |
| `remove <branch>` | order contract: refuse without `hc`; refuse while another terminal runs there; kill only the shell `--open` started; `hc wait` for its end; `wt remove --foreground`; then drop the record | drop the `pyproject.toml` special case (co2-specific, and its own comment says no new cases arise) |
| `sync` | copy machine-only files from the main checkout into every worktree, with the same diff report | file set from `.worktreeinclude` |
| Registry | knowing which terminal `--open` started (`hc` is the truth) | the file `.git/co2/workspaces.json` goes; the opened shell carries the `hc` labels `wt.opened=1` and `wt.branch=<branch>` (see "Calls made after review", 6) |

### Parent links

- `create --open` starts the shell with
  `hc run --bg --json --outlive-parent --label wt.branch=<branch> --label wt.opened=1 --cwd <path>`,
  **without** `--no-parent`. `hc` makes the calling terminal the parent, so when the Commander runs the script, the
  Commander is the parent. `--parent <terminal>` can be passed through for other callers.
- Checked live on 2026-11-12 (herdr-core 0.1.20): with `--parent P --outlive-parent`, the child kept running after P's
  program ended, and `hc get` still showed `parent: P`. `hc` has no command to change a parent later.
- Without `--no-notify`, `hc` types a note into the parent when the child ends (seen live:
  `<hc>t1s exited (exit 0). Read: hc read t1s`). That suits the Commander. Whether it also reports blocked or done
  states is not checked yet. Default: keep notes on (my call).
- A parent link points at a terminal address. If the Commander's terminal is removed and a new one started, the subs
  point at the old address. The Commander skill tells the Commander to keep its terminal (`hc keep`) and resume in it.

## Commander skill (`agent-env/skills/commander/SKILL.md`)

Moved from co2-simulator's `CLAUDE.md`, plus the rules agreed in this design:

- Make worktrees only with `worktree.sh create`. Never the `Agent` tool with `isolation: "worktree"`.
- One sub session, one worktree, one branch. A sub session doesn't move to another worktree. New work in a new
  worktree gets a new sub session. (A session that moved between worktrees is how worktrees were left behind before.)
- Start a sub session's shell with `create --open`, from your own terminal, so you are its parent.
- `worktree.sh` starts no agent. Who works in the shell is decided per task.
- When a sub session is blocked, ask the user. The user talks only to you.
- Finishing a piece of work: PR merged → `hc kill` the sub session → `worktree.sh remove <branch>`.
- At the start of a session: `worktree.sh doctor`, and report anything left behind before starting new work.
- Keep your own terminal (`hc keep`) so sub sessions' parent links stay valid.

## Tests

- Port the 47 pytest tests that apply (registry, path rules, doctor, sync). Drop the ones about co2-only behaviour.
  The kit has no Python project; run them with `uv run --with pytest` or similar (builder's call). Add tests for
  `check.sh`: missing, extra and differing items.
- Same rule as co2-simulator: tests don't create real worktrees or `hc` terminals. Point the git common dir and the
  worktree list at temp folders through the existing environment overrides (`WORKTREE_COMMON_DIR`,
  `WORKTREE_PATHS`).
- One end-to-end run by hand on this machine, in a throwaway repository: setup, check, `create --open`, doctor,
  remove.

## co2-simulator later (not in this project)

After its current work ends: its `mise.dev.toml` tasks call the kit; `scripts/setup/worktree.sh`,
`install-claude-plugins.sh` and the hc and wt parts of `dev-environment.sh` go; its own preparation (`uv:sync`,
`sync-workspace.py`, agy-bridge, `.env`) moves into its `worktree:prepare` hook; the rules in its `CLAUDE.md` are
replaced by the Commander skill. The kit's design must not need anything else from co2-simulator for that move.

## Calls made after review (mine, for the user to check)

1. **Plugins stay at user scope**, as today (`claude plugin install` without `--scope project`). With the default
   config folder, every repository on a machine shares one plugin set, so repositories on one machine can't differ;
   the manifest keeps machines the same. Setup runs per repository but, for plugins, only makes sure the machine
   matches the manifest. "Extra" in `check.sh` means extra on the machine.
2. **`prepare` runs only the non-interactive part.** It runs from the `wt` pre-start hook with nobody at the terminal.
   It copies `.worktreeinclude` files, installs the repository skills, runs `trail init` in the worktree and runs the
   repository's hook. It never installs plugins (they are machine-wide, see 1). A failed check there **warns and
   doesn't stop** the worktree. `setup.sh` is split in two accordingly: a machine part (plugins, Trail CLI) and a
   repository part (skills, Trail wiring, `wt.toml`), and `prepare` calls only the second.
3. **One fixed command, not a path.** Setup links `~/.local/bin/agent-worktree` to the clone's `worktree.sh`. The
   clone's default location is `~/.local/share/herdr-workshop`; `HERDR_WORKSHOP` overrides it. The `wt` hook, the
   Commander skill and people all call `agent-worktree …`, which is the same on every machine and needs no mise
   environment. Setup writes `.config/wt.toml` with the hook `agent-worktree prepare {{ worktree_path }}` when the
   file is missing. When the file exists without that hook, setup reports it and doesn't edit it. Approval stays with
   the user (`wt config approvals add`, never `--yes`).
4. **Repository skills are not committed.** Setup adds `.agents/skills/` entries and their `.claude/skills/` links
   for `hc` and `commander` to the repository's `.git/info/exclude`. A committed copy would drift from the kit, and the `hc` skill is generated from the
   installed `hc` binary. So `prepare` installs them in every worktree, and `doctor` checks them per worktree.
5. **"Left behind" uses git first, `gh` when it's there.** co2-simulator's PRs are merged with merge commits, so
   `git merge-base --is-ancestor <branch> <base>` answers "merged" for them. When `gh` is installed and signed in,
   `doctor` also asks for the branch's PR state, which covers squash and rebase merges. Without `gh`, a branch git
   can't confirm is shown as "not confirmed merged", never as unfinished work. `gh` is optional.
6. **The registry file goes.** The shell `create --open` starts gets the `hc` label `wt.opened=1` next to
   `wt.branch=<branch>`. `remove` kills only a terminal with both labels for that branch. `hc` is already the truth,
   and dropping the file removes its failure cases (empty, broken JSON). The registry tests that still apply become
   label tests.

## Open questions

Answered before planning:

1. ~~The plugin list.~~ Answered: see the table under "manifest.toml".
2. ~~Codex.~~ Answered: Claude Code, Codex, Antigravity and Grok Build (see "Agents").
3. ~~Trail-code mode.~~ Answered: **"Just me"** for now. Trail's files stay out of git (`.git/info/exclude`) and
   learnings go to `~/.trail`. The user wants to see what it leaves behind before deciding on team mode
   (`trail init --team` switches later).

All open questions are answered.

## Left to the builder

- Shell style, error wording, file names inside `agent-env/` other than `manifest.toml`, `setup.sh`, `check.sh`.
- Linking or copying repository skills, as long as `check.sh` detects a mismatch.
- How tests are run.
