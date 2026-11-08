import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, theme, layouts, props } from "herdr";

// A small top-bar button that switches to another layout.
// props: { to: "<layout name>", label?: "<text>" }
export default class LayoutSwitch extends View {
  render() {
    const t = theme();
    const p = props() ?? {};
    const to = p.to ?? "Board-isitea";
    const label = p.label ?? to;
    const ok = layouts().includes(to);
    return h_flex().size_full().items_center().justify_center().bg(t.chrome).child(
      h_flex().id("layout-switch").h(26).px(10).gap(6).items_center().rounded(6)
        .border(1).border_color(t.border).bg(t.surface)
        .text_size(12).text_color(ok ? t.foreground : t.dim)
        .cursor_pointer().hover((s) => s.bg(t.hover).border_color(t.accent))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => { if (ok) run("layout.switch", { name: to }); })
        .child(div().size(7).rounded(7).bg(t.accent))
        .child(div().child(label)));
  }
}
