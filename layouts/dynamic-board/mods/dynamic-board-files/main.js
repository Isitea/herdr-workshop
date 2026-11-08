// A lazy file browser for the focused pane's folder, with bounded read-only previews.
// dynamic-board-files: a clone of Herdr's shipped `files` mod (0.1.13) for the dynamic-board
// layout, adding Download: a file from any machine into this computer's Downloads folder.
// Another machine's file comes over scp with the machine's own ssh name (`hc machine ls`),
// so it streams with no size cap but must finish within exec's 30 s; a machine reached
// through a command (`via`) sends it in base64 parts instead (sh, or PowerShell on a
// Windows machine), up to 100 MB (the header
// then says "100 MB limited"). File and folder icons are catppuccin/vscode-icons' Latte
// (light theme) or Macchiato (dark theme), drawn in their own colors.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, hc, home, appHome, readTextFile, watchFolder, theme, settings, window } from "herdr";
import { readFile, writeFile, exists, unlink, mkdir } from "fs/promises";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

// ---- Download ---------------------------------------------------------------------------
const VIA_LIMIT = 100 * 1024 * 1024, EXEC_LIMIT_MS = 29000;
const SLOW = "Took longer than 30 s (Herdr's limit for one command)";
const isWindows = () => window()?.platform === "windows";
const localJoin = (dir, name) => `${dir}${isWindows() ? "\\" : "/"}${name}`;
const downloadsDir = () => localJoin(home(), "Downloads");

// `name.ext`, else `name (1).ext`, `name (2).ext`… in dir, as browsers do.
async function freePath(dir, name) {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 0; i < 1000; i++) {
    const path = localJoin(dir, i ? `${base} (${i})${ext}` : name);
    if (!(await exists(path))) return path;
  }
  throw new Error("No free file name in Downloads");
}

async function machineInfo(on) {
  const r = await hc(["machine", "ls", "--json"]);
  const m = JSON.parse(r.stdout || "{}").machines?.find((m) => m.name === on);
  if (!m) throw new Error(`Machine ${on} is not known to herdr-core`);
  return m;
}

