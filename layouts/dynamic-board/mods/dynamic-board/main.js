// dynamic-board: modified from the `board` mod in herdrdev/herdr-layout-examples
// (https://github.com/herdrdev/herdr-layout-examples, Apache License 2.0; see LICENSE).
// Changes by isitea, 2026-11: Machine/Space/Agent filter chips, button-anchored popups,
// card context menu (tab + space + worktree), machine tags, Create (+) popup and
// settings button, folding empty columns to the left, float-style card slots,
// sub-agent cards linked to their parent, plain terminals as a Terminal type,
// Files/Changes panel toggles remembered per space, window buttons, a Space popup with
// git details, worktree nesting and go-to, a Space order popup (drag within
// a machine, worktrees kept under their space, A-Z), a Machine order popup (the board's
// own machine order, used across it), Add machine in the Machine popup, a connection
// dot on the Machine chip in place of the static "Live updates", the person's own fonts
// (the layout no longer sets Geist 13), a one-row title bar of filters (no space title),
// a 282 px board (two card rows) whose height can be dragged freely or set in whole card rows with − / +, and the renamed mod/layout names.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, Scrollbar, InputState, Input } from "gpui-base";
import { knownAgents, agents, terminals, spaces, machines, panes, props, run, setAgentOrder, layout, window, shared, setShared, openOverlay, closeOverlay, exec, keys } from "herdr";

const C = { ink: "#252b37", muted: "#89909d", line: "#e5e7ec", bg: "#f6f7f9", white: "#ffffff", violet: "#7465db" };
const STATES = [
  { key: "blocked", label: "Needs you", color: "#d79032", wash: "#fff5e4" },
  { key: "working", label: "Working", color: "#7465db", wash: "#efedfd" },
  { key: "done", label: "Done", color: "#39a380", wash: "#e8f6ef" },
  { key: "idle", label: "Idle", color: "#99a0ad", wash: "#edf0f4" },
];
const FILTER_KEY = "dynamic-board.filter";
// A node of the shown layout by id (layout() is the tree of layouts/<name>.json).
function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
const dot = (color, size = 7) => div().size(size).rounded(size).bg(color).flex_none();
const icon = (program, size = 18) => program?.icon
  ? (program.tint ? svg(program.icon).text_color(C.ink) : image(program.icon)).size(size).flex_none()
  : div().size(size).rounded(4).bg(C.violet);
const stop = (_e, cx) => cx.stop_propagation();
// Where a popup should open for the pressed element: just under its bottom-left
// corner, in window coordinates (position − local_position = element origin).
function anchorBelow(e) {
  if (!e?.local_position || !e?.bounds) return "pointer";
  return { x: Math.round(e.position.x - e.local_position.x), y: Math.round(e.position.y - e.local_position.y + e.bounds.height + 4) };
}
// The same, but with the popup's right edge on the element's right edge
// (for buttons at the window's right side, where a left-aligned popup would spill out).
function anchorBelowRight(e, width) {
  const a = anchorBelow(e);
  return a === "pointer" ? a : { x: Math.max(8, Math.round(a.x + e.bounds.width - width)), y: a.y };
}
let pressedAnchor = "pointer";
// A square icon button for the chip row.
const iconButton = (id, glyph, tip, onPress) => h_flex().id(id).size(27).flex_none().justify_center().items_center().rounded(6)
  .bg(C.white).border(1).border_color(C.line).cursor_pointer()
  .hover(s => s.bg("#eeebfc").border_color(C.violet))
  .tooltip(tip)
  .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); pressedAnchor = e; })
  .on_click(() => onPress(pressedAnchor))
  .child(svg(`mods/workspace-chrome/${glyph}.svg`).size(14).text_color("#5f6775"));
const CREATE_W = 340;
const KNOWN_AGENTS = "new-menu.agents"; // new-menu's cache of knownAgents() per machine ("" = here)
// onClick(anchor): anchor is the press's anchorBelow(), so popups line up with the chip.
const chip = (id, label, selected, onClick) => h_flex().id(id).h(27).px(11).gap(7).items_center().rounded(6)
  .bg(selected ? "#eeebfc" : C.white).border(1).border_color(selected ? "#ddd7f9" : C.line)
  .text_size(11).text_color(selected ? C.violet : "#737b89")
  .cursor_pointer().hover(s => s.border_color(C.violet))
  .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); pressedAnchor = anchorBelow(e); })
  .on_click(() => onClick(pressedAnchor))
  .child(label);

// ---- filter state (shared by every copy: header, board, popups) ----
// Machines are keyed by name; this computer (machine null) is LOCAL.
const LOCAL = "@local";
const machineKey = (name) => name ?? LOCAL;
const machineName = (key) => key === LOCAL ? "This computer" : key;
const spaceMachine = (spaceId) => machineKey(spaces().find(s => s.id === spaceId)?.machine ?? null);
// Machines from machines() and from spaces, in the board's machine order: the order
// set in the Machine order popup (shared, so every copy agrees), then any machine it
// doesn't name yet in Herdr's order (this computer first, then by name). Herdr has no
// machine order of its own to change, so this is the board's alone.
const MACHINE_ORDER_KEY = "dynamic-board.machines";
const herdrMachineOrder = (a, b) => (a === LOCAL ? -1 : b === LOCAL ? 1 : a.localeCompare(b));
function machineList() {
  const keys = new Set([LOCAL]);
  for (const m of machines()) keys.add(machineKey(m.name));
  for (const s of spaces()) keys.add(machineKey(s.machine));
  const state = Object.fromEntries(machines().map(m => [machineKey(m.name), m.layout]));
  const def = [...keys].sort(herdrMachineOrder);
  const saved = shared(MACHINE_ORDER_KEY) ?? [];
  const rank = (k) => { const i = saved.indexOf(k); return i >= 0 ? i : saved.length + def.indexOf(k); };
  return [...def].sort((a, b) => rank(a) - rank(b))
    .map(key => ({ key, name: machineName(key), layout: state[key] ?? "ready" }));
}
// Every machine's connection, from machines()' layout state: red when any is unavailable
// (offline, or its core can't be reached), amber while one is loading, green when all are
// ready. Shown as the Machine chip's dot, with this summary as its tooltip.
function connectionState() {
  const list = machineList();
  const down = list.filter(m => m.layout === "unavailable");
  const loading = list.filter(m => m.layout === "loading");
  if (down.length) return { color: "#c2493d", tip: `${down.length} machine${down.length === 1 ? "" : "s"} offline: ${down.map(m => m.name).join(", ")}` };
  if (loading.length) return { color: "#d79032", tip: `Connecting: ${loading.map(m => m.name).join(", ")}` };
  return { color: "#39a380", tip: list.length > 1 ? "All machines connected" : "This computer" };
}
function filter() {
  const f = shared(FILTER_KEY) ?? {};
  const machine = f.machine && machineList().some(m => m.key === f.machine) ? f.machine : null;
  const sp = spaces().find(s => s.id === f.space);
  return {
    machine,
    // A picked space must still exist and sit on the picked machine.
    space: sp && (!machine || machineKey(sp.machine) === machine) ? sp.id : null,
    type: f.type ?? null,
  };
}
// A card's machine: a small tag with the shipped monitor/server glyph.
const machineTag = (key) => h_flex().flex_none().max_w(120).h(16).px(5).gap(4).items_center().rounded(4)
  .bg(C.bg).border(1).border_color(C.line).text_color("#5f6775")
  .child(svg(`mods/workspace-chrome/${key === LOCAL ? "monitor" : "server"}.svg`).size(10).flex_none().text_color(C.muted))
  .child(div().truncate().child(machineName(key)));
