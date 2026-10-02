/* Animation budget is separate from admissions state and data rendering. */
export class Motion {
  constructor() {
    this.mode = "auto";
    this.reduced = matchMedia("(prefers-reduced-motion:reduce)");
    this.coarse = matchMedia("(pointer:coarse)");
    this.canvas = document.querySelector("#ambient");
    this.ctx = this.canvas.getContext("2d");
    this.points = [];
    this.frame = 0;
    this.last = 0;
    this.pointer = { x: 0.5, y: 0.35 };
    this.frames = new WeakMap();
    this.lastViewport = {};
    this.reduced.addEventListener("change", () => this.sync());
    window.addEventListener("resize", () => this.resize(), { passive: true });
    document.addEventListener("visibilitychange", () => this.sync());
    if (!this.coarse.matches)
      document.addEventListener(
        "pointermove",
        (e) => {
          this.pointer = {
            x: e.clientX / innerWidth,
            y: e.clientY / innerHeight,
          };
          const card = e.target.closest(".result-card");
          if (card) {
            const r = card.getBoundingClientRect();
            card.style.setProperty("--mx", e.clientX - r.left + "px");
            card.style.setProperty("--my", e.clientY - r.top + "px");
          }
        },
        { passive: true },
      );
    document.addEventListener("click", (e) => {
      if (!this.active()) return;
      const b = e.target.closest(".button,.mini-action");
      if (!b) return;
      const r = b.getBoundingClientRect(),
        s = document.createElement("span");
      s.className = "ripple";
      s.style.left = e.clientX - r.left + "px";
      s.style.top = e.clientY - r.top + "px";
      b.appendChild(s);
      setTimeout(() => s.remove(), 650);
    });
    this.resize();
    this.sync();
  }
  active() {
    return this.mode !== "none" && !this.reduced.matches;
  }
  ambient() {
    return this.active() && this.mode !== "soft" && !document.hidden;
  }
  set(mode) {
    this.mode = ["auto", "full", "soft", "none"].includes(mode) ? mode : "auto";
    document.body.dataset.motion = this.mode;
    this.sync();
  }
  sync() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.ambient()) this.frame = requestAnimationFrame((t) => this.draw(t));
    else this.ctx.clearRect(0, 0, this.width || 1, this.height || 1);
  }
  resize() {
    const width = innerWidth,
      height = innerHeight;
    if (
      this.lastViewport.width === width &&
      Math.abs((this.lastViewport.height || 0) - height) < 90
    )
      return;
    this.lastViewport = { width, height };
    this.width = width;
    this.height = height;
    const dpr = Math.min(
      devicePixelRatio || 1,
      this.coarse.matches ? 1.25 : 1.5,
    );
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.points = Array.from({ length: width < 700 ? 38 : 85 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.4 + Math.random() * 1.1,
      phase: Math.random() * 6.3,
    }));
  }
  draw(t) {
    if (!this.ambient()) return;
    this.frame = requestAnimationFrame((n) => this.draw(n));
    if (t - this.last < (this.coarse.matches ? 50 : 33)) return;
    this.last = t;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const light = document.documentElement.dataset.theme === "light";
    for (const p of this.points) {
      const shift = this.coarse.matches ? 0 : (this.pointer.x - 0.5) * p.r * 6;
      ctx.beginPath();
      ctx.arc(
        p.x + shift,
        p.y + Math.sin(t / 16000 + p.phase) * 5,
        p.r,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = light
        ? `rgba(63,92,139,${0.12 + Math.sin(t / 2500 + p.phase) * 0.06})`
        : `rgba(179,208,255,${0.23 + Math.sin(t / 3000 + p.phase) * 0.12})`;
      ctx.fill();
    }
  }
  number(el, value) {
    if (!el) return;
    const next = value == null || value === "" ? NaN : Number(value),
      previous = Number(el.dataset.number);
    el.dataset.number = Number.isFinite(next) ? String(next) : "invalid";
    cancelAnimationFrame(this.frames.get(el));
    if (
      !Number.isFinite(next) ||
      !this.active() ||
      !Number.isFinite(previous)
    ) {
      el.textContent = Number.isFinite(next)
        ? next.toLocaleString("zh-CN")
        : "—";
      return;
    }
    const start = performance.now(),
      duration = 350;
    const tick = (t) => {
      const x = Math.min(1, (t - start) / duration),
        e = 1 - Math.pow(1 - x, 3);
      el.textContent = Math.round(
        previous + (next - previous) * e,
      ).toLocaleString("zh-CN");
      if (x < 1) this.frames.set(el, requestAnimationFrame(tick));
    };
    this.frames.set(el, requestAnimationFrame(tick));
  }
  pop(el) {
    if (!el || !this.active()) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    setTimeout(() => el.classList.remove("pop"), 450);
  }
}