const B64 = new Uint8Array(128);
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").forEach((c, i) => { B64[c.charCodeAt(0)] = i; });
function fromBase64(text) {
  const s = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

// A machine reached through a command, not ssh: the file in 4 MiB base64 parts over exec,
// with sh (wc, dd, base64), or PowerShell where there is no sh (Windows), as files does.
const psQuote = (s) => "'" + s.replace(/['‘’‚‛]/g, "$&$&") + "'";
const viaTools = {
  sh: {
    size: (src) => ["sh", ["-c", 'wc -c < "$1"', "size", src]],
    part: (src, i) => ["sh", ["-c", 'dd if="$1" bs=4194304 skip="$2" count=1 2>/dev/null | base64', "part", src, String(i)]],
  },
  powershell: {
    size: (src) => ["powershell", ["-NoProfile", "-Command", `& { param($p) (Get-Item -LiteralPath $p -Force -ErrorAction Stop).Length } ${psQuote(src)}`]],
    part: (src, i) => ["powershell", ["-NoProfile", "-Command",
      "& { param($p, $i) $f = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite'); try { $null = $f.Seek([int64]$i * 4194304, 'Begin'); " +
      "$b = New-Object byte[] 4194304; $n = 0; while ($n -lt $b.Length) { $r = $f.Read($b, $n, $b.Length - $n); if ($r -le 0) { break }; $n += $r }; " +
      `[Convert]::ToBase64String($b, 0, $n) } finally { $f.Dispose() } } ${psQuote(src)} ${i}`]],
  },
};
async function viaParts(src, on, progress) {
  let tools = viaTools.sh, sized;
  try { sized = await exec(...tools.size(src), { on }); }
  catch (e) {
    if (!String(e).includes("cannot start sh: program not found")) throw e;
    tools = viaTools.powershell;
    sized = await exec(...tools.size(src), { on });
  }
  const size = Number(sized.stdout.trim());
  if (sized.code !== 0 || !Number.isFinite(size)) throw new Error(sized.stderr.trim() || "Cannot read this file");
  if (size > VIA_LIMIT) throw new Error(`${Math.round(size / 1048576)} MB: over the 100 MB limit for ${on}`);
  const out = new Uint8Array(size);
  for (let i = 0, at = 0; at < size; i++) {
    const r = await exec(...tools.part(src, i), { on });
    if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot read this file");
    const bytes = fromBase64(r.stdout);
    if (!bytes.length) break;
    out.set(bytes.subarray(0, size - at), at);
    at += bytes.length;
    progress(Math.min(1, at / size));
  }
  return out;
}

// Copies src from `on` (null: this computer) into Downloads; resolves with where it went.
async function download(src, on, progress) {
  const name = src.split(/[\\/]/).pop();
  const dir = downloadsDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  const dest = await freePath(dir, name);
  try {
    if (!on) { await writeFile(dest, await readFile(src)); return dest; }
    const m = await machineInfo(on);
    if (m.via) { await writeFile(dest, await viaParts(src, on, progress)); return dest; }
    const started = Date.now();
    let r;
    try { r = await exec("scp", ["-B", "-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", `${m.target || m.host}:${src}`, dest]); }
    catch (e) { throw Date.now() - started > EXEC_LIMIT_MS ? new Error(SLOW) : e; }
    if (r.code !== 0) throw new Error(Date.now() - started > EXEC_LIMIT_MS ? SLOW : r.stderr.trim() || `scp exited with ${r.code}`);
    return dest;
  } catch (e) {
    await unlink(dest).catch(() => {});
    throw e;
  }
}

// Shows a downloaded file in the system's file manager.
function reveal(path) {
  const p = window()?.platform;
  if (p === "windows") exec("explorer", [`/select,${path}`]).catch(() => {});
  else if (p === "macos") exec("open", ["-R", path]).catch(() => {});
  else exec("xdg-open", [path.slice(0, path.lastIndexOf("/")) || "/"]).catch(() => {});
}

// ---- Icons: catppuccin/vscode-icons (MIT, icons/LICENSE) --------------------------------
// Latte on a light theme, Macchiato on a dark one; map.json (scripts/update-icons.ps1)
// gives the icon for a file name, an extension or a folder name.
const ICONS = "mods/dynamic-board-files/icons";
let iconMap = null;
async function loadIconMap() {
  try { iconMap = JSON.parse(await readFile(`${appHome()}/${ICONS}/map.json`, "utf8")); }
  catch { iconMap = { fileNames: {}, fileExtensions: {}, folderNames: {} }; }
}
function isDark(color) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(color ?? ""));
  if (!m) return false;
  const [r, g, b] = m.slice(1, 4).map((h) => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
// A file's icon by its full name, then its extensions longest first ("d.ts" before "ts").
function iconName(name, dir, open) {
  const lower = name.toLowerCase();
  if (dir) {
    const folder = iconMap.folderNames[lower] ?? "_folder";
    return open ? `${folder}_open` : folder;
  }
  if (iconMap.fileNames[lower]) return iconMap.fileNames[lower];
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const icon = iconMap.fileExtensions[parts.slice(i).join(".")];
    if (icon) return icon;
  }
  return "_file";
}

export default class Files extends View {
  init(_props, cx) {
    if (!iconMap) cx.spawn(async cx => { await loadIconMap(); cx.notify(); });
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
      // A machine reached through a command downloads in base64 parts, capped at 100 MB.
      this.via = false;
      if (on && cx) {
        const context = this.context;
        cx.spawn(async cx => {
          const m = await machineInfo(on).catch(() => null);
          if (this.context === context && m?.via) { this.via = true; cx.notify(); }
        });
      }
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // One download at a time per file; the status line shows the latest.
  startDownload(path, cx) {
    const src = `${this.root}/${path}`, on = this.on, name = path.split("/").pop();
    if (this.dl?.state === "running" && this.dl.src === src && this.dl.on === on) return;
    const dl = this.dl = { src, on, name, state: "running", progress: null };
    cx.notify();
    cx.spawn(async cx => {
      try {
        dl.dest = await download(src, on, (p) => { dl.progress = p; cx.notify(); });
        dl.state = "done";
      } catch (e) {
        dl.state = "error";
        dl.error = String(e?.message ?? e).split("\n")[0];
      } finally { cx.notify(); }
    });
  }

  downloadButton(id, path, t, size = 22) {
    return h_flex().id(id).size(size).flex_none().rounded(6).items_center().justify_center().cursor_pointer()
      .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(this.via ? "Download to Downloads (100 MB limited)" : "Download to Downloads")
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.startDownload(path, cx); })
      .child(svg("mods/dynamic-board-files/download.svg").size(13));
  }

  statusLine(t) {
    const dl = this.dl;
    if (!dl) return null;
    const text = dl.state === "running" ? `Downloading ${dl.name}…${dl.progress != null ? ` ${Math.round(dl.progress * 100)}%` : ""}`
      : dl.state === "done" ? `Saved to Downloads: ${dl.dest.split(/[\\/]/).pop()}`
      : `Download failed: ${dl.error}`;
    return h_flex().h(32).flex_none().px(12).gap(8).items_center().border_t(1).border_color(t.border).text_size(12)
      .child(svg("mods/dynamic-board-files/download.svg").size(12).flex_none().text_color(dl.state === "error" ? t.ansi1 : dl.state === "done" ? t.ansi2 : t.muted))
      .child(div().flex_1().min_w(0).truncate().text_color(dl.state === "error" ? t.ansi1 : t.foreground).tooltip(dl.state === "error" ? dl.error : dl.dest ?? dl.src).child(text))
      .when(dl.state === "done", el => el.child(div().id("dl-show").flex_none().px(6).rounded(5).cursor_pointer().text_color(t.accent ?? t.foreground)
        .hover(s => s.bg(t.hover)).on_click(() => reveal(dl.dest)).child("Show")))
      .when(dl.state !== "running", el => el.child(div().id("dl-dismiss").flex_none().px(4).rounded(5).cursor_pointer().text_color(t.dim)
        .hover(s => s.bg(t.hover)).on_click((_e, cx) => { this.dl = null; cx.notify(); }).child("✕")));
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .when(!entry.dir, el => el.on_hover((hovered, cx) => {
          if (hovered) this.hovered = path; else if (this.hovered === path) this.hovered = null;
          cx.notify();
        }))
        .child(entry.dir ? svg(`mods/dynamic-board-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(iconMap
          ? image(`${ICONS}/${isDark(t.background) ? "macchiato" : "latte"}/${iconName(entry.name, entry.dir, open)}.svg`).size(16).flex_none()
          : svg(`mods/dynamic-board-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark)))
        .when(!entry.dir && this.hovered === path, el => el.child(this.downloadButton(`dl-${path}`, path, t, 20))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .when(this.via, el => el.child(div().id("files-via").flex_none().px(6).py(1).rounded(5).border_1().border_color(t.border).text_size(11).text_color(t.dim)
          .tooltip(`${this.on} is not reached over ssh: downloads come in parts, up to 100 MB a file`).child("100 MB limited")))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? ""))
        .when(Boolean(this.file), el => el.child(this.downloadButton("files-download", this.file, t))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().flex_1().min_h(0).p(12).text_color(t.dim).child(this.fileError || "Loading file…")))
      .when(Boolean(this.dl), el => el.child(this.statusLine(t)));
  }
}