const setFilter = (patch) => setShared(FILTER_KEY, { ...filter(), ...patch });
const spaceLabel = (s) => s.machine ? `${s.machine} / ${s.name}` : s.name;
// ---- sub-agents: terminals an agent started (`parent`) that have no pane of their own ----
// They show as their own cards in their status column, linked to the paned agent
// they descend from (`root`), whose tab, space and machine they belong to.
function subAgents() {
  const paned = new Map(agents().map(a => [a.address, a]));
  const all = terminals();
  const byAddr = new Map(all.map(t => [t.address, t]));
  const out = [];
  for (const t of all) {
    if (!t.parent || t.state !== "live" || paned.has(t.address)) continue;
    if (!STATES.some(s => s.key === t.status)) continue; // only status-reporting agents
    let root = t.parent;
    for (let hops = 0; !paned.has(root) && byAddr.get(root)?.parent && hops < 8; hops++) root = byAddr.get(root).parent;
    const p = paned.get(root);
    if (!p) continue;
    out.push({
      address: t.address, status: t.status, program: t.program,
      space: p.space, space_name: p.space_name, tab: p.tab, tab_name: p.tab_name,
      sub: true, parent: t.parent, root: p.address,
      label: t.name || t.title || t.program?.name || t.address,
    });
  }
  return out;
}
// ---- plain terminals: panes whose program reports no agent status ----
// One "Terminal" type for all of them. Waiting at a shell prompt counts as idle;
// running a program in the foreground (a build, `gh auth login`, a server) as working.
const TERMINAL = { key: "terminal", name: "Terminal", icon: "icons/shell.svg", tint: true };
function terminalCards() {
  const where = new Map();
  for (const s of spaces()) for (const t of s.tabs ?? []) where.set(t.id, { s, t });
  const out = [];
  for (const p of panes()) {
    if (!p.terminal || p.status) continue; // mod panes, and agents (already cards)
    const w = where.get(p.tab);
    if (!w) continue;
    out.push({
      address: p.terminal, pane: p.pane, space: w.s.id, space_name: w.s.name, tab: p.tab, tab_name: w.t.name,
      status: p.program?.shell === false ? "working" : "idle", program: p.program ?? TERMINAL,
      terminal: true, title: p.title,
    });
  }
  return out;
}
const typeKey = (a) => a.terminal ? TERMINAL.key : (a.program?.key ?? "agent");
const allAgents = () => [...agents(), ...subAgents(), ...terminalCards()];
function agentTypes() {
  const m = new Map();
  for (const a of allAgents()) {
    const k = typeKey(a);
    const e = m.get(k) ?? { key: k, program: a.terminal ? TERMINAL : a.program, count: 0 };
    e.count++;
    m.set(k, e);
  }
  return [...m.values()].sort((x, y) => y.count - x.count || x.program.name.localeCompare(y.program.name));
}
function filteredAgents() {
  const f = filter();
  // Cards follow the board's machine order; within a machine, Herdr's space order (stable sort).
  const rank = Object.fromEntries(machineList().map((m, i) => [m.key, i]));
  return allAgents().filter(a => (!f.machine || spaceMachine(a.space) === f.machine)
    && (!f.space || a.space === f.space) && (!f.type || typeKey(a) === f.type))
    .sort((a, b) => (rank[spaceMachine(a.space)] ?? 0) - (rank[spaceMachine(b.space)] ?? 0));
}
// ---- card context menu: the default layout's tab menu + space menu, combined ----
// Same items and commands as Herdr's shipped `menu` mod (tab.* / space.* / worktree).
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}
// ---- space git info for the Space popup (as Herdr's spaces sidebar reads it) ----
// { name, branch, ahead, behind, changes, repo, linked } or null when not a repo.
// No optional locks / fsmonitor: reading status must not touch the repo.
const GIT_KEY = "dynamic-board.git"; // shared cache: space id → info, so reopening is instant
async function gitInfo(folder, on) {
  const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd: folder, on });
  if (r.code !== 0) {
    if (/not a git repository/i.test(r.stderr)) return null;
    throw new Error(r.stderr); // couldn't ask: keep what we had
  }
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = (await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on })).stdout.trim();
  const base = (p) => p.replace(/\/+$/, "").split("/").pop();
  const info = {
    name: common.endsWith("/.git") ? base(common.slice(0, -5)) : base(common).replace(/\.git$/, ""),
    branch: null, ahead: 0, behind: 0, changes: 0,
    repo: JSON.stringify([on ?? null, common]), linked: common !== `${top.stdout.trim()}/.git`,
  };
  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
    else if (line.startsWith("# branch.ab ")) {
      const [a, b] = line.slice(12).split(" ");
      info.ahead = Math.abs(parseInt(a, 10)) || 0;
      info.behind = Math.abs(parseInt(b, 10)) || 0;
    } else if (line && !line.startsWith("#")) info.changes++;
  }
  return info;
}
// Spaces in their order, each worktree space shown under its repository's main
// checkout (display only; the order itself is changed in the Space order popup).
function nestSpaces(list, git) {
  const rows = list.map(s => ({ s, g: git[s.id] ?? null }));
  const mains = new Set(rows.filter(r => r.g && !r.g.linked).map(r => r.g.repo));
  const nested = (r) => r.g?.linked && mains.has(r.g.repo);
  const out = [], placed = new Set();
  for (const r of rows) {
    if (nested(r)) continue;
    out.push({ ...r, tree: null });
    if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
    placed.add(r.g.repo);
    const kids = rows.filter(k => nested(k) && k.g.repo === r.g.repo);
    kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└" : "├" }));
  }
  return out;
}
// The space menu alone (rename, worktree, close), for a Space popup row.
function openSpaceMenu(s) {
  openOverlay({ mod: "dynamic-board", kind: "popup", width: 240, height: 250,
    props: { role: "menu", spaceOnly: true, space: s.id, spaceName: s.name } });
}

// Returns [{ section } | { label, command, args }].
function menuItems(p, git) {
  if (p.sub) return [
    { section: `Sub-agent · ${p.label ?? p.terminal}` },
    { label: "Peek", command: "terminal.peek", args: { terminal: p.terminal }, icon: "search" },
    { label: "Keep as tab", command: "terminal.keep", args: { terminal: p.terminal, place: "tab" }, icon: "square" },
    { label: `Go to parent (${p.parentTab ?? ""})`, command: "agent.focus", args: { terminal: p.root }, icon: "chevron-left" },
    { label: "Kill sub-agent…", command: "terminal.kill", args: { terminal: p.terminal }, icon: "x", danger: true,
      confirm: { title: "Kill sub-agent?", detail: `${p.label ?? p.terminal} (${p.terminal}) will stop. Its parent agent keeps running.` } },
  ];
  const sp = spaces().find(s => s.id === p.space);
  const tab = sp?.tabs.find(t => t.id === p.tab);
  return [
    ...(p.spaceOnly ? [] : [
      { section: `Tab · ${tab?.name ?? p.tabName ?? ""}` },
      { label: "Rename tab", command: "tab.rename", args: { id: p.tab } },
      { label: "New tab", command: "tab.new", args: { space: p.space } },
      { label: "Close tab", command: "tab.close", args: { id: p.tab } },
    ]),
    { section: `Space · ${sp ? spaceLabel(sp) : p.spaceName ?? ""}` },
    { label: "Rename space", command: "space.rename", args: { id: p.space } },
    ...(git ? [
      { label: "New worktree", command: "worktree", args: { space: p.space, action: "new" } },
      { label: "Open worktree", command: "worktree", args: { space: p.space, action: "open" } },
    ] : []),
    ...(git === "linked" ? [{ label: "Remove worktree", command: "worktree", args: { space: p.space, action: "remove" } }] : []),
    { label: "Close space", command: "space.close", args: { id: p.space } },
  ];
}
function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}
function shortcut(name, args) {
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}
function openCardMenu(a) {
  if (a.sub) return openOverlay({ mod: "dynamic-board", kind: "popup", width: 240, height: 172,
    props: { role: "menu", sub: true, terminal: a.address, root: a.root, label: a.label, parentTab: a.tab_name } });
  openOverlay({ mod: "dynamic-board", kind: "popup", width: 240, height: 400,
    props: { role: "menu", space: a.space, tab: a.tab, spaceName: a.space_name, tabName: a.tab_name } });
}

const CARD_H = 86, CARD_GAP = 9, FOOTER_H = 22, FOLDED_W = 136;
// board-cards px for zero card rows: padding 34, title 27, gaps 9+6, footer, minus one
// card gap, 1 px slack, and the block's 2 px border. Rows add CARD_H + CARD_GAP each.
const BOARD_BORDER = 2;
const ROWS_BASE = 34 + 27 + 9 + 6 + FOOTER_H - CARD_GAP + 1 + BOARD_BORDER, ROW_STEP = CARD_H + CARD_GAP, MAX_ROWS = 8;
const BOARD_PAD_X = 24, COL_GAP = 16, SCROLL_LANE = 10; // SCROLL_LANE: room kept for a column's scrollbar
const PICK_MAX_ROWS = 10;
function openPicker(kind, count, at) {
  // header (~30) + rows (30px + 2px gap) + padding; the list scrolls past PICK_MAX_ROWS.
  const rows = Math.min(count + 1, PICK_MAX_ROWS);
  // The Space popup is wider (git details on each row), its title row holds a button,
  // and its rows sit under a 22 px header per machine.
  const space = kind === "space";
  const f = filter();
  const groups = space ? new Set(spaces().filter(s => !f.machine || machineKey(s.machine) === f.machine).map(s => machineKey(s.machine))).size : 0;
  openOverlay({ mod: "dynamic-board", props: { role: "pick", kind }, kind: "popup",
    width: space ? SPACE_W : 280, height: Math.min(44 + rows * 32 + (space ? 22 + groups * 24 : kind === "machine" ? 10 + 37 : 0), 44 + PICK_MAX_ROWS * 32 + 22), at: at ?? "pointer" });
}
const SPACE_W = 400, ORDER_W = 320;
// The Space order popup: machine headers + rows, scrolling past ORDER_MAX.
const ORDER_MAX = 560;
function openMachineOrder(at) {
  const h = Math.min(ORDER_MAX, 64 + machineList().length * 32);
  openOverlay({ mod: "dynamic-board", props: { role: "morder" }, kind: "popup", width: ORDER_W, height: h, at: at ?? "pointer" });
}
function openOrder(at) {
  const groups = new Set(spaces().map(s => machineKey(s.machine))).size;
  const h = Math.min(ORDER_MAX, 64 + groups * 30 + spaces().length * 32);
  openOverlay({ mod: "dynamic-board", props: { role: "order" }, kind: "popup", width: ORDER_W, height: h, at: at ?? "pointer" });
}

