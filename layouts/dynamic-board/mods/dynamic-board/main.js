// dynamic-board: modified from the `board` mod in herdrdev/herdr-layout-examples
// (https://github.com/herdrdev/herdr-layout-examples, Apache License 2.0; see LICENSE).
// Changes by isitea, 2026-11: Machine/Space/Agent filter chips, button-anchored popups,
// card context menu (tab + space + worktree), machine tags, Create (+) popup and
// settings button, folding empty columns to the left, float-style card slots,
// sub-agent cards linked to their parent, plain terminals as a Terminal type,
// Files/Changes panel toggles remembered per space, window buttons, and the renamed mod/layout names.
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
// This computer first, then other machines by name: from machines() and from spaces.
function machineList() {
  const keys = new Set([LOCAL]);
  for (const m of machines()) keys.add(machineKey(m.name));
  for (const s of spaces()) keys.add(machineKey(s.machine));
  const state = Object.fromEntries(machines().map(m => [machineKey(m.name), m.layout]));
  return [...keys].sort((a, b) => (a === LOCAL ? -1 : b === LOCAL ? 1 : a.localeCompare(b)))
    .map(key => ({ key, name: machineName(key), layout: state[key] ?? "ready" }));
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
  return allAgents().filter(a => (!f.machine || spaceMachine(a.space) === f.machine)
    && (!f.space || a.space === f.space) && (!f.type || typeKey(a) === f.type));
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
    { section: `Tab · ${tab?.name ?? p.tabName ?? ""}` },
    { label: "Rename tab", command: "tab.rename", args: { id: p.tab } },
    { label: "New tab", command: "tab.new", args: { space: p.space } },
    { label: "Close tab", command: "tab.close", args: { id: p.tab } },
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
const BOARD_PAD_X = 24, COL_GAP = 16, SCROLL_LANE = 10; // SCROLL_LANE: room kept for a column's scrollbar
const PICK_MAX_ROWS = 10;
function openPicker(kind, count, at) {
  // header (~30) + rows (30px + 2px gap) + padding; the list scrolls past PICK_MAX_ROWS.
  const rows = Math.min(count + 1, PICK_MAX_ROWS);
  openOverlay({ mod: "dynamic-board", props: { role: "pick", kind }, kind: "popup", width: 280, height: 44 + rows * 32, at: at ?? "pointer" });
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
          () => pick({ machine: m.key }))));
    } else if (kind === "space") {
      // Only the picked machine's spaces; the label drops the machine when it's implied.
      const list = spaces().filter(s => !f.machine || machineKey(s.machine) === f.machine);
      const inScope = all.filter(a => !f.machine || spaceMachine(a.space) === f.machine);
      title = f.machine ? `Workspace on ${machineName(f.machine)}` : "Workspace";
      rows = [this.option("opt-all", !f.space, dot(C.muted, 7), "All spaces", inScope.length, () => pick({ space: null }))]
        .concat(list.map(s => this.option(`opt-${s.id}`, f.space === s.id,
          dot(STATES.find(x => x.key === s.status)?.color ?? "#d5d9e0", 7),
          f.machine ? s.name : spaceLabel(s), all.filter(a => a.space === s.id).length, () => pick({ space: s.id }))));
    } else {
      title = "Agent type";
      rows = [this.option("opt-all", !f.type, dot(C.muted, 7), "All agents", all.length, () => pick({ type: null }))]
        .concat(agentTypes().map(t => this.option(`opt-${t.key}`, f.type === t.key,
          icon(t.program, 15), t.program.name, t.count, () => pick({ type: t.key }))));
    }
    return v_flex().w_full().p(5).bg(C.white).text_size(12)
      .child(div().px(10).pt(4).pb(6).text_size(11).text_color(C.muted).child(title))
      .child(v_flex().id(`pick-${kind}`).w_full().max_h(PICK_MAX_ROWS * 32).overflow_y_scrollbar().gap(2).children(rows));
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
    return v_flex().size_full().bg(C.white).px(26).justify_center().gap(12)
      .child(h_flex().items_center().gap(10)
        .child(h_flex().gap(3).items_center().children([17, 12, 20].map(h => div().w(5).h(h).rounded(2).bg(C.violet))))
        .child(div().text_size(20).font_semibold().text_color(C.ink)
          .child(sp ? spaceLabel(sp) : f.machine ? machineName(f.machine) : (active?.name ?? "Project board")))
        .child(div().text_size(19).text_color("#cbd0d9").child("/"))
        .child(div().text_size(14).text_color(C.muted).child("Agent board"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(C.muted).child(count))
        .child(div().w(6))
        .children(this.panelButtons())
        .when(!!window()?.buttons, el => el.child(div().w(8)).children(this.windowButtons())))
      .child(h_flex().gap(7).items_center()
        .child(chip("chip-board", "Board", !filtered, () => setShared(FILTER_KEY, { machine: null, space: null, type: null })))
        .child(chip("chip-machine", caret(f.machine ? machineName(f.machine) : "All machines"), !!f.machine, (at) => openPicker("machine", machineList().length, at)))
        .child(chip("chip-space", caret(sp ? (f.machine ? sp.name : spaceLabel(sp)) : "All spaces"), !!sp, (at) => openPicker("space", spaceCount, at)))
        .child(chip("chip-type", caret(ty ? ty.program.name : "All agents"), !!ty, (at) => openPicker("type", agentTypes().length, at)))
        .child(div().flex_1()).child(dot("#39a380", 6))
        .child(div().text_size(10).text_color(C.muted).child("Live updates"))
        .child(div().w(4))
        .child(iconButton("board-create", "plus", "New space or tab", (e) =>
          openOverlay({ mod: "dynamic-board", kind: "popup", width: CREATE_W, height: 860, at: anchorBelowRight(e, CREATE_W), props: { role: "create" } })))
        .child(iconButton("board-settings", "settings", "Settings", () => run("app.settings"))));
  }

  render() {
    const role = props()?.role;
    const active = spaces().find(s => s.active);
    if (role === "pick") return this.picker(props().kind);
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
    return h_flex().id("root").size_full().px(BOARD_PAD_X).py(17).gap(COL_GAP).bg(C.bg)
      .on_size_change((size, cx) => {
        if (Math.abs(this.boardH - size.height) >= 1 || Math.abs((this.boardW ?? 0) - size.width) >= 1) {
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
      }));
  }
}
