export class Motion {
  constructor() {
    this.mode = "none";
    this.reduced = matchMedia("(prefers-reduced-motion:reduce)");
    this.frames = new WeakMap();
  }
  active() { return this.mode !== "none" && !this.reduced.matches; }
  set(mode) {
    this.mode = ["auto", "full", "soft", "none"].includes(mode) ? mode : "none";
    document.body.dataset.motion = this.mode;
  }
  number(el, value) {
    if (!el) return;
    const next = value == null || value === "" ? NaN : Number(value);
    el.dataset.number = Number.isFinite(next) ? String(next) : "invalid";
    el.textContent = Number.isFinite(next) ? next.toLocaleString("zh-CN") : "—";
  }
  pop(el) {
    if (!el || !this.active()) return;
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160 });
  }
}