export default class Board extends View {
  init(_p, cx) {
    this.observed = {};
    this.boardH = 0;
    const p = props();
    if (!p?.role) cx.timer.every(30000, (cx) => cx.notify());
    if (p?.role === "create") {
      // Start from what the board shows: the filtered machine/space, else the active space.
      const f = filter();
      const active = spaces().find(s => s.active);
      this.mode = ["tab", "worktree"].includes(p.mode) ? p.mode : "space"; // "space" | "tab" | "worktree"
      this.wtAction = "new";  // worktree mode: "new" | "open"
      this.gitBy = {};        // space id → "loading" | "main" | "linked" | null (not a repo)
      this.showAllAgents = false;
      this.machine = f.machine ?? machineKey(active?.machine ?? null);
      this.space = f.space ?? (active && machineKey(active.machine) === this.machine ? active.id : null);
      this.focused = null;
      const input = (key, placeholder) => {
        const s = InputState.new({ placeholder });
        s.on("submit", () => this.create());
        s.on("change", (_e, cx) => cx.notify()); // the Create button depends on the branch
        s.on("focus", (_e, cx) => { this.focused = key; cx.notify(); });
        s.on("blur", (_e, cx) => { if (this.focused === key) this.focused = null; cx.notify(); });
        return s;
      };
      this.program = null; // null: a plain terminal; else a knownAgents() key
      this.agentsBy = {};  // machine key → knownAgents() result
      this.agentsState = {}; // machine key → "loading" | "ready" | "failed"
      this.loadAgents(this.machine, cx);
      this.branch = input("branch", "New or existing branch");
      this.handle = cx.focus_handle();
      if (this.mode === "worktree") this.checkGit(cx);
    }
    if (p?.role === "pick" && p.kind === "space") this.refreshGit(cx);
    if (p?.role === "order") { this.pressed = null; this.over = null; this.markAfter = null; this.refreshGit(cx, true); }
    if (p?.role === "morder") { this.pressed = null; this.over = null; }
    if (p?.role === "menu") {
      this.at = 1; // first actionable row (row 0 is a section title)
      this.git = null;
      this.handle = cx.focus_handle();
      this.handle.focus();
      const sp = spaces().find(s => s.id === p.space);
      const folder = sp && place(sp);
      if (folder) cx.spawn(async (cx) => {
        this.git = await checkout(folder, sp.machine).catch(() => null);
        cx.notify();
      });
    }
  }

  // ---- "+" popup: machine → new space, or machine → space → new tab ----
  // The agents a machine can start, as the default "+" menu (new-menu) finds them:
  // knownAgents({ on }), shown at once from the cache it shares with new-menu.
  loadAgents(key, cx) {
    const on = key === LOCAL ? null : key;
    const where = on ?? "";
    if (!this.agentsBy[key]) this.agentsBy[key] = shared(KNOWN_AGENTS)?.[where] ?? [];
    if (this.agentsState[key] === "loading") return;
    this.agentsState[key] = "loading";
    cx.spawn(async (cx) => {
      try {
        this.agentsBy[key] = await knownAgents({ on });
        setShared(KNOWN_AGENTS, { ...shared(KNOWN_AGENTS), [where]: this.agentsBy[key] });
        this.agentsState[key] = "ready";
      } catch { this.agentsState[key] = "failed"; }
      cx.notify();
    });
  }
  // Installed agents first, then the rest (disabled): two, as new-menu shows, or all when expanded.
  agentChoices() {
    const list = this.agentsBy[this.machine] ?? [];
    const missing = list.filter(a => !a.installed);
    return { shown: [...list.filter(a => a.installed), ...(this.showAllAgents ? missing : missing.slice(0, 2))],
             more: this.showAllAgents ? 0 : Math.max(0, missing.length - 2) };
  }
  // Worktree mode needs to know whether the picked space is in a git repo (as the card menu does).
  checkGit(cx) {
    const sp = this.createTarget();
    if (!sp || this.gitBy[sp.id] !== undefined) return;
    const folder = place(sp);
    if (!folder) { this.gitBy[sp.id] = null; return; }
    this.gitBy[sp.id] = "loading";
    cx.spawn(async (cx) => {
      this.gitBy[sp.id] = await checkout(folder, sp.machine).catch(() => null);
      cx.notify();
    });
  }
  pickedAgent() {
    return this.program ? (this.agentsBy[this.machine] ?? []).find(a => a.key === this.program && a.installed) ?? null : null;
  }
  createSpaces() {
    return spaces().filter(s => machineKey(s.machine) === this.machine);
  }
  createTarget() {
    // The picked space if it's on the picked machine, else that machine's first space.
    const list = this.createSpaces();
    return list.find(s => s.id === this.space) ?? list[0] ?? null;
  }
  canCreate() {
    const m = machineList().find(x => x.key === this.machine);
    if (!m || m.layout === "unavailable") return false;
    if (this.mode === "space") return true;
    const target = this.createTarget();
    if (!target) return false;
    if (this.mode === "tab") return true;
    const git = this.gitBy[target.id];
    return (git === "main" || git === "linked") && (this.wtAction === "open" || !!this.branch.value().trim());
  }
  create() {
    if (!this.canCreate()) return;
    const agent = this.pickedAgent();
    // Like new-menu: an agent's tab is named after the agent; otherwise Herdr's default
    // names (spaces after their folder, tabs by number). Rename later if needed.
    const tab = agent?.name ?? "";
    const start = agent ? { argv: agent.run } : {};
    closeOverlay(props().overlay);
    if (this.mode === "worktree") {
      // Herdr's own worktree dialog does the git work. Given a branch it creates the
      // checkout at once and opens it as a new space (first tab: tab name + agent).
      const space = this.createTarget().id;
      if (this.wtAction === "open") {
        openOverlay({ mod: "worktree", kind: "dialog", width: 560, height: 480, props: { space, action: "open" } });
      } else {
        openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: {
          space, action: "new", branch: this.branch.value().trim(),
          ...(tab ? { tab } : {}), ...(agent ? { argv: agent.run } : {}),
        } });
      }
      return;
    }
    if (this.mode === "space") {
      run("space.new", {
        machine: this.machine === LOCAL ? "" : this.machine,
        ...(tab ? { tab } : {}),
        ...start,
      });
    } else {
      run("tab.new", { space: this.createTarget().id, ...(tab ? { name: tab } : {}), ...start });
    }
  }

  createForm() {
    const label = (text) => div().pt(12).pb(6).text_size(10.5).text_color(C.muted).child(text);
    const seg = (id, text, on, action) => h_flex().id(id).flex_1().h(28).justify_center().items_center().rounded(6)
      .text_size(12).cursor_pointer()
      .bg(on ? C.white : "#ffffff00").text_color(on ? C.violet : "#737b89")
      .when(on, el => el.border(1).border_color("#ddd7f9").font_semibold())
      .on_click((_e, cx) => { action(cx); cx.notify(); }).child(text);
    const row = (id, on, lead, text, sub, action, enabled = true) => h_flex().id(id).w_full().h(28).flex_none().px(9).gap(8).items_center().rounded(6)
      .bg(on ? "#eeebfc" : C.white)
      .when(!enabled, el => el.opacity(0.5))
      .when(enabled, el => el.cursor_pointer().hover(s => s.bg(on ? "#eeebfc" : C.bg))
        .on_click((_e, cx) => { action(cx); cx.notify(); }))
      .child(lead)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(on ? C.violet : C.ink).child(text))
      .child(div().flex_none().text_size(10).text_color(C.muted).child(sub ?? ""));
    const field = (key, state) => Input.new(state).h(32).px(10).rounded(7).border(1)
      .border_color(this.focused === key ? C.violet : C.line).bg(C.white).text_size(12.5).text_color(C.ink);
    const LAYOUT_DOT = { ready: "#39a380", loading: "#d79032", unavailable: "#c2493d" };
    // Rows are 28px with 2px gaps; a list shows up to `most` rows, then scrolls.
    const listH = (n, most) => Math.min(n, most) * 30 - 2;
    const target = this.createTarget();
    const ok = this.canCreate();
    const { shown: choices, more } = this.agentChoices();
    const agent = this.pickedAgent();
    const wt = this.mode === "worktree";
    const git = target ? this.gitBy[target.id] : undefined;
    const startsSomething = this.mode !== "worktree" || this.wtAction === "new";
    const agentsState = this.agentsState[this.machine];
    const ms = machineList();
    const sp = this.createSpaces();
    const button = (id, text, primary, enabled, action) => h_flex().id(id).h(30).px(14).items_center().rounded(7)
      .border(1).border_color(primary ? C.violet : C.line).bg(primary ? C.violet : C.white)
      .text_color(primary ? C.white : C.ink).text_size(12).font_medium()
      .when(!enabled, el => el.opacity(0.45))
      .when(enabled, el => el.cursor_pointer().hover(s => s.opacity(0.88)).on_click(action))
      .child(text);

    return v_flex().id("create").track_focus(this.handle).w_full().p(14).bg(C.white).text_color(C.ink)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(14).font_semibold().child("Create"))
        .child(div().text_size(10.5).text_color(C.muted).child("Esc")))
      .child(h_flex().mt(10).p(3).gap(3).rounded(8).bg(C.bg)
        .child(seg("mode-space", "New space", this.mode === "space", () => { this.mode = "space"; }))
        .child(seg("mode-tab", "New tab", this.mode === "tab", () => { this.mode = "tab"; }))
        .child(seg("mode-worktree", "Worktree", wt, (cx) => { this.mode = "worktree"; this.checkGit(cx); })))
      // 1. machine
      .child(label("Machine"))
      .child(v_flex().id("create-machines").w_full().flex_none().h(listH(ms.length, 4)).overflow_y_scrollbar().gap(2)
        .children(ms.map(m => row(`cm-${m.key}`, this.machine === m.key,
          svg(`mods/workspace-chrome/${m.key === LOCAL ? "monitor" : "server"}.svg`).size(13).flex_none().text_color(LAYOUT_DOT[m.layout] ?? C.muted),
          m.name, m.layout === "ready" ? `${spaces().filter(s => machineKey(s.machine) === m.key).length} spaces` : m.layout,
          (cx) => { this.machine = m.key; this.loadAgents(m.key, cx); if (wt) this.checkGit(cx); }))))
      // 2. space: where the tab goes, or which repo the worktree comes from
      .when(this.mode !== "space", el => el
        .child(label(wt ? "Repository (from space)" : "Space"))
        .child(sp.length
          ? v_flex().id("create-spaces").w_full().flex_none().h(listH(sp.length, 5)).overflow_y_scrollbar().gap(2)
              .children(sp.map(s => {
                const g = this.gitBy[s.id];
                const sub = wt ? (g === "linked" ? "worktree" : g === "main" ? "repo" : g === null ? "not git" : g === "loading" ? "…" : "") : `${s.tabs.length} tabs`;
                return row(`cs-${s.id}`, target?.id === s.id,
                  dot(STATES.find(x => x.key === s.status)?.color ?? "#d5d9e0", 7),
                  s.name, sub, (cx) => { this.space = s.id; if (wt) this.checkGit(cx); });
              }))
          : div().px(9).py(6).text_size(11.5).text_color(C.muted).child("No spaces on this machine — create a space instead.")))
      // 2b. worktree: new (branch) or open (Herdr's list of the repo's checkouts)
      .when(wt, el => el
        .child(h_flex().mt(10).p(3).gap(3).rounded(8).bg(C.bg)
          .child(seg("wt-new", "New worktree", this.wtAction === "new", () => { this.wtAction = "new"; }))
          .child(seg("wt-open", "Open worktree…", this.wtAction === "open", () => { this.wtAction = "open"; })))
        .when(git === null, el => el.child(div().pt(6).text_size(11).text_color("#c2493d").child("This space's folder is not in a git repository.")))
        .when(this.wtAction === "new", el => el.child(label("Branch")).child(field("branch", this.branch))))
      // 3. what runs in it: a terminal, or an agent installed on that machine
      .when(startsSomething, el => el
        .child(label(wt ? "Start (first tab)" : "Start"))
        .child(v_flex().id("create-start").w_full().flex_none().h(listH(1 + Math.max(1, choices.length) + (more ? 1 : 0), this.showAllAgents ? 8 : 7)).overflow_y_scrollbar().gap(2)
          .child(row("cp-terminal", !agent, svg("icons/shell.svg").size(13).flex_none().text_color(C.ink),
            "Terminal", "shell", () => { this.program = null; }))
          .children(choices.map(a => row(`cp-${a.key}`, agent?.key === a.key,
            a.icon ? (a.tint ? svg(a.icon).text_color(C.ink) : image(a.icon)).size(13).flex_none() : dot(C.violet, 7),
            a.name, a.installed ? "agent" : "not installed", () => { this.program = a.key; }, a.installed)))
          .when(more > 0, el => el.child(row("cp-more", false, div().w(13).text_size(11).text_color(C.muted).child("…"),
            `Show ${more} more (not installed)`, "", () => { this.showAllAgents = true; })))
          .when(choices.length === 0, el => el.child(div().px(9).py(6).text_size(11.5).text_color(C.muted)
            .child(agentsState === "failed" ? "Could not load agents" : "Checking installed agents…")))))
      // Names are left to Herdr's defaults; rename later (card menu / tab / sidebar).
      .child(div().pt(8).text_size(10.5).text_color(C.muted).child(this.summary(target, agent)))
      .child(h_flex().pt(14).gap(8).justify_end()
        .child(button("create-cancel", "Cancel", false, true, () => closeOverlay(props().overlay)))
        .child(button("create-go", { space: "Create space", tab: "Create tab", worktree: this.wtAction === "open" ? "Choose worktree…" : "Create worktree" }[this.mode], true, ok, () => this.create())));
  }

  // One line under the form saying what Create will do.
  summary(target, agent) {
    const where = machineName(this.machine);
    const runs = agent ? `, running ${agent.name}.` : ", with a terminal.";
    if (this.mode === "space") return `New space on ${where}, starting in its home folder${runs}`;
    if (!target) return "";
    if (this.mode === "tab") return `New tab in ${target.name} on ${where}${runs}`;
    if (this.wtAction === "open") return `Opens Herdr's worktree list for ${target.name}'s repository; picking one opens or switches to its space.`;
    const b = this.branch.value().trim();
    return `git worktree for ${b ? `"${b}"` : "a branch"} from ${target.name} (new branch if it doesn't exist), opened as a new space${runs}`;
  }

  choose(i) {
    const it = menuItems(props(), this.git)[i];
    if (!it || it.section) return;
    closeOverlay(props().overlay);
    if (it.confirm) openOverlay({ mod: "confirm", kind: "dialog", width: 380, height: 160,
      props: { ...it.confirm, command: { name: it.command, args: it.args } } });
    else if (it.command === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it.args.action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it.args });
    else run(it.command, it.args);
  }

  menu() {
    const list = menuItems(props(), this.git);
    const step = (from, d) => {
      let i = from;
      do { i = (i + d + list.length) % list.length; } while (list[i].section);
      return i;
    };
    return v_flex().id("card-menu").track_focus(this.handle).w_full().p(5).bg(C.white).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = step(this.at, 1);
        else if (e.key === "up") this.at = step(this.at, -1);
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => it.section
        ? v_flex().when(i > 0, el => el.child(div().mx(7).my(4).h(1).bg(C.line)))
            .child(div().px(8).pt(3).pb(4).text_size(10.5).text_color(C.muted).truncate().child(it.section))
        : h_flex().id(`mi-${i}`).h(31).px(8).gap(9).rounded(7).items_center()
            .text_color(it.danger || it.command.endsWith(".close") ? "#c2493d" : C.ink)
            .when(i === this.at, el => el.bg("#eeebfc"))
            .hover(s => s.bg(C.bg))
            .on_click(() => this.choose(i))
            .child(svg(it.icon ? `mods/workspace-chrome/${it.icon}.svg` : menuIcon(it.command)).size(14).flex_none().text_color(C.muted))
            .child(div().flex_1().child(it.label))
            .child(div().text_size(11).text_color("#a6adba").child(shortcut(it.command, it.args)))));
  }
  card(a, state) {
    const old = this.observed[a.address];
    if (!old || old.status !== a.status) this.observed[a.address] = { status: a.status, at: Date.now() };
    const mins = Math.floor((Date.now() - this.observed[a.address].at) / 60000);
    const elapsed = mins ? `${mins}m observed` : "<1m observed";
    const short = (addr) => addr.split("/").pop();
    const subs = a.sub ? [] : (this.subsByRoot?.[a.address] ?? []);
    // Parent card: "↳ N sub" with each sub-agent's status dot.
    const subBadge = subs.length > 0 && h_flex().id(`subs-${a.address}`).flex_none().h(16).px(5).gap(4).items_center().rounded(4)
      .bg("#f3f1fd").border(1).border_color("#ddd7f9").text_color(C.violet)
      .tooltip(subs.map(s => `${s.label} (${short(s.address)}) · ${s.status}`).join("\n"))
      .child(div().child(`↳ ${subs.length} sub`))
      .children(subs.slice(0, 4).map(s => dot(STATES.find(x => x.key === s.status)?.color ?? C.muted, 6)));
    const card = h_flex().id(`agent-${a.address}`).w_full().h(CARD_H).flex_none().rounded(7).overflow_hidden()
      .bg(a.sub ? "#fcfcfe" : C.white).border(1).border_color(a.sub ? "#c9cdd6" : C.line).when(!!a.sub, el => el.border_dashed())
      .cursor_pointer().hover(s => s.border_color(state.color))
      // A sub-agent has no pane: peek at it over the tab instead of focusing a pane.
      .on_click(() => a.sub ? run("terminal.peek", { terminal: a.address })
        : a.terminal ? run("pane.focus", { terminal: a.address })
        : run("agent.focus", { terminal: a.address }))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openCardMenu(a); })
      .child(div().w(3).h_full().bg(state.color).flex_none().when(!!a.sub, el => el.opacity(0.55)))
      .child(v_flex().flex_1().min_w(0).px(12).py(10).gap(7)
        .child(h_flex().gap(7).items_center().text_size(10).text_color(C.muted)
          .child(icon(a.program, 15)).child(div().truncate().child(a.program.name))
          .when(!!(a.sub || a.terminal), el => el.child(div().flex_none().px(4).rounded(3).bg(C.bg).text_size(9).text_color(C.muted).child(a.sub ? "SUB" : "TERMINAL")))
          .child(div().flex_1())
          .when(!!subBadge, el => el.child(subBadge))
          .child(div().flex_none().child(short(a.address))))
        .child(div().text_size(13).font_semibold().text_color(C.ink).truncate().child(a.sub ? a.label : a.tab_name))
        .child(h_flex().items_center().gap(6).text_size(10).text_color(C.muted)
          .child(machineTag(spaceMachine(a.space)))
          .child(a.sub
            // "↳ parent tab (t15)": jumps to the parent agent.
            ? h_flex().id(`parent-${a.address}`).flex_1().min_w(0).gap(3).items_center().text_color(C.violet)
                .hover(s => s.text_color(C.ink))
                .on_mouse_down("left", stop)
                .on_click((_e, cx) => { cx.stop_propagation(); run("agent.focus", { terminal: a.root }); })
                .child(div().flex_none().child("↳"))
                .child(div().min_w(0).truncate().child(`${a.tab_name} (${short(a.parent)})`))
            : div().flex_1().min_w(0).truncate().child(a.space_name))
          .child(div().flex_none().child(elapsed))));
    return card;
  }

  // A status column's card list: an always-visible scrollbar, plus a footer
  // saying how many cards don't fit, so a full column never looks complete.
  // Card rows that fit in a column's list, with or without the footer.
  rowsFit(withFooter) {
    // Board height minus padding (17*2), column title (27) and its gap (9).
    const avail = (this.boardH ?? 0) - 34 - 27 - 9 - (withFooter ? FOOTER_H + 6 : 0);
    return Math.max(1, Math.floor((avail + CARD_GAP) / (CARD_H + CARD_GAP)));
  }

  // Board height in whole card rows (with room for the "scroll to see all" footer).
  // Dragging the board's bottom edge stays free; the −/+ control sets an exact row
  // count. (Mods get no mouse-up from Herdr's dividers, so snapping after a drag
  // can't tell a release from a pause.)
  rowsShown() {
    return ((this.boardH ?? 0) + BOARD_BORDER - ROWS_BASE) / ROW_STEP;
  }
  setRows(rows) {
    const n = Math.max(1, Math.min(MAX_ROWS, rows));
    run("layout.resize", { id: "board-cards", px: ROWS_BASE + n * ROW_STEP });
  }
  rowControl() {
    const cur = this.rowsShown();
    const whole = Math.max(0, Math.floor(cur + 0.001));
    const exact = Math.abs(cur - Math.round(cur)) < 0.02;
    const less = Math.max(1, Math.ceil(cur - 0.001) - 1), more = whole + 1;
    const btn = (id, label, tip, n, enabled) => h_flex().id(id).w(22).h(20).flex_none().justify_center().items_center()
      .rounded(5).text_size(13).text_color(enabled ? "#5f6775" : "#c3c8d1")
      .when(enabled, el => el.cursor_pointer().hover(s => s.bg(C.bg).text_color(C.violet)).on_click(() => this.setRows(n)))
      .tooltip(tip).child(label);
    return h_flex().id("board-rows").absolute().top(17).right(BOARD_PAD_X).h(27).items_center().gap(2).px(3)
      .rounded(7).bg(C.white).border(1).border_color(C.line)
      .child(btn("rows-less", "−", "Fewer card rows", less, less < cur - 0.001))
      .child(div().px(4).text_size(10.5).text_color(C.muted).child(`${whole} row${whole === 1 ? "" : "s"}${exact ? "" : "+"}`))
      .child(btn("rows-more", "+", "More card rows", more, more <= MAX_ROWS));
  }

  // Lay the open (non-empty) columns out in card-wide slots. Cards keep the width they
  // have with all four columns open; room freed by folded columns becomes extra slots,
  // given first to the column hiding the most cards, then to the one with the most cards.
  // Returns { cardW, slots: {state key → n} } or null before the board is measured.
  slotLayout(open, foldedAny) {
    if (!this.boardW || !this.boardH) return null;
    const inner = this.boardW - 2 * BOARD_PAD_X;
    const cardW = Math.max(200, Math.floor((inner - 3 * COL_GAP) / 4 - SCROLL_LANE));
    const avail = inner - (foldedAny ? FOLDED_W + COL_GAP : 0);
    const colW = (s) => s * cardW + (s - 1) * CARD_GAP + SCROLL_LANE;
    const slots = Object.fromEntries(open.map(o => [o.state.key, 1]));
    const used = () => open.reduce((w, o) => w + colW(slots[o.state.key]), 0) + (open.length - 1) * COL_GAP;
    const rows = this.rowsFit(false);
    for (;;) {
      const need = open
        .map(o => ({ o, s: slots[o.state.key], n: o.cards.length }))
        .filter(x => x.n > x.s) // another slot shows more of this column side by side
        .sort((a, b) => (b.n - b.s * rows) - (a.n - a.s * rows) || b.n / b.s - a.n / a.s)[0];
      if (!need) break;
      slots[need.o.state.key]++;
      if (used() > avail) { slots[need.o.state.key]--; break; }
    }
    return { cardW, slots, colW };
  }

  column(state, cards, lay) {
    const id = `col-${state.key}`;
    const s = lay?.slots[state.key] ?? 1;
    let fits = lay ? this.rowsFit(false) * s : cards.length;
    if (cards.length > fits) fits = this.rowsFit(true) * s; // the footer takes room too
    const hidden = Math.max(0, cards.length - fits);
    // Cards flow left to right, then wrap (like floats), at a fixed width.
    const cardsEl = lay
      ? h_flex().w_full().flex_wrap().content_start().gap(CARD_GAP)
          .children(cards.map(a => div().w(lay.cardW).flex_none().child(this.card(a, state))))
      : v_flex().w_full().gap(CARD_GAP).children(cards.map(a => this.card(a, state)));
    return v_flex().flex_1().min_h(0).w_full().gap(6)
      .child(div().relative().flex_1().min_h(0).w_full()
        .child(v_flex().id(id).size_full().overflow_y_scroll().pr(lay ? SCROLL_LANE : (hidden ? 10 : 0))
          .child(cardsEl))
        .when(hidden > 0, el => el.child(Scrollbar.vertical(id).mode("always").absolute().inset_0())))
      .when(hidden > 0, el => el.child(h_flex().h(FOOTER_H).flex_none().justify_center().items_center().gap(6).rounded(6)
        .bg(state.wash).text_size(10.5).text_color(state.color)
        .child(div().child(`${cards.length} cards · scroll to see all`)).child(div().child("↕"))));
  }

  // One row of a picker popup.
  option(id, selected, lead, label, count, onPick) {
    return h_flex().id(id).w_full().h(30).flex_none().px(10).gap(8).items_center().rounded(6)
      .bg(selected ? "#eeebfc" : C.white).cursor_pointer().hover(s => s.bg(selected ? "#eeebfc" : C.bg))
      .on_click(onPick)
      .child(lead)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(selected ? C.violet : C.ink).child(label))
      .child(div().flex_none().text_size(10).text_color(C.muted).child(String(count)));
  }

  // ---- Space popup: filter, plus what Herdr's spaces sidebar shows and does ----
  // Reads each listed space's git (here or on its machine) when the popup opens;
  // the shared cache shows the last answer at once meanwhile.
  refreshGit(cx, everywhere = false) {
    const f = filter();
    const list = spaces().filter(s => everywhere || !f.machine || machineKey(s.machine) === f.machine);
    this.gitLoading = true;
    cx.spawn(async (cx) => {
      const found = await Promise.all(list.map(async (s) => {
        const folder = place(s);
        if (!folder) return [s.id, null];
        try { return [s.id, await gitInfo(folder, s.machine)]; }
        catch { return [s.id, undefined]; } // machine away: keep the cached answer
      }));
      const cache = { ...(shared(GIT_KEY) ?? {}) };
      for (const [id, g] of found) if (g !== undefined) cache[id] = g;
      setShared(GIT_KEY, cache);
      this.gitLoading = false;
      cx.notify();
    });
  }

  // "repo · branch ↑2 ↓1 ±3": only what's unusual. The repo goes on worktree rows and
  // when the name says it; the branch goes for main/master or when the name says it.
  gitTail(g, tree, name) {
    if (!g) return div().flex_1();
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const raw = g.branch ?? "detached";
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" · ");
    return h_flex().flex_1().min_w(0).gap(5).justify_end().items_center().text_size(10.5).text_color(C.muted)
      .when(!!where, el => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, el => el.child(div().flex_none().text_color("#2f9a63").child(`↑${g.ahead}`)))
      .when(g.behind > 0, el => el.child(div().flex_none().text_color("#c2493d").child(`↓${g.behind}`)))
      .when(g.changes > 0, el => el.child(div().flex_none().text_color("#c98a1c").child(`±${g.changes}`)));
  }

  spacePicker() {
    const f = filter();
    const overlay = props().overlay;
    const pick = (patch) => { setFilter(patch); closeOverlay(overlay); };
    const all = allAgents();
    const git = shared(GIT_KEY) ?? {};
    const list = spaces().filter(s => !f.machine || machineKey(s.machine) === f.machine);
    const inScope = all.filter(a => !f.machine || spaceMachine(a.space) === f.machine);
    const title = f.machine ? `Workspace on ${machineName(f.machine)}` : "Workspace";
    const row = ({ s, g, tree }) => {
      const selected = f.space === s.id;
      return h_flex().id(`opt-${s.id}`).w_full().h(30).flex_none().pl(tree ? 22 : 10).pr(4).gap(8).items_center().rounded(6)
        .bg(selected ? "#eeebfc" : C.white).cursor_pointer().hover(st => st.bg(selected ? "#eeebfc" : C.bg))
        .on_click(() => pick({ space: s.id }))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); closeOverlay(overlay); openSpaceMenu(s); })
        .child(tree
          ? h_flex().flex_none().gap(4).items_center().text_color("#b7bcc6").child(div().text_size(11).child(tree))
              .child(svg("mods/workspace-chrome/git-branch.svg").size(11).text_color(C.muted))
          : dot(STATES.find(x => x.key === s.status)?.color ?? "#d5d9e0", 7))
        .child(div().flex_shrink(0).max_w(tree ? 150 : 180).truncate().text_size(12).text_color(selected ? C.violet : C.ink)
          .child(s.name))
        .child(this.gitTail(g, tree, s.name))
        .child(div().flex_none().w(16).text_size(10).text_color(C.muted).child(String(all.filter(a => a.space === s.id).length)))
        // Go there: make it the active space (the Live workspace follows), keep the filter.
        .child(h_flex().id(`go-${s.id}`).flex_none().size(22).justify_center().items_center().rounded(5)
          .text_color(s.active ? C.violet : C.muted).tooltip(s.active ? "Current space" : "Go to space")
          .hover(st => st.bg("#eeebfc").text_color(C.violet))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); closeOverlay(overlay); run("space.select", { id: s.id }); })
          .child(svg(`mods/workspace-chrome/${s.active ? "check" : "chevron-right"}.svg`).size(13)));
    };
    return v_flex().w_full().p(5).bg(C.white).text_size(12)
      .child(h_flex().px(10).pt(2).pb(4).items_center().gap(6)
        .child(div().flex_1().text_size(11).text_color(C.muted).child(title))
        .when(!!this.gitLoading, el => el.child(div().text_size(10).text_color("#b7bcc6").child("git…")))
        .child(iconButton("space-order", "settings", "Space order", (e) => { closeOverlay(overlay); openOrder(anchorBelowRight(e, ORDER_W)); })))
      .child(this.spaceList(list, git, row, f, inScope, pick));
  }

  // The rows under machine headers; past the popup's height an always-visible
  // scrollbar shows there is more (as the board's columns do).
  spaceList(list, git, row, f, inScope, pick) {
    const groups = new Set(list.map(s => machineKey(s.machine))).size;
    const overflow = (list.length + 1) * 32 + groups * 24 > PICK_MAX_ROWS * 32;
    return div().relative().w_full()
      .child(v_flex().id("pick-space").w_full().max_h(PICK_MAX_ROWS * 32).overflow_y_scroll().pr(overflow ? 10 : 0).gap(2)
        .child(this.option("opt-all", !f.space, dot(C.muted, 7), "All spaces", inScope.length, () => pick({ space: null })))
        // Grouped under a header per machine (names alone; the header says where).
        .children(machineList().flatMap(m => {
          const mine = list.filter(s => machineKey(s.machine) === m.key);
          if (!mine.length) return [];
          return [
            h_flex().h(22).flex_none().px(10).pt(4).gap(6).items_center()
              .child(svg(`mods/workspace-chrome/${m.key === LOCAL ? "monitor" : "server"}.svg`).size(10).text_color(C.muted))
              .child(div().text_size(10).text_color(C.muted).child(m.name)),
            ...nestSpaces(mine, git).map(row),
          ];
        })))
      .when(overflow, el => el.child(Scrollbar.vertical("pick-space").mode("always").absolute().inset_0()));
  }

  // ---- Space order popup: drag within a machine (space.move) ----
  // A machine's spaces as blocks: a top-level space and the worktree spaces nested
  // under it (as nestSpaces shows them). A top-level space moves as a block with its
  // worktrees; a worktree space moves only among its siblings, under the same space.
  orderBlocks(key) {
    const git = shared(GIT_KEY) ?? {};
    const blocks = [];
    for (const r of nestSpaces(spaces().filter(s => machineKey(s.machine) === key), git)) {
      if (!r.tree || !blocks.length) blocks.push({ main: r.s, kids: [] });
      else blocks[blocks.length - 1].kids.push(r.s);
    }
    return blocks;
  }
  // Puts machine `key`'s spaces in the order of `ids`. Its places in the whole list
  // stay its own; the moves are simulated so later indexes include earlier ones.
  applyOrder(key, ids) {
    const all = spaces();
    const order = all.map(s => s.id);
    const slots = all.map((s, i) => machineKey(s.machine) === key ? i : -1).filter(i => i >= 0);
    ids.forEach((id, n) => {
      const to = slots[n], from = order.indexOf(id);
      if (to === undefined || from < 0 || from === to) return;
      run("space.move", { id, index: to + 1 });
      order.splice(to, 0, order.splice(from, 1)[0]);
    });
  }
  flatOrder(blocks) {
    return blocks.flatMap(b => [b.main.id, ...b.kids.map(k => k.id)]);
  }
  // Both top-level spaces, or both worktrees under the same space.
  canDrop(blocks, from, over) {
    if (!from || !over || from === over) return false;
    const isMain = (id) => blocks.some(b => b.main.id === id);
    const parent = (id) => blocks.find(b => b.kids.some(k => k.id === id));
    if (isMain(from)) return isMain(over);
    const p = parent(from);
    return !!p && p === parent(over);
  }
  dropSpace(key, from, over) {
    const blocks = this.orderBlocks(key);
    if (!this.canDrop(blocks, from, over)) return;
    const bi = (id) => blocks.findIndex(b => b.main.id === id);
    if (bi(from) >= 0) {
      const [blk] = blocks.splice(bi(from), 1);
      blocks.splice(bi(over) + (this.dropAfter ? 1 : 0), 0, blk);
    } else {
      const p = blocks.find(b => b.kids.some(k => k.id === from));
      const [kid] = p.kids.splice(p.kids.findIndex(k => k.id === from), 1);
      p.kids.splice(p.kids.findIndex(k => k.id === over) + (this.dropAfter ? 1 : 0), 0, kid);
    }
    this.applyOrder(key, this.flatOrder(blocks));
  }
  // A–Z: top-level spaces by name, each one's worktrees by name under it.
  sortByName(key) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    const blocks = this.orderBlocks(key)
      .map(b => ({ main: b.main, kids: [...b.kids].sort(byName) }))
      .sort((a, b) => byName(a.main, b.main));
    this.applyOrder(key, this.flatOrder(blocks));
  }

  orderList() {
    const all = spaces();
    const groups = machineList()
      .map(m => ({ m, blocks: this.orderBlocks(m.key) }))
      .filter(g => g.blocks.length);
    const blocksOf = (s) => groups.find(g => g.m.key === machineKey(s.machine))?.blocks ?? [];
    // Where a drop lands: past the target when dragging downwards (a block lands
    // after the target's whole block), before it when dragging upwards.
    const pos = (blocks, id) => this.flatOrder(blocks).indexOf(id);
    const row = (s, tree) => {
      const blocks = blocksOf(s);
      const dragging = this.pressed === s.id;
      const inDraggedBlock = blocks.some(b => b.main.id === this.pressed && b.kids.some(k => k.id === s.id));
      const target = this.pressed && this.over === s.id && this.pressed !== s.id;
      const down = target && pos(blocks, this.pressed) < pos(blocks, s.id);
      // A block dropped downwards goes after the target's worktrees: mark its last row.
      const block = blocks.find(b => b.main.id === s.id);
      const markBelowBlock = target && down && !tree && block?.kids.length;
      return h_flex().id(`ord-${s.id}`).relative().w_full().h(30).flex_none().pl(tree ? 26 : 8).pr(8).gap(8).items_center().rounded(6)
        .bg(s.active ? "#f3f1fd" : C.white).cursor_pointer().hover(st => st.bg(C.bg))
        .when((dragging || inDraggedBlock) && this.over !== s.id, el => el.opacity(0.5))
        .when(target && !markBelowBlock, el => el.child(div().absolute().left(tree ? 22 : 0).right(0).h(2).bg(C.violet)
          .when(down, l => l.bottom(0)).when(!down, l => l.top(0))))
        .when(!!this.markAfter && this.markAfter === s.id, el => el.child(div().absolute().left(0).right(0).h(2).bg(C.violet).bottom(0)))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.pressed = s.id; this.over = s.id; this.markAfter = null; cx.notify(); })
        .on_mouse_move((_e, cx) => {
          if (!this.pressed) return;
          const src = all.find(x => x.id === this.pressed);
          const ok = src && machineKey(src.machine) === machineKey(s.machine) && this.canDrop(blocks, this.pressed, s.id);
          const over = ok ? s.id : null;
          const after = ok && pos(blocks, this.pressed) < pos(blocks, s.id);
          const blk = ok && after ? blocks.find(b => b.main.id === s.id) : null;
          const markAfter = blk?.kids.length ? blk.kids[blk.kids.length - 1].id : null;
          if (this.over !== over || this.markAfter !== markAfter) { this.over = over; this.dropAfter = after; this.markAfter = markAfter; cx.notify(); }
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed, over = this.over;
          this.pressed = null; this.over = null; this.markAfter = null;
          if (from && over === s.id) this.dropSpace(machineKey(s.machine), from, over);
          cx.notify();
        })
        .child(div().flex_none().text_size(12).text_color("#b7bcc6").child("⠿"))
        .child(tree
          ? h_flex().flex_none().gap(4).items_center().text_color("#b7bcc6").child(div().text_size(11).child(tree))
              .child(svg("mods/workspace-chrome/git-branch.svg").size(11).text_color(C.muted))
          : dot(STATES.find(x => x.key === s.status)?.color ?? "#d5d9e0", 7))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.ink).child(s.name))
        .child(div().flex_none().text_size(10).text_color(C.muted).child(`${s.tabs?.length ?? 0} tab${s.tabs?.length === 1 ? "" : "s"}`));
    };
    return v_flex().id("space-order").w_full().p(8).bg(C.white).text_size(12)
      .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.over = null; cx.notify(); })
      .child(h_flex().px(4).items_center()
        .child(div().flex_1().text_size(13).font_semibold().text_color(C.ink).child("Space order"))
        .child(div().text_size(10.5).text_color(C.muted).child("Esc")))
      .child(div().px(4).pt(2).pb(6).text_size(10.5).text_color(C.muted)
        .child(this.gitLoading ? "Drag to reorder · reading git…" : "Drag to reorder. Worktrees move with their space."))
      .child(v_flex().id("order-list").w_full().max_h(ORDER_MAX - 64).overflow_y_scrollbar().gap(2)
        .children(groups.flatMap(({ m, blocks }) => [
          h_flex().h(28).flex_none().px(6).gap(6).items_center()
            .child(svg(`mods/workspace-chrome/${m.key === LOCAL ? "monitor" : "server"}.svg`).size(11).text_color(C.muted))
            .child(div().flex_1().text_size(10.5).text_color(C.muted).child(m.name))
            .child(h_flex().id(`az-${m.key}`).h(20).px(7).items_center().rounded(5).border(1).border_color(C.line)
              .text_size(10).text_color("#5f6775").cursor_pointer().hover(st => st.border_color(C.violet).text_color(C.violet))
              .tooltip("Sort this machine's spaces by name")
              .on_click(() => this.sortByName(m.key)).child("A–Z")),
          ...blocks.flatMap(b => [
            row(b.main, null),
            ...b.kids.map((k, n) => row(k, n === b.kids.length - 1 ? "└" : "├")),
          ]),
        ])));
  }

  picker(kind) {
    const f = filter();
    const overlay = props().overlay;
    const pick = (patch) => { setFilter(patch); closeOverlay(overlay); };
    const all = allAgents();
    let title, rows;
    if (kind === "machine") {
      title = "Machine";
      const LAYOUT_DOT = { ready: "#39a380", loading: "#d79032", unavailable: "#c2493d" };
      rows = [this.option("opt-all", !f.machine, dot(C.muted, 7), "All machines", all.length, () => pick({ machine: null }))]
        .concat(machineList().map(m => this.option(`opt-${m.key}`, f.machine === m.key,
          dot(LAYOUT_DOT[m.layout] ?? C.muted, 7), m.layout === "ready" ? m.name : `${m.name} (${m.layout})`,
          all.filter(a => spaceMachine(a.space) === m.key).length,
          // Keep the picked space only if it lives on the new machine (filter() drops it otherwise).
          () => pick({ machine: m.key }))))
        // Herdr's Add machine dialog (ssh hosts, setup), as the default sidebar opens it.
        .concat([
          div().mx(6).my(2).h(1).flex_none().bg(C.line),
          h_flex().id("opt-add-machine").w_full().h(30).flex_none().px(10).gap(8).items_center().rounded(6)
            .bg(C.white).cursor_pointer().hover(s => s.bg(C.bg))
            .on_click(() => { closeOverlay(overlay); run("mod.open", { name: "machine-add" }); })
            .child(svg("mods/workspace-chrome/plus.svg").size(12).flex_none().text_color(C.violet))
            .child(div().flex_1().text_size(12).text_color(C.violet).child("Add machine…")),
        ]);
    } else if (kind === "space") {
      return this.spacePicker();
    } else {
      title = "Agent type";
      rows = [this.option("opt-all", !f.type, dot(C.muted, 7), "All agents", all.length, () => pick({ type: null }))]
        .concat(agentTypes().map(t => this.option(`opt-${t.key}`, f.type === t.key,
          icon(t.program, 15), t.program.name, t.count, () => pick({ type: t.key }))));
    }
    return v_flex().w_full().p(5).bg(C.white).text_size(12)
      .child(kind === "machine"
        // The Machine popup's title row holds the Machine order button, as the Space popup's does.
        ? h_flex().px(10).pt(2).pb(4).items_center().gap(6)
            .child(div().flex_1().text_size(11).text_color(C.muted).child(title))
            .child(iconButton("machine-order", "settings", "Machine order", (e) => { closeOverlay(overlay); openMachineOrder(anchorBelowRight(e, ORDER_W)); }))
        : div().px(10).pt(4).pb(6).text_size(11).text_color(C.muted).child(title))
      .child(v_flex().id(`pick-${kind}`).w_full().max_h(PICK_MAX_ROWS * 32).overflow_y_scrollbar().gap(2).children(rows));
  }

  // ---- Machine order popup: drag a machine (the board's own order; no nesting) ----
  machineOrderList() {
    const list = machineList();
    const ids = list.map(m => m.key);
    const set = (keys) => setShared(MACHINE_ORDER_KEY, keys);
    const LAYOUT_DOT = { ready: "#39a380", loading: "#d79032", unavailable: "#c2493d" };
    const row = (m, i) => {
      const dragging = this.pressed === m.key;
      const target = this.pressed && this.over === m.key && !dragging;
      const down = target && ids.indexOf(this.pressed) < i;
      const count = spaces().filter(s => machineKey(s.machine) === m.key).length;
      return h_flex().id(`mord-${m.key}`).relative().w_full().h(30).flex_none().px(8).gap(8).items_center().rounded(6)
        .bg(C.white).cursor_pointer().hover(st => st.bg(C.bg))
        .when(dragging && this.over !== m.key, el => el.opacity(0.5))
        .when(target, el => el.child(div().absolute().left(0).right(0).h(2).bg(C.violet)
          .when(down, l => l.bottom(0)).when(!down, l => l.top(0))))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.pressed = m.key; this.over = m.key; cx.notify(); })
        .on_mouse_move((_e, cx) => {
          if (this.pressed && this.over !== m.key) { this.over = m.key; cx.notify(); }
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed;
          this.pressed = null; this.over = null;
          if (from && from !== m.key) {
            const next = ids.filter(k => k !== from);
            next.splice(next.indexOf(m.key) + (ids.indexOf(from) < i ? 1 : 0), 0, from);
            set(next);
          }
          cx.notify();
        })
        .child(div().flex_none().text_size(12).text_color("#b7bcc6").child("⠿"))
        .child(svg(`mods/workspace-chrome/${m.key === LOCAL ? "monitor" : "server"}.svg`).size(12).flex_none().text_color(LAYOUT_DOT[m.layout] ?? C.muted))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.ink).child(m.name))
        .child(div().flex_none().text_size(10).text_color(C.muted).child(`${count} space${count === 1 ? "" : "s"}`));
    };
    const smallButton = (id, label, tip, action) => h_flex().id(id).h(20).px(7).items_center().rounded(5).border(1).border_color(C.line)
      .text_size(10).text_color("#5f6775").cursor_pointer().hover(st => st.border_color(C.violet).text_color(C.violet))
      .tooltip(tip).on_click(action).child(label);
    return v_flex().id("machine-order").w_full().p(8).bg(C.white).text_size(12)
      .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.over = null; cx.notify(); })
      .child(h_flex().px(4).items_center()
        .child(div().flex_1().text_size(13).font_semibold().text_color(C.ink).child("Machine order"))
        .child(div().text_size(10.5).text_color(C.muted).child("Esc")))
      .child(h_flex().px(4).pt(2).pb(6).gap(6).items_center()
        .child(div().flex_1().text_size(10.5).text_color(C.muted).child("Drag to reorder. Used across the board."))
        .child(smallButton("mord-az", "A–Z", "Sort machines by name", () => set([...ids].sort((a, b) => machineName(a).localeCompare(machineName(b))))))
        .child(smallButton("mord-reset", "Default", "Herdr's order: this computer first, then by name", () => set(null))))
      .child(v_flex().id("machine-order-list").w_full().max_h(ORDER_MAX - 64).overflow_y_scrollbar().gap(2)
        .children(list.map(row)));
  }

  // Files / Changes: toggle the layout's `panel` column (a stack `panel-body` of the
  // shipped files and changes mods), as Herdr's tab bar does. Which panels are offered
  // follows shared "workspace.panels" (set by Herdr's welcome), else both.
  // The panel is remembered per space, as Herdr's tab bar does: switching spaces shows
  // that space's last choice (closed if it never had one); opening or closing records it.
  // Kept in this copy's localStorage, so it survives restarts.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    this.panels ??= JSON.parse(localStorage.getItem("panels") ?? "{}");
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.panelSpace) {
      const first = this.panelSpace === undefined;
      this.panelSpace = space.id; this.panelPending = null;
      // On start, keep what's shown unless this space has a stored choice.
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.panelPending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else wins), the old state isn't a choice.
    if (this.panelPending) {
      if (this.panelPending.want !== now && Date.now() < this.panelPending.until) return;
      this.panelPending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  panelButtons() {
    const root = layout();
    const panel = findNode(root, "panel"), body = findNode(root, "panel-body");
    if (!panel || !body) return [];
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(spaces().find(s => s.active), panel, body, enabled);
    const btn = (id, label, iconPath) => {
      const on = !panel.hidden && body.active === id;
      return h_flex().id(`panel-${id}`).h(27).px(10).gap(6).flex_none().items_center().rounded(6)
        .bg(on ? "#eeebfc" : C.white).border(1).border_color(on ? "#ddd7f9" : C.line)
        .text_size(11).text_color(on ? C.violet : "#5f6775")
        .cursor_pointer().hover(s => s.border_color(C.violet))
        .on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        })
        .child(svg(iconPath).size(13).text_color(on ? C.violet : "#5f6775")).child(div().child(label));
    };
    return [
      enabled.includes("files") && btn("files", "Files", "mods/files/file.svg"),
      enabled.includes("changes") && btn("changes", "Changes", "mods/changes/changes.svg"),
    ].filter(Boolean);
  }

  // Minimize / maximize (restore) / close, drawn only where the system draws none
  // (the layout hides the title bar). Windows uses Herdr's vector window icons.
  windowButtons() {
    const w = window();
    const win = w.platform === "windows";
    const btn = (id, glyph, action, danger) => h_flex().id(id).w(34).h(27).flex_none().justify_center().items_center().rounded(6)
      .text_color("#5f6775").cursor_pointer()
      .hover(s => danger ? s.bg("#e5484d").text_color(C.white) : s.bg(C.bg).text_color(C.ink))
      .on_mouse_down("left", stop).on_click(action).child(glyph);
    return [
      btn("win-minimize", win ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")),
      btn("win-maximize", win ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : (w.maximized ? "❐" : "□"), () => run("window.maximize")),
      btn("win-close", win ? svg("mods/tabs/win-close.svg").size(16) : "✕", () => run("window.close"), true),
    ];
  }

  header(list, active) {
    const f = filter();
    const all = allAgents();
    const sp = f.space ? spaces().find(s => s.id === f.space) : null;
    const ty = f.type ? agentTypes().find(t => t.key === f.type) : null;
    const filtered = !!(f.machine || f.space || f.type);
    const spaceCount = spaces().filter(s => !f.machine || machineKey(s.machine) === f.machine).length;
    const caret = (txt) => h_flex().gap(6).items_center().child(div().child(txt)).child(div().text_size(9).child("▾"));
    // "N agents · M terminals", leaving out a part that is zero.
    const kinds = (xs) => {
      const t = xs.filter(a => a.terminal).length, n = xs.length - t;
      return [`${n} agent${n === 1 ? "" : "s"}`, t ? `${t} terminal${t === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
    };
    const count = filtered
      ? `${list.length} of ${all.length} shown (${kinds(list)})`
      : `${kinds(all)} across ${spaces().length} spaces`;
    // One title bar: the board mark, then the filters (the space's name is already
    // on the tab bar below); on the right the count, create/settings, panels, window buttons.
    return h_flex().size_full().bg(C.white).pl(22).pr(14).items_center().gap(7)
        .child(h_flex().gap(3).items_center().mr(8).children([17, 12, 20].map(h => div().w(5).h(h).rounded(2).bg(C.violet))))
        .child(chip("chip-board", "Board", !filtered, () => setShared(FILTER_KEY, { machine: null, space: null, type: null })))
        .child((() => {
          // The Machine chip carries the connection state: a colored dot, details on hover.
          const cs = connectionState();
          return chip("chip-machine",
            h_flex().gap(6).items_center().child(dot(cs.color, 6)).child(caret(f.machine ? machineName(f.machine) : "All machines")),
            !!f.machine, (at) => openPicker("machine", machineList().length, at))
            .tooltip(cs.tip);
        })())
        .child(chip("chip-space", caret(sp ? (f.machine ? sp.name : spaceLabel(sp)) : "All spaces"), !!sp, (at) => openPicker("space", spaceCount, at)))
        .child(chip("chip-type", caret(ty ? ty.program.name : "All agents"), !!ty, (at) => openPicker("type", agentTypes().length, at)))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(C.muted).mr(6).child(count))
        .child(iconButton("board-create", "plus", "New space or tab", (e) =>
          openOverlay({ mod: "dynamic-board", kind: "popup", width: CREATE_W, height: 860, at: anchorBelowRight(e, CREATE_W), props: { role: "create" } })))
        .child(iconButton("board-settings", "settings", "Settings", () => run("app.settings")))
        .child(div().w(6))
        .children(this.panelButtons())
        .when(!!window()?.buttons, el => el.child(div().w(8)).children(this.windowButtons()));
  }

  render() {
    const role = props()?.role;
    const active = spaces().find(s => s.active);
    if (role === "pick") return this.picker(props().kind);
    if (role === "order") return this.orderList();
    if (role === "morder") return this.machineOrderList();
    if (role === "menu") return this.menu();
    if (role === "create") return this.createForm();
    if (role === "header") return this.header(filteredAgents(), active);
    if (role === "terminals") {
      const tab = active?.tabs.find(t => t.active);
      return h_flex().size_full().px(16).items_center().gap(8).bg(C.white)
        .child(dot(C.violet)).child(div().text_size(12).font_semibold().text_color(C.ink).child("Live workspace"))
        .child(div().text_size(11).text_color(C.muted).child(`${active?.name ?? ""} / ${tab?.name ?? ""}`))
        .child(div().flex_1()).child(div().text_size(10).text_color(C.muted).child("TERMINALS"));
    }
    if (role === "pane") {
      const p = panes().find(p => p.pane === props().pane);
      return h_flex().size_full().px(13).items_center().gap(7).bg("#fafbfc").border_b(1).border_color(C.line)
        .child(icon(p?.program, 14)).child(div().text_size(11).text_color(C.ink).child(p?.program?.name ?? "Terminal"))
        .child(div().flex_1()).child(dot(STATES.find(s => s.key === p?.status)?.color ?? C.muted, 6));
    }
    const list = filteredAgents();
    // agent.next/prev walk the paned agents only; sub-agents are reached from their cards.
    setAgentOrder(STATES.flatMap(s => list.filter(a => !a.sub && !a.terminal && a.status === s.key).map(a => a.address)));
    this.subsByRoot = {};
    for (const a of list) if (a.sub) (this.subsByRoot[a.root] ??= []).push(a);
    const groups = STATES.map(state => ({ state, cards: list.filter(a => a.status === state.key) }));
    const open = groups.filter(g => g.cards.length);
    const folded = groups.filter(g => !g.cards.length);
    const lay = this.slotLayout(open, folded.length > 0);
    const title = (state, n, muted) => h_flex().h(27).flex_none().items_center().gap(8).px(3)
      .child(dot(state.color, 8))
      .child(div().text_size(13).font_semibold().text_color(muted ? C.muted : C.ink).truncate().child(state.label))
      .child(div().px(6).py(2).rounded(4).bg(state.wash).text_size(10).text_color(state.color).child(String(n)));
    return h_flex().id("root").relative().size_full().px(BOARD_PAD_X).py(17).gap(COL_GAP).bg(C.bg)
      .on_size_change((size, cx) => {
        if (Math.abs((this.boardH ?? 0) - size.height) >= 1 || Math.abs((this.boardW ?? 0) - size.width) >= 1) {
          this.boardH = size.height; this.boardW = size.width; cx.notify();
        }
      })
      // Columns with no agents fold away to the far left: just their titles, stacked.
      .when(folded.length > 0, el => el.child(v_flex().id("folded").w(FOLDED_W).flex_none().h_full().gap(4)
        .children(folded.map(g => title(g.state, 0, true)))))
      .children(open.map(({ state, cards }) => {
        const col = v_flex().min_w(0).h_full().gap(9)
          .child(title(state, cards.length, false))
          .child(this.column(state, cards, lay));
        return lay ? col.w(lay.colW(lay.slots[state.key])).flex_none() : col.flex_1();
      }))
      // Top right, on the column-title line: the board's height in card rows, − / +.
      .when(!!this.boardH, el => el.child(this.rowControl()));
  }
}
