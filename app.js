/* ==========================================================================
   落点 · 四川 2026 高考志愿
   --------------------------------------------------------------------------
   核心修正：志愿单位是【院校专业组】，不是单个专业。
   四川新高考一个专业组 = 一个可填志愿。物理类本科批B段只有 4,797 个组，
   按专业平铺会变成 34,686 条，无法决策。
   ========================================================================== */
'use strict';

/* ---------------- 0. 载入 ---------------- */
const boot = {
  b: document.getElementById('boot-b'),
  s: document.getElementById('boot-s'),
  e: document.getElementById('boot-e'),
  set(p, t) {
    this.b.style.width = p + '%';
    if (t) this.s.innerHTML = t + '<span class="dots"><i></i><i></i><i></i></span>';
  },
  fail(m) { this.e.innerHTML = m; this.e.classList.add('on'); this.s.textContent = '载入失败'; },
  done() {
    const el = document.getElementById('boot');
    el.classList.add('gone');
    setTimeout(() => { el.style.display = 'none'; }, 620);
  }
};
const load = src => new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = src; s.async = false;
  s.onload = ok; s.onerror = () => no(new Error(src));
  document.head.appendChild(s);
});

/* ---------------- 1. 列索引 ---------------- */
const G_ = { SCHOOL:0, TRACK:1, BATCH:2, ATYPE:3, CODE:4, COMPOUND:5, NMAJ:6, PLAN:7,
  R25:8, S25:9, R24:10, S24:11, R23:12, S23:13, SRC:14, REQ:15, TMIN:16, TMAX:17, NEW:18, CONFLICT:19,
  ADM25:20, ADM24:21 };
const O_ = { GROUP:0, CODE:1, MAJOR:2, NOTE:3, CAT:4, CATC:5, PLAN:6, TFEE:7, TAMT:8,
  S25:9, R25:10, S24:11, R24:12, S23:13, R23:14, NEW:15, FSCOPE:16, FMIN:17, FMAX:18,
  FSUM:19, FURL:20, LEVEL:21,
  /* 以下 6 项是【专业级】数据，不是院校级 —— 原表里同一所学校各专业值不同 */
  SR:22, SRANK:23, DE:24, ML:25, MP:26, DP:27,
  /* 学费证据的发布机构与出处等级（省级考试院 / 学校官方 / 阳光高考） */
  FPUB:28, FKIND:29 };

const TRACK_CN = ['物理', '历史'];
const TRACK_EN = ['PHYSICS', 'HISTORY'];
const PAGE = 30;
const SPAGE = 30;

/* ==========================================================================
   列表分页策略 —— 选组 / 院校 / 专业三处共用
     ≤ AUTO_ALL  → 一次性全量渲染（50 多条的筛选结果要能一眼看完）
     > AUTO_ALL  → 每页 size 条，按钮明示还剩多少，另给「全部显示」（超过 ALL_CAP 不给）
   --------------------------------------------------------------------------
   这里有两个踩过的坑，都会让用户以为「数据漏了」：
   ① 追加渲染后没有调 motion.reveal。
      .swipe-wrap / .scard 的可见性靠 .in 类（CSS 里是 opacity:0），
      于是「再看 N 个」插进去的第二页永远停在透明状态 —— 页面下方一大片空白，
      底部却老老实实写着「已到末尾 · 共 52 所」。
      用户报的是「985 里没有天津大学」，实际天津大学排第 41 位，被埋在了
      那片看不见的第二页里。
   ② 一律每页 30 条。985 有 52 所→2 页、211 有 132 所→5 页、保研资格 436 所→15 页。
      白板上没人会点这么多次。所以小结果集直接给全量。
   ========================================================================== */
const AUTO_ALL = 60;    // 不超过这个数就一次性渲染
const ALL_CAP = 600;    // 「全部显示」的上限，再多会拖垮页面
function pagePlan(total, page, size, forceAll) {
  const all = !!forceAll || total <= AUTO_ALL;
  const shown = all ? total : Math.min(page * size, total);
  return {
    all,
    shown,
    from: all ? 0 : Math.max(0, shown - size),
    rest: Math.max(0, total - shown),
    canAll: !all && total <= ALL_CAP,
  };
}
/* 追加渲染后必须揭示。老卡片已经有 .in，重复加没有副作用
   （motion.reveal 内部就是这样设计的），但漏掉就一定出空白。 */
function paintList(box, html, replace) {
  if (replace) box.innerHTML = html; else box.insertAdjacentHTML('beforeend', html);
  motion.reveal(box);
}
function moreBtn(attr, allAttr, rest, size, total) {
  if (rest > 0) {
    return `<button class="btn ghost" data-${attr}>再看 ${Math.min(rest, size)} 个（还有 ${nf(rest)} 个）</button>`
      + (allAttr ? ` <button class="btn ghost sm" data-${allAttr}>全部显示（共 ${nf(total)} 个）</button>` : '');
  }
  return total > size
    ? `<span style="font-size:12px;color:var(--faint)">已到末尾 · 共 ${nf(total)} 个</span>` : '';
}
const INF = 999999;

/* 冲稳保带状区间：R = 组线位次 / 你的位次 */
const BAND = { far: 1.67, bao: 1.18, wen: 0.95, chong: 0.77 };
const TIER = {
  chong: { n: '冲', c: 'var(--chong)', d: '组线比你高约 5%–30%' },
  wen:   { n: '稳', c: 'var(--wen)',   d: '组线与你的位次相当' },
  bao:   { n: '保', c: 'var(--bao)',   d: '组线比你低约 18%–67%' },
  risk:  { n: '险', c: 'var(--risk)',  d: '组线高出你 30% 以上' },
  far:   { n: '远', c: 'var(--risk)',  d: '组线远低于你' },
  none:  { n: '待', c: 'var(--faint)', d: '无往年组线' }
};
function tierOf(you, line) {
  if (!you || !line || line <= 0) return 'none';
  const R = line / you;
  if (R >= BAND.far) return 'far';
  if (R >= BAND.bao) return 'bao';
  if (R >= BAND.wen) return 'wen';
  if (R >= BAND.chong) return 'chong';
  return 'risk';
}
const TIER_ORDER = ['chong', 'wen', 'bao'];
/* 每一档给一句「所以该怎么办」—— 学生看的是结论，不是分类 */
const TIER_ACT = {
  chong: '可以填，但后面必须跟足「稳」和「保」，别整张表都是冲。',
  wen: '主力志愿，建议多放几个，这是最可能被录取的一档。',
  bao: '录取把握大，用来兜底，放在志愿表靠后的位置。',
  risk: '差距偏大，除非特别想上，否则不建议占用一个志愿位。',
  far: '对你来说过于保守，填它等于浪费一个志愿位。',
  none: '暂无往年线，需进一步核实同校其他组、专业与招生计划。'
};

/* ---------- 选科匹配 ----------
   首选科目 = 科类（物理/历史），已由 panel 决定。
   再选科目 = 从 化学 / 生物 / 政治 / 地理 中选 2 门。
   组的选科要求形如「不限」「化学」「化学和生物」，解析成必需科目集合。 */
const RESELECT = ['化学', '生物', '政治', '地理'];
function reqSet(raw) {
  if (!raw || raw === '不限') return null;          // null = 不限
  return String(raw).split('和').map(s => s.trim()).filter(Boolean);
}
function subjectOK(raw, mine) {
  const need = reqSet(raw);
  if (!need) return true;                            // 不限
  if (!mine || !mine.length) return true;            // 未填选科 → 不做判断
  for (const s of need) if (mine.indexOf(s) < 0) return false;
  return true;
}

/* ---------- 扩招 / 缩招 ----------
   2026 计划 vs 2025 实际录取人数。
   基数太小时百分比会误导（2025 只录 2 人、2026 计划 21 人 = “扩招 950%”，
   但那个组本来就是新设的小规模组），所以要求录取基数 ≥ 10 才给百分比。
   ±8% 以内不提示，避免噪音。 */
function enrollChange(g) {
  const plan = g[G_.PLAN], adm = g[G_.ADM25];
  if (!(plan > 0) || !(adm > 0)) return null;
  if (adm < 10) {
    /* 基数太小：只在明显放量时给一个不带百分比的提示 */
    if (plan >= 30 && plan >= adm * 4) return { small: true, plan, adm };
    return null;
  }
  const d = (plan - adm) / adm;
  if (Math.abs(d) < 0.08) return null;
  return { d, plan, adm };
}
function enrollLabel(ec, short) {
  if (!ec) return '';
  if (ec.small) return `<i class="ec up">${short ? '放量' : '今年大幅放量'}</i>`;
  return `<i class="ec ${ec.d > 0 ? 'up' : 'down'}">${ec.d > 0 ? '扩招' : '缩招'}${short ? '' : ' '}${Math.abs(ec.d * 100).toFixed(0)}%</i>`;
}

/* ---------------- 2. 工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));
const nf = v => (v === null || v === undefined || v < 0) ? '—' : Number(v).toLocaleString('zh-CN');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rAF = fn => requestAnimationFrame(fn);

/* 字典取值：索引越界或空索引一律返回 null，调用处不必再判空 */
const dictAt = (key, i) => {
  if (i === null || i === undefined || i < 0) return null;
  const d = (D && D.meta && D.meta.dicts) ? D.meta.dicts[key] : null;
  return (d && d[i] !== undefined && d[i] !== '') ? d[i] : null;
};

let toastT;
function toast(msg) {
  const t = $('#toast');
  $('#toast-t').textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2000);
}
function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

/* ==========================================================================
   3. 动效系统
   ========================================================================== */
const motion = {
  ready: false,   /* 首屏不做数字动画：无头/低帧率环境下 rAF 停摆会留下中间值 */
  /* 数字滚动：用缓出曲线，位数多时更顺 */
  count(el, to, dur = 620) {
    const from = +(el.dataset.v || 0);
    el.dataset.v = to;
    if (from === to) { el.textContent = nf(to); return; }
    /* ready 之前（首屏）和 reduced/noanim 下都直接落值：
       rAF 在这些场景可能不推进，数字会停在初始的「—」 */
    if (!this.ready || REDUCED) { el.textContent = nf(to); return; }
    const t0 = performance.now();
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = nf(Math.round(from + (to - from) * e));
      if (p < 1) rAF(tick);
    };
    rAF(tick);
  },
  /* 列表揭示：全部立即进入，仅首屏做阶梯延迟。
     不用 IntersectionObserver —— 长列表里观察器分发时机不可控，
     一旦不回调就会留下整屏不可见的卡片（比没有动画严重得多）。 */
  reveal(container, sel) {
    /* 不做类名白名单过滤 —— 之前用正则筛类名，新增 .mjrow 时只改了 CSS
       忘了同步正则，结果 30 行全部停在 opacity:0，整页空白。
       调用方传什么选择器就揭示什么，多给无关键加 .in 也没有副作用。 */
    const targets = $$(sel || ':scope > *', container);
    if (!targets.length) return;
    const vh = window.innerHeight || 800;
    let batch = 0;
    requestAnimationFrame(() => {
      targets.forEach(el => {
        const inView = el.getBoundingClientRect().top < vh * 1.05;
        el.style.transitionDelay = (inView ? Math.min(batch++, 7) * 45 : 0) + 'ms';
        el.classList.add('in');
      });
    });
    /* 双保险：rAF 若被节流，200ms 后强制显示 */
    setTimeout(() => targets.forEach(el => el.classList.add('in')), 200);
  },
  /* 结果计数跳动 */
  bump(el) {
    const w = el.closest('.resbar'); if (!w) return;
    w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
    setTimeout(() => w.classList.remove('bump'), 340);
  },
  /* 平滑滚动 */
  scrollTo(y, dur = 520) {
    const from = window.scrollY, d = y - from, t0 = performance.now();
    if (Math.abs(d) < 2) return;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, from + d * e);
      if (p < 1) rAF(step);
    };
    rAF(step);
  },
  /* 骨架 */
  skeleton(container, n) {
    container.innerHTML = Array.from({ length: n }, () => '<div class="skel"></div>').join('');
  }
};

/* ==========================================================================
   3b. 特效引擎（canvas 粒子 / 彩带）
   触摸屏白板上要看得见，所以做成有实体感的粒子，而不是纯 CSS 淡入。
   ========================================================================== */
const FX = {
  cv: null, ctx: null, ps: [], raf: 0, dpr: 1,
  init() {
    this.cv = document.getElementById('fx');
    if (!this.cv) return;
    this.ctx = this.cv.getContext('2d');
    this.resize();
    window.addEventListener('resize', debounce(() => this.resize(), 200));
  },
  resize() {
    if (!this.cv) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = innerWidth * this.dpr;
    this.cv.height = innerHeight * this.dpr;
    this.cv.style.width = innerWidth + 'px';
    this.cv.style.height = innerHeight + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },
  add(p) { this.ps.push(p); this.run(); },
  /* 触点爆开 */
  burst(x, y, colors, n) {
    n = n || 18;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * .5;
      const sp = 150 + Math.random() * 320;
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        r: 2 + Math.random() * 3.4, life: 1, dec: .016 + Math.random() * .012,
        c: colors[(Math.random() * colors.length) | 0], g: 620, shape: 'dot' });
    }
    for (let i = 0; i < 6; i++) {
      this.add({ x, y, vx: (Math.random() - .5) * 220, vy: (Math.random() - .5) * 220,
        r: 16 + Math.random() * 20, life: 1, dec: .045, c: colors[0], g: 0, shape: 'ring' });
    }
  },
  /* 彩带：里程碑用 */
  confetti(n) {
    n = n || 90;
    const cols = ['#cf5f4e', '#3d7dc0', '#2e8b6b', '#d97d3d', '#16233c', '#3aa37e'];
    for (let i = 0; i < n; i++) {
      this.add({ x: Math.random() * innerWidth, y: -20 - Math.random() * 220,
        vx: (Math.random() - .5) * 130, vy: 90 + Math.random() * 200,
        r: 4 + Math.random() * 5, life: 1, dec: .0034 + Math.random() * .0022,
        c: cols[(Math.random() * cols.length) | 0], g: 90, shape: 'rect',
        rot: Math.random() * 6.3, vr: (Math.random() - .5) * .34 });
    }
  },
  run() {
    if (this.raf) return;
    const step = () => {
      const c = this.ctx, W = innerWidth, H = innerHeight;
      c.clearRect(0, 0, W, H);
      const ps = this.ps;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vy += p.g * .016;
        p.vx *= .992;
        p.x += p.vx * .016; p.y += p.vy * .016;
        p.life -= p.dec;
        if (p.life <= 0 || p.y > H + 60) { ps.splice(i, 1); continue; }
        c.globalAlpha = Math.max(0, Math.min(1, p.life));
        if (p.shape === 'ring') {
          c.strokeStyle = p.c; c.lineWidth = 2;
          c.beginPath(); c.arc(p.x, p.y, p.r * (1.6 - p.life), 0, 6.284); c.stroke();
        } else if (p.shape === 'rect') {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot || 0);
          c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); c.restore();
          p.rot += p.vr;
        } else {
          c.fillStyle = p.c;
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.284); c.fill();
        }
      }
      c.globalAlpha = 1;
      if (ps.length) this.raf = requestAnimationFrame(step);
      else { this.raf = 0; c.clearRect(0, 0, W, H); }
    };
    this.raf = requestAnimationFrame(step);
  }
};

/* ==========================================================================
   3c. 触摸层：涟漪、光晕、设备识别
   ========================================================================== */
const Touch = {
  isTouch: false, glowEl: null, glowOn: false,
  init() {
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
      || matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (this.isTouch) document.body.classList.add('touch');
    this.glowEl = document.getElementById('glow');
    /* 光晕只在鼠标设备上跟随；触摸屏上跟随手指会留拖影 */
    if (!this.isTouch && this.glowEl) {
      window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        this.glowEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        if (!this.glowOn) { this.glowEl.classList.add('on'); this.glowOn = true; }
      }, { passive: true });
      document.addEventListener('mouseleave', () => { this.glowEl.classList.remove('on'); this.glowOn = false; });
    }
  },
  ripple(x, y, tone) {
    const d = document.createElement('div');
    d.className = 'ripple' + (tone ? ' ' + tone : '');
    const size = Math.max(innerWidth, innerHeight) * .34;
    d.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 660);
  },
  hint(text, ms) {
    const el = document.getElementById('touch-hint');
    if (!el) return;
    el.innerHTML = text;
    el.classList.add('on');
    clearTimeout(el._t);
    if (ms !== 0) el._t = setTimeout(() => el.classList.remove('on'), ms || 4200);
  },
  hideHint() {
    const el = document.getElementById('touch-hint');
    if (el) { el.classList.remove('on'); clearTimeout(el._t); }
  }
};

/* ==========================================================================
   3d. 演示模式（白板 / 投屏）
   ========================================================================== */
const Stage = {
  on: false,
  toggle(force) {
    this.on = force === undefined ? !this.on : force;
    document.body.classList.toggle('stage', this.on);
    const b = document.getElementById('stage-toggle');
    if (b) b.setAttribute('aria-pressed', this.on ? 'true' : 'false');
    const l = document.getElementById('stage-label');
    if (l) l.textContent = this.on ? '退出演示' : '演示模式';
    try { localStorage.setItem('luodian.stage', this.on ? '1' : '0'); } catch (e) { }
    if (this.on) {
      goFullscreen();
      Touch.hint('演示模式已开启 · 字号与控件已放大', 3200);
    } else if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (e) { }
    }
  },
  load() {
    /* 支持 ?stage=1 直接以演示模式打开，方便把链接存成白板书签 */
    const q = new URLSearchParams(location.search);
    if (q.get('stage') === '1') { this.toggle(true); return; }
    if (q.get('stage') === '0') { return; }
    try { if (localStorage.getItem('luodian.stage') === '1') this.toggle(true); } catch (e) { }
  }
};
function goFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try {
    const r = fn.call(el);
    /* 无用户手势时浏览器会异步拒绝，必须接住，否则控制台报 unhandled rejection */
    if (r && typeof r.catch === 'function') r.catch(() => { });
  } catch (e) { }
}

/* ==========================================================================
   3e. 数字滚轮：每位独立滚动，比整体计数更有质感
   ========================================================================== */
const ODO_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function odo(el, to) {
  const s = nf(to);
  if ((el.dataset.odo || '') === s) return;
  el.dataset.odo = s;
  if (!motion.ready) { el.textContent = s; return; }
  el.classList.add('odo');
  const cols = s.split('');
  if (el.children.length !== cols.length) {
    el.innerHTML = cols.map(ch => /[0-9]/.test(ch)
      ? `<span class="col"><span class="strip" style="transform:translateY(0em)">${ODO_DIGITS.map(d => `<b>${d}</b>`).join('')}</span></span>`
      : `<span class="col" style="width:.4em">${ch}</span>`).join('');
  }
  Array.prototype.forEach.call(el.querySelectorAll('.strip'), (strip, i) => {
    const ch = cols[i];
    if (!/[0-9]/.test(ch)) return;
    strip.style.transform = `translateY(${-+ch}em)`;
  });
}

/* ==========================================================================
   4. 数据与索引
   ========================================================================== */
let D = null;
const DIST = {};

function buildIndex() {
  const gs = D.groups, ss = D.schools;

  /* 组内专业索引：offering → group 已是 O_.GROUP，反向聚合 */
  D.offByGroup = Array.from({ length: gs.length }, () => []);
  for (let i = 0; i < D.offerings.length; i++) D.offByGroup[D.offerings[i][O_.GROUP]].push(i);
  D.offByGroup.forEach(a => a.sort((x, y) => {
    const rx = D.offerings[x][O_.R25], ry = D.offerings[y][O_.R25];
    return (rx > 0 ? rx : Infinity) - (ry > 0 ? ry : Infinity);
  }));

  /* 组级派生：搜索串、标签、地域 */
  D.gSchool = new Array(gs.length);
  D.gSearch = new Array(gs.length);
  D.gTag = new Array(gs.length);
  D.gCat = new Array(gs.length);
  D.gCatc = new Array(gs.length);
  D.schoolGroups = new Map();

  const majorDict = D.meta.dicts.major;
  const catcDict = D.meta.dicts.catc;
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i], s = ss[g[G_.SCHOOL]];
    D.gSchool[i] = s;
    const offs = D.offByGroup[i];
    const cats = new Set(), catcs = new Set();
    let majors = '';
    for (let k = 0; k < offs.length && k < 40; k++) {
      const o = D.offerings[offs[k]];
      cats.add(o[O_.CAT]); catcs.add(o[O_.CATC]);
      majors += (majorDict[o[O_.MAJOR]] || '') + ' ';
    }
    D.gCat[i] = cats; D.gCatc[i] = catcs;
    D.gTag[i] = s.tag || [];
    D.gSearch[i] = (s.n + ' ' + s.city + ' ' + s.prov + ' ' + s.aff + ' ' + s.typ + ' ' +
      g[G_.CODE] + ' ' + (g[G_.COMPOUND] || '') + ' ' + majors).toLowerCase();
    let e = D.schoolGroups.get(g[G_.SCHOOL]);
    if (!e) { e = []; D.schoolGroups.set(g[G_.SCHOOL], e); }
    e.push(i);
  }

  /* 院校 → 每科类的调档线分数区间（院校卡片上用，比组数直观得多）。
     用 2025 组线分数；没有分数的组不参与，全无则标记为无往年数据。 */
  D.schoolLine = new Map();
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i], s = g[G_.S25], t = g[G_.TRACK];
    if (!(s > 0)) continue;
    const si = g[G_.SCHOOL];
    let e = D.schoolLine.get(si);
    if (!e) { e = [{ lo: 0, hi: 0, n: 0 }, { lo: 0, hi: 0, n: 0 }]; D.schoolLine.set(si, e); }
    const b = e[t];
    if (b.n === 0) { b.lo = s; b.hi = s; } else { if (s < b.lo) b.lo = s; if (s > b.hi) b.hi = s; }
    b.n++;
  }

  /* 专业 → 招生记录索引（「先选专业再看学校」用） */
  D.byMajor = new Map();
  for (let i = 0; i < D.offerings.length; i++) {
    const mi = D.offerings[i][O_.MAJOR];
    if (mi < 0) continue;
    let a = D.byMajor.get(mi);
    if (!a) { a = []; D.byMajor.set(mi, a); }
    a.push(i);
  }
  /* 专业元信息：门类、院校数、条数（由 export 提供） */
  D.majorMeta = new Map();
  (D.meta.majors || []).forEach(m => D.majorMeta.set(m[0], {
    cat: m[1], catc: m[2], n: m[3], schools: m[4], r25: m[5], plan: m[6], idx: m[0]
  }));

  /* 一分一段 */
  for (const k in D.meta.dist) {
    const d = D.meta.dist[k];
    if (!d.rows.length) continue;
    d.max = d.rows[0][0]; d.min = d.rows[d.rows.length - 1][0];
    d.total = d.rows[d.rows.length - 1][2];
    DIST[k] = d;
  }

  /* 各科类 2025 年最末的组线位次 —— 位次对照尺的窗口上界。
     超过这个位次的位次在数据里不存在（没有任何组把线放在那里），
     拿它当量程上界，尺子就不会画出「负位次」这种不存在的刻度。 */
  D.trackMaxR = [0, 0];
  for (let i = 0; i < D.groups.length; i++) {
    const g = D.groups[i], r = g[G_.R25];
    if (r > D.trackMaxR[g[G_.TRACK]]) D.trackMaxR[g[G_.TRACK]] = r;
  }

  /* 组级筛选候选值（按当前科类统计频次） */
  D.facets = {};
  refreshFacets();
}

function refreshFacets() {
  const t = state.track, f = {};
  const bump = (k, v) => { if (v === undefined || v === null || v === '') return; (f[k] = f[k] || new Map()).set(v, (f[k].get(v) || 0) + 1); };
  for (let i = 0; i < D.groups.length; i++) {
    const g = D.groups[i];
    if (g[G_.TRACK] !== t) continue;
    const s = D.gSchool[i];
    bump('reg', s.reg); bump('prov', s.prov); bump('own', s.own); bump('typ', s.typ);
    bump('lvl', s.lvl); bump('batch', g[G_.BATCH]); bump('atype', g[G_.ATYPE]);
    bump('req', g[G_.REQ]);
    D.gTag[i].forEach(x => bump('tag', x));
    D.gCat[i].forEach(x => bump('cat', x));
    D.gCatc[i].forEach(x => bump('catc', x));
  }
  D.facets = f;
  D.facetsProvByRegion = {};
  for (const [p, n] of (f.prov || new Map())) {
    const reg = (D.provRegion[p]) || '其他';
    (D.facetsProvByRegion[reg] = D.facetsProvByRegion[reg] || []).push([p, n]);
  }
  for (const r in D.facetsProvByRegion) D.facetsProvByRegion[r].sort((a, b) => b[1] - a[1]);
  D.facetsCatcByCat = {};
  for (let i = 0; i < D.groups.length; i++) {
    const g = D.groups[i];
    if (g[G_.TRACK] !== t) continue;
    D.gCat[i].forEach(c => {
      const m = (D.facetsCatcByCat[c] = D.facetsCatcByCat[c] || new Map());
      D.gCatc[i].forEach(cc => m.set(cc, (m.get(cc) || 0) + 1));
    });
  }
}

/* ==========================================================================
   5. 状态
   ========================================================================== */
const state = {
  page: 'groups', track: (typeof applyPrefTrack === 'function' && applyPrefTrack() !== null) ? applyPrefTrack() : 0, mode: 'score', score: 600, rank: null, rankHi: null, rankLo: null,
  view: 'all', tierFilter: null, sort: 'close', q: '',
  filters: {}, showAllChips: {},
  sTag: null, sSort: 'groups', sPage: 1, groupPage: 1,
  basket: [],
  /* 再选科目（2 门）；只匹配选科 = 过滤掉不符合的组 */
  mySubjects: [],
  onlyMatchSubject: false
};

function rankFromScore(dist, sc) {
  const rows = dist.rows; let lo = 0, hi = rows.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, s = rows[m][0];
    if (s === sc) return { r: rows[m][2], hi: rows[m][3], lo: rows[m][4] };
    if (s > sc) lo = m + 1; else hi = m - 1;
  }
  return null;
}
function scoreFromRank(dist, rk) {
  const rows = dist.rows; let lo = 0, hi = rows.length - 1, a = null;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m][2] >= rk) { a = rows[m][0]; hi = m - 1; } else lo = m + 1;
  }
  return a;
}
const curDist = () => DIST['2026|' + TRACK_EN[state.track]];

/* ==========================================================================
   6. 筛选
   ========================================================================== */
const SEL_KEYS = ['reg', 'prov', 'tag', 'own', 'typ', 'lvl', 'cat', 'catc', 'req', 'batch', 'atype'];
function has(k, v) { const s = state.filters[k]; return !!(s && s.size && s.has(v)); }
function anyOf(k) { const s = state.filters[k]; return s && s.size ? s : null; }

function groupPass(i) {
  const g = D.groups[i];
  if (g[G_.TRACK] !== state.track) return false;
  const s = D.gSchool[i];

  const reg = anyOf('reg'), prov = anyOf('prov');
  if (reg && !reg.has(s.reg)) return false;
  if (prov && !prov.has(s.prov)) return false;

  const own = anyOf('own'), typ = anyOf('typ'), lvl = anyOf('lvl');
  if (own && !own.has(s.own)) return false;
  if (typ && !typ.has(s.typ)) return false;
  if (lvl && !lvl.has(s.lvl)) return false;

  const tag = anyOf('tag');
  if (tag) { let ok = false; for (const t of tag) if (D.gTag[i].indexOf(t) >= 0) { ok = true; break; } if (!ok) return false; }

  const cat = anyOf('cat'), catc = anyOf('catc');
  if (cat) { let ok = false; for (const c of cat) if (D.gCat[i].has(c)) { ok = true; break; } if (!ok) return false; }
  if (catc) { let ok = false; for (const c of catc) if (D.gCatc[i].has(c)) { ok = true; break; } if (!ok) return false; }

  const req = anyOf('req');
  if (req && !req.has(g[G_.REQ])) return false;
  const batch = anyOf('batch');
  if (batch && !batch.has(g[G_.BATCH])) return false;
  const atype = anyOf('atype');
  if (atype && !atype.has(g[G_.ATYPE])) return false;

  const fee = state.fee;
  if (fee && (fee[0] > 0 || fee[1] < INF)) {
    const t = g[G_.TMIN];
    if (t < 0) { if (fee[0] > 0 || fee[1] < INF) return false; }
    else if (t < fee[0] || t > fee[1]) return false;
  }
  const plan = state.plan;
  if (plan && (plan[0] > 0 || plan[1] < INF)) {
    const p = g[G_.PLAN];
    if (p < plan[0] || p > plan[1]) return false;
  }

  if (state.onlyLine && g[G_.R25] <= 0) return false;
  if (state.onlyNewGroup && g[G_.SRC] !== 2) return false;
  if (state.onlyNewMajor && g[G_.NEW] <= 0) return false;
  /* 选科匹配：只在学生填了 2 门再选科目、且开启了「只看匹配」时过滤 */
  if (state.onlyMatchSubject && state.mySubjects.length === 2
      && !subjectOK(g[G_.REQ], state.mySubjects)) return false;

  const q = state.qT;
  if (q) { for (const w of q) if (D.gSearch[i].indexOf(w) < 0) return false; }

  if (state.tierFilter && state.rank) {
    if (tierOf(state.rank, g[G_.R25]) !== state.tierFilter) return false;
  }
  return true;
}

function runQuery() {
  state.qT = state.q ? state.q.trim().toLowerCase().split(/\s+/).filter(Boolean) : null;
  const out = [];
  for (let i = 0; i < D.groups.length; i++) if (groupPass(i)) out.push(i);
  const ord = state.rank && (state.view === 'tier' || state.sort === 'close');
  const you = state.rank || 0;
  switch (state.sort) {
    case 'close':
      /* 位次是分数段末端值，同一分数的组会大量并列（例如 2025 物理 602 分 = 22,235 位次，25 个组）。
         所以次级键用院校排名，让同线时更好的学校排在前面，而不是随机顺序。 */
      const tie = (a, b) => (D.gSchool[a].rk || 99999) - (D.gSchool[b].rk || 99999)
        || D.gSchool[a].n.localeCompare(D.gSchool[b].n, 'zh');
      if (you) out.sort((a, b) => {
        const ra = D.groups[a][G_.R25], rb = D.groups[b][G_.R25];
        const ka = ra > 0 ? Math.abs(Math.log(you / ra)) : 9;
        const kb = rb > 0 ? Math.abs(Math.log(you / rb)) : 9;
        return (ka - kb) || tie(a, b);
      });
      else out.sort((a, b) => big(D.groups[a][G_.R25]) - big(D.groups[b][G_.R25]) || tie(a, b));
      break;
    case 'rankAsc': out.sort((a, b) => big(D.groups[a][G_.R25]) - big(D.groups[b][G_.R25])); break;
    case 'rankDesc': out.sort((a, b) => (D.groups[b][G_.R25] || -1) - (D.groups[a][G_.R25] || -1)); break;
    case 'plan': out.sort((a, b) => D.groups[b][G_.PLAN] - D.groups[a][G_.PLAN]); break;
    case 'majors': out.sort((a, b) => D.groups[b][G_.NMAJ] - D.groups[a][G_.NMAJ]); break;
    case 'fee': out.sort((a, b) => {
      const x = D.groups[a][G_.TMIN], y = D.groups[b][G_.TMIN];
      return (x < 0 ? Number.MAX_SAFE_INTEGER : x) - (y < 0 ? Number.MAX_SAFE_INTEGER : y);
    }); break;
    case 'srank': out.sort((a, b) => (D.gSchool[a].rk || 99999) - (D.gSchool[b].rk || 99999)); break;
  }
  return out;
}
const big = v => (v > 0 ? v : Number.MAX_SAFE_INTEGER);

/* ==========================================================================
   7. 渲染：筛选面板（分层，不一股脑铺开）
   ========================================================================== */
const CHIP_LIMIT = 12;
const TAG_ORDER = ['985', '211', '双一流', '国重点', '保研资格', '省重点', '双高计划', '部委直属', '省部共建', '卓越工程师', '基础学科拔尖', '强基计划'];

function sortFacet(map, order) {
  if (!map) return [];
  let arr = Array.from(map.entries());
  if (order) {
    const idx = new Map(order.map((v, i) => [v, i]));
    arr = arr.filter(x => idx.has(x[0])).sort((a, b) => idx.get(a[0]) - idx.get(b[0]));
  } else arr.sort((a, b) => b[1] - a[1]);
  return arr;
}

function chipHTML(key, val, label, n, cls) {
  const on = has(key, val);
  return `<button class="chip ${cls || ''}" data-f="${key}" data-v="${esc(val)}" aria-pressed="${on}">` +
    `<span>${esc(label)}</span><span class="n">${n > 999 ? (n / 1000).toFixed(1) + 'k' : n}</span></button>`;
}

function renderFilters() {
  const F = D.facets, box = $('#fpanel-grid');
  let h = '';

  /* 地域：大区 → 省份 两级联动 */
  const regs = sortFacet(F.reg, D.meta.regions);
  const provRows = [];
  for (const r of D.meta.regions) {
    if (!has('reg', r)) continue;
    const ps = (D.facetsProvByRegion[r] || []).slice(0, 40);
    if (!ps.length) continue;
    provRows.push(`<div class="subrow"><div class="lbl">${esc(r)} · ${ps.length} 个省级地区</div>
      <div class="chips">${ps.map(([p, n]) => chipHTML('prov', p, p, n, 'mini')).join('')}</div></div>`);
  }
  h += `<div class="fgrp ${anyOf('reg') || anyOf('prov') ? 'has' : ''}">
    <div class="fgrp-head"><h4>地域</h4><button class="clr" data-clear="reg,prov">清除</button></div>
    <div class="chips">${regs.map(([r, n]) => chipHTML('reg', r, r, n)).join('')}</div>
    ${provRows.join('')}</div>`;

  /* 院校层次 */
  const tags = sortFacet(F.tag, TAG_ORDER);
  const shown = state.showAllChips.tag ? tags : tags.slice(0, 8);
  h += `<div class="fgrp ${anyOf('tag') ? 'has' : ''}">
    <div class="fgrp-head"><h4>院校层次</h4>
      <button class="q" data-tags-help title="这些标签分别是什么意思">?</button>
      <button class="clr" data-clear="tag">清除</button></div>
    <div class="chips">${shown.map(([t, n]) => chipHTML('tag', t, t, n)).join('')}</div>
    ${tags.length > 8 ? `<button class="more" data-more="tag">${state.showAllChips.tag ? '收起' : '还有 ' + (tags.length - 8) + ' 项'}</button>` : ''}</div>`;

  /* 办学 */
  h += `<div class="fgrp ${anyOf('own') || anyOf('typ') || anyOf('lvl') ? 'has' : ''}">
    <div class="fgrp-head"><h4>办学性质与类型</h4><button class="clr" data-clear="own,typ,lvl">清除</button></div>
    <div class="chips">
      ${sortFacet(F.own).map(([v, n]) => chipHTML('own', v, v, n, 'mini')).join('')}
      ${sortFacet(F.lvl).map(([v, n]) => chipHTML('lvl', v, v, n, 'mini')).join('')}
      ${sortFacet(F.typ).slice(0, state.showAllChips.typ ? 99 : 6).map(([v, n]) => chipHTML('typ', v, v, n, 'mini')).join('')}
    </div>
    ${(F.typ && F.typ.size > 6) ? `<button class="more" data-more="typ">${state.showAllChips.typ ? '收起' : '更多类型'}</button>` : ''}</div>`;

  /* 专业：门类 → 专业类 联动 */
  const cats = sortFacet(F.cat);
  const catcMap = new Map();
  const selCats = anyOf('cat');
  if (selCats) { for (const c of selCats) { const m = D.facetsCatcByCat[c]; if (m) for (const [k, v] of m) catcMap.set(k, (catcMap.get(k) || 0) + v); } }
  else if (F.catc) for (const [k, v] of F.catc) catcMap.set(k, v);
  const catcs = Array.from(catcMap.entries()).sort((a, b) => b[1] - a[1]);
  const catcShown = state.showAllChips.catc ? catcs : catcs.slice(0, 10);
  h += `<div class="fgrp ${anyOf('cat') || anyOf('catc') || anyOf('req') ? 'has' : ''}">
    <div class="fgrp-head"><h4>专业方向</h4><button class="clr" data-clear="cat,catc,req">清除</button></div>
    <div class="chips">${cats.map(([c, n]) => chipHTML('cat', c, c, n, 'mini')).join('')}</div>
    ${catcShown.length ? `<div class="subrow"><div class="lbl">专业类${selCats ? ' · 已按门类过滤' : ''}</div>
      <div class="chips">${catcShown.map(([c, n]) => chipHTML('catc', c, c, n, 'mini')).join('')}</div>
      ${catcs.length > 10 ? `<button class="more" data-more="catc">${state.showAllChips.catc ? '收起' : '还有 ' + (catcs.length - 10) + ' 个专业类'}</button>` : ''}</div>` : ''}
    <div class="subrow"><div class="lbl">选科要求</div>
      <div class="chips">${sortFacet(F.req).map(([v, n]) => chipHTML('req', v, v || '不限', n, 'mini')).join('')}</div></div></div>`;

  /* 招生 */
  h += `<div class="fgrp ${anyOf('batch') || anyOf('atype') ? 'has' : ''}">
    <div class="fgrp-head"><h4>批次与计划</h4><button class="clr" data-clear="batch,atype">清除</button></div>
    <div class="chips">${sortFacet(F.batch).slice(0, state.showAllChips.batch ? 99 : 7).map(([v, n]) => chipHTML('batch', v, v, n, 'mini')).join('')}</div>
    ${(F.batch && F.batch.size > 7) ? `<button class="more" data-more="batch">${state.showAllChips.batch ? '收起' : '全部批次'}</button>` : ''}
    <div class="subrow"><div class="lbl">计划类别</div>
      <div class="chips">${sortFacet(F.atype).slice(0, state.showAllChips.atype ? 99 : 8).map(([v, n]) => chipHTML('atype', v, v, n, 'mini')).join('')}</div>
      ${(F.atype && F.atype.size > 8) ? `<button class="more" data-more="atype">${state.showAllChips.atype ? '收起' : '还有 ' + (F.atype.size - 8) + ' 项'}</button>` : ''}</div></div>`;

  /* 费用与开关 */
  h += `<div class="fgrp ${state.fee || state.plan || state.onlyLine || state.onlyNewGroup || state.onlyNewMajor ? 'has' : ''}">
    <div class="fgrp-head"><h4>费用 · 规模 · 数据</h4><button class="clr" data-clear-adv>清除</button></div>
    <div class="chips">
      <button class="chip mini" data-preset-fee="0,6000" aria-pressed="${eqArr(state.fee, [0, 6000])}"><span>学费 6 千以下</span></button>
      <button class="chip mini" data-preset-fee="0,10000" aria-pressed="${eqArr(state.fee, [0, 10000])}"><span>学费 1 万以下</span></button>
      <button class="chip mini" data-preset-plan="100,999999" aria-pressed="${eqArr(state.plan, [100, INF])}"><span>组计划 ≥100 人</span></button>
    </div>
    <div class="subrow"><div class="lbl">数据完整度</div><div class="chips">
      <button class="chip mini accent" data-sw="onlyLine" aria-pressed="${!!state.onlyLine}"><span>只看有往年组线</span></button>
      <button class="chip mini accent" data-sw="onlyNewGroup" aria-pressed="${!!state.onlyNewGroup}"><span>只看暂无往年线</span></button>
      <button class="chip mini accent" data-sw="onlyNewMajor" aria-pressed="${!!state.onlyNewMajor}"><span>组内含新增专业</span></button>
      <button class="chip mini accent" data-sw="onlyMatchSubject" aria-pressed="${!!state.onlyMatchSubject}"
        ${state.mySubjects.length < 2 ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>
        <span>只看符合我选科${state.mySubjects.length === 2 ? '（' + esc(state.mySubjects.join('+')) + '）' : '（先在定位页选 2 门）'}</span></button>
    </div></div></div>`;

  box.innerHTML = h;
}
const eqArr = (a, b) => !!a && a[0] === b[0] && (a[1] >= INF ? b[1] >= INF : a[1] === b[1]);

/* ==========================================================================
   8. 渲染：已选条件
   ========================================================================== */
function renderSelbar() {
  const items = [];
  const LBL = { reg: '地域', prov: '省份', tag: '层次', own: '性质', typ: '类型', lvl: '层次', cat: '门类', catc: '专业类', req: '选科', batch: '批次', atype: '计划' };
  for (const k of SEL_KEYS) {
    const s = state.filters[k]; if (!s || !s.size) continue;
    s.forEach(v => items.push(`<span class="seltag">${LBL[k]}·${esc(v)}<button class="x" data-un="${k}|${esc(v)}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6"/></svg></button></span>`));
  }
  if (state.fee) items.push(selTag('学费 ' + (state.fee[1] >= INF ? '不限' : state.fee[0] + '–' + state.fee[1]), 'fee|'));
  if (state.plan) items.push(selTag('计划 ≥' + state.plan[0], 'plan|'));
  if (state.onlyLine) items.push(selTag('有往年组线', 'onlyLine|'));
  if (state.onlyNewGroup) items.push(selTag('暂无往年线', 'onlyNewGroup|'));
  if (state.onlyNewMajor) items.push(selTag('含新增专业', 'onlyNewMajor|'));
  if (state.onlyMatchSubject && state.mySubjects.length === 2)
    items.push(selTag('符合我的选科', 'onlyMatchSubject|'));
  $('#selbar').innerHTML = items.join('') + (items.length > 1 ? '<button class="selclear" data-un="all|">全部清除</button>' : '');
  const b = $('#f-n');
  b.textContent = items.length; b.style.display = items.length ? '' : 'none';
}
const XS = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6"/></svg>';
const selTag = (label, key) => `<span class="seltag">${esc(label)}<button class="x" data-un="${key}" aria-label="移除">${XS}</button></span>`;

/* ==========================================================================
   9. 渲染：组卡片
   ========================================================================== */
function groupCard(i, k) {
  const g = D.groups[i], s = D.gSchool[i];
  const line = g[G_.R25];
  const tier = state.rank && line > 0 ? tierOf(state.rank, line) : null;
  const t = tier ? TIER[tier] : null;
  const offs = D.offByGroup[i];
  const shown = offs.slice(0, 5);
  const inBasket = state.basket.indexOf(i) >= 0;

  /* 选科是否符合（只在学生填了 2 门再选科目时判断） */
  const mine = state.mySubjects.length === 2 ? state.mySubjects : null;
  const matchSubj = mine ? subjectOK(g[G_.REQ], mine) : null;

  const tags = [];
  const hot = ['985', '211', '双一流'];
  for (const x of hot) if (D.gTag[i].indexOf(x) >= 0) tags.push('<span class="tag hot">' + x + '</span>');
  if (D.gTag[i].indexOf('国重点') >= 0) tags.push('<span class="tag">国重点</span>');
  if (g[G_.CONFLICT]) tags.push('<span class="tag bad">来源冲突</span>');
  if (matchSubj === false) tags.push('<span class="tag bad">选科不符</span>');

  const majors = shown.map(oi => {
    const o = D.offerings[oi];
    return `<span class="mj ${o[O_.NEW] ? 'new' : ''}">${esc(D.meta.dicts.major[o[O_.MAJOR]] || '')}</span>`;
  }).join('') + (offs.length > 5 ? `<span class="mj">+${offs.length - 5}</span>` : '');

  const feeTxt = g[G_.TMIN] > 0
    ? (g[G_.TMIN] === g[G_.TMAX] ? nf(g[G_.TMIN]) : nf(g[G_.TMIN]) + '–' + nf(g[G_.TMAX]))
    : '—';

  const ec = enrollChange(g);

  return `<div class="swipe-wrap" data-wrap="${i}">
    <div class="swipe-bg">
      <span class="l"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>松手加入志愿表</span>
      <span class="r">跳过<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>
    </div>
    <article class="gcard${matchSubj === false ? ' mismatch' : ''}" data-g="${i}" style="--tc:${t ? t.c : 'transparent'}">
    <div class="sheen"></div>
    <div class="row1">
      <div class="who">
        <div class="sname">${esc(s.n)}${t ? `<span class="tag" style="background:${t.c};color:#fff">${t.n}</span>` : ''}${tags.join('')}
          <span class="gcode">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span></div>
        <div class="cmeta">
          <span class="m">${esc(s.prov)}${s.city && s.city !== s.prov ? ' · ' + esc(s.city) : ''}</span>
          <span class="m">${esc(g[G_.BATCH])}</span>
          ${g[G_.ATYPE] !== '普通类' ? `<span class="m">${esc(g[G_.ATYPE])}</span>` : ''}
          <span class="m">组内 <b>${g[G_.NMAJ]}</b> 个专业</span>
          <span class="m" title="2026 招生计划${g[G_.ADM25] > 0 ? '；2025 实际录取 ' + g[G_.ADM25] + ' 人' : ''}">计划 <b>${g[G_.PLAN] || '—'}</b>${enrollLabel(ec, true)}</span>
          <span class="m">学费 <b>${feeTxt}</b></span>
          <span class="m">选科 <b class="${matchSubj === false ? 'bad' : ''}">${esc(g[G_.REQ] || '不限')}</b></span>
        </div>
      </div>
      ${scoreCell(g[G_.S25], line)}
    </div>
    <div class="majors">${majors}</div>
    <button class="add ${inBasket ? 'on' : ''}" data-add="${i}" aria-label="${inBasket ? '移出志愿表' : '加入志愿表'}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        ${inBasket ? '<path d="m5 12.5 4.5 4.5L19 7"/>' : '<path d="M12 5v14M5 12h14"/>'}
      </svg></button>
  </article></div>`;
}

/* 学费：招生考试报里的值是文本（可能是「待定」「免费」这种），
   纯数字才加千分位 —— 选组卡片上的学费是数值型走了 nf()，
   两处显示必须一致，否则同一所学校在两个页面上是 75,000 和 75000。 */
function feeText(raw) {
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!v) return '—';
  return /^\d+$/.test(v) ? nf(+v) : esc(v);
}

/* 分数为主、位次为辅：学生对分数更有感觉，位次作为精确参考放在下面。
   选组卡片和专业页卡片共用这一个读数块（.cardnum），不要再各写一份。 */
function scoreCell(score, rank, emptyLabel) {
  if (score > 0 && rank > 0) {
    return `<div class="cardnum"><div class="v"><span class="n">${score}</span><span class="u">分</span></div>
      <div class="sub">位次 ${nf(rank)} · 2025</div></div>`;
  }
  if (rank > 0) {
    return `<div class="cardnum"><div class="v"><span class="n">${nf(rank)}</span><span class="u">位次</span></div>
      <div class="sub">2025 年</div></div>`;
  }
  return `<div class="cardnum none"><div class="v"><span class="n">${emptyLabel || '暂无往年线'}</span></div>
    <div class="sub">无往年参考</div></div>`;
}
function yearCell(score, rank) {
  if (rank > 0) {
    return `<div class="r">${score > 0 ? `<span class="n">${score}</span><span class="u">分</span>` : ''}</div>
      <div class="s">位次 ${nf(rank)}</div>`;
  }
  return `<div class="r" style="font-size:13px;color:var(--faint);font-weight:400">无数据</div>
    <div class="s">往年未招生</div>`;
}

let lastList = [];
function renderGroups(reset) {
  const gl = $('#glist');
  if (reset) { state.groupPage = 1; state.gShowAll = false; }
  const total = lastList.length;
  if (!total) {
    gl.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.6 15.6 4.4 4.4"/></svg>
      <h3>没有符合条件的组</h3><p>放宽一些筛选，或换一个科类看看。</p></div>`;
    $('#gmore').innerHTML = '';
    return;
  }

  /* 按冲稳保分区视图 */
  if (state.view === 'tier' && state.rank && !state.tierFilter) {
    const buckets = { chong: [], wen: [], bao: [], risk: [], far: [], none: [] };
    lastList.forEach(i => buckets[tierOf(state.rank, D.groups[i][G_.R25])].push(i));
    let html = '', k = 0;
    for (const key of TIER_ORDER.concat(['risk', 'none'])) {
      const b = buckets[key];
      if (!b.length) continue;
      const t = TIER[key];
      html += `<div class="sec-h" style="margin:20px 0 11px">
        <span style="width:8px;height:8px;border-radius:50%;background:${t.c};display:inline-block"></span>
        <h2>${t.n} · ${nf(b.length)} 个组</h2><span class="line"></span><span class="note">${t.d}</span></div>`;
      const take = state.expandTier && state.expandTier[key] ? b : b.slice(0, 12);
      html += take.map(i => groupCard(i, k++)).join('');
      if (b.length > 12 && !(state.expandTier && state.expandTier[key])) {
        html += `<div style="padding:4px 0 2px"><button class="btn ghost sm" data-more-tier="${key}">展开该档全部 ${nf(b.length)} 个组</button></div>`;
      }
    }
    gl.innerHTML = html;
    motion.reveal(gl);
    $('#gmore').innerHTML = `<span style="font-size:12px;color:var(--faint)">已按冲稳保分区 · 共 ${nf(total)} 个组</span>`;
    return;
  }

  /* 平铺视图 */
  const plan = pagePlan(total, state.groupPage, PAGE, state.gShowAll);
  const slice = lastList.slice(plan.from, plan.shown);
  const html = slice.map((i, k) => groupCard(i, k)).join('');
  /* 追加时也必须揭示 —— 原来这里只在 reset 时调 motion.reveal，
     结果「再看 N 个」插进来的卡片全部停在 opacity:0，整片空白。 */
  paintList(gl, html, reset || plan.all);

  $('#gmore').innerHTML = moreBtn('more-groups', plan.canAll ? 'all-groups' : '',
    plan.rest, PAGE, total);
}

/* 展开某一档全部 */
function expandTier(key) {
  state.expandTier = state.expandTier || {};
  state.expandTier[key] = true;
  applyQuery(true);
  toast('已展开「' + TIER[key].n + '」全部');
}

/* ==========================================================================
   10. 查询与刷新
   ========================================================================== */
function applyQuery(reset = true) {
  lastList = runQuery();
  const cnt = $('#res-cnt');
  if (firstPaint) { cnt.dataset.v = lastList.length; cnt.textContent = nf(lastList.length); }
  else { motion.count(cnt, lastList.length); motion.bump(cnt); }
  const withLine = lastList.reduce((a, i) => a + (D.groups[i][G_.R25] > 0 ? 1 : 0), 0);
  $('#res-meta').textContent = `${nf(withLine)} 个有 2025 组线，${nf(lastList.length - withLine)} 个暂无 2025 组线`;
  renderGroups(reset);
  renderSelbar();
  $('#rail-groups').textContent = lastList.length > 9999 ? (lastList.length / 1000).toFixed(1) + 'k' : lastList.length;
}
let firstPaint = true;

function fullRefresh() {
  refreshFacetsShallow();
  renderFilters();
  applyQuery(true);
}

/* 只刷新频次（不重建面板 DOM 时用） */
function refreshFacetsShallow() { refreshFacets(); }

/* ==========================================================================
   11. 定位页
   ========================================================================== */
function syncGauge() {
  const d = curDist(); if (!d) return;
  const track = $('#track');
  const isScore = state.mode === 'score';
  const min = isScore ? d.min : 1, max = isScore ? d.max : d.total;
  const val = isScore ? state.score : (state.rank || 1);
  const p = clamp((val - min) / (max - min), 0, 1);
  $('#g-fill').style.transform = `scaleX(${p})`;
  $('#g-knob').style.left = (p * 100) + '%';
  track.setAttribute('aria-valuemin', min);
  track.setAttribute('aria-valuemax', max);
  track.setAttribute('aria-valuenow', Math.round(val));

  /* 刻度标签 */
  const old = $$('.tick', track); old.forEach(e => e.remove());
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const v = Math.round(min + (max - min) * i / steps);
    const t = document.createElement('div');
    t.className = 'tick' + (i === 0 || i === steps ? ' major' : '');
    t.style.left = (i / steps * 100) + '%';
    t.innerHTML = `<span>${nf(v)}</span>`;
    track.appendChild(t);
  }
  track.classList.add('ready');
}

function recalc() {
  const d = curDist(); if (!d) return;
  if (state.mode === 'score') {
    state.score = clamp(Math.round(state.score), d.min, d.max);
    const r = rankFromScore(d, state.score);
    if (r) { state.rank = r.r; state.rankHi = r.hi; state.rankLo = r.lo; }
    else { state.rank = null; }
    $('#g-val').textContent = state.score;
    $('#g-unit').textContent = '分';
    $('#g-rank').textContent = state.rank ? nf(state.rank) : '—';
    $('#g-ranksub').textContent = (state.rankHi && state.rankLo) ? `同分区间 ${nf(state.rankHi)}–${nf(state.rankLo)}` : '该分数不在分段表内';
    const pct = state.rank ? (1 - state.rank / d.total) * 100 : null;
    $('#g-pct').textContent = pct === null ? '—' : pct.toFixed(1) + '%';
    $('#g-pctsub').textContent = `${TRACK_CN[state.track]}类共 ${nf(d.total)} 人`;
  } else {
    state.rank = clamp(Math.round(state.rank || 1), 1, d.total);
    state.score = scoreFromRank(d, state.rank);
    $('#g-val').textContent = nf(state.rank);
    $('#g-unit').textContent = '名';
    $('#g-rank').textContent = state.score ? state.score : '—';
    $('#g-ranksub').textContent = '等效分数';
    $('#g-pct').textContent = ((1 - state.rank / d.total) * 100).toFixed(1) + '%';
    $('#g-pctsub').textContent = `${TRACK_CN[state.track]}类共 ${nf(d.total)} 人`;
  }
  syncGauge();
  updateTiers();
  updateReadout();
}

function updateTiers() {
  if (!state.rank) return;
  const cnt = { chong: 0, wen: 0, bao: 0, risk: 0, far: 0, none: 0 };
  let tot = 0;
  for (let i = 0; i < D.groups.length; i++) {
    const g = D.groups[i];
    if (g[G_.TRACK] !== state.track) continue;
    tot++;
    cnt[tierOf(state.rank, g[G_.R25])]++;
  }
  const max = Math.max(cnt.chong, cnt.wen, cnt.bao, 1);
  ['chong', 'wen', 'bao'].forEach(k => {
    const el = $('#t-' + k);
    odo(el, cnt[k]);
    $('#b-' + k).style.transform = `scaleX(${cnt[k] / max})`;
  });
  $('#tier-note').innerHTML =
    `${TRACK_CN[state.track]}类共 <b>${nf(tot)}</b> 个可填组 · 另有 ${nf(cnt.risk)} 个"险"、${nf(cnt.far)} 个"远"、${nf(cnt.none)} 个暂无往年线的组`;
  D.tierCount = cnt;
}

function updateReadout() {
  const d25 = DIST['2025|' + TRACK_EN[state.track]];
  const el = $('#readout');
  if (!state.rank || !d25) { el.textContent = '输入分数后，这里会显示与 2025 年的等效分对照。'; return; }
  const s25 = scoreFromRank(d25, state.rank);
  el.innerHTML = `你的位次 <b>${nf(state.rank)}</b>（2026 ${TRACK_CN[state.track]}类）。
    换到 2025 年，相同位次约等于 <b>${s25 || '—'}</b> 分。<br>
    2025 与 2026 同为四川 3+1+2 新高考口径，可以直接比。
    <span class="warn">2024 及以前是文理分科</span>，与物理/历史类不是同一定义，本站不参与分档，仅在详情里作为趋势参考。`;
}

/* ==========================================================================
   11b. 再选科目
   ========================================================================== */
const SUBJ_KEY = 'luodian.subjects.v1';
function loadSubjects() {
  try {
    const v = JSON.parse(localStorage.getItem(SUBJ_KEY) || '{}');
    if (Array.isArray(v.s)) state.mySubjects = v.s.filter(x => RESELECT.indexOf(x) >= 0).slice(0, 2);
    state.onlyMatchSubject = !!v.only;
  } catch (e) { }
}
function saveSubjects() {
  try { localStorage.setItem(SUBJ_KEY, JSON.stringify({ s: state.mySubjects, only: state.onlyMatchSubject })); } catch (e) { }
}
function syncSubjectUI() {
  $$('#subj-row button').forEach(b => b.setAttribute('aria-pressed', state.mySubjects.indexOf(b.dataset.subj) >= 0 ? 'true' : 'false'));
  const full = state.mySubjects.length === 2;
  $('#subj-foot').hidden = !full;
  $('#sw-subj').checked = state.onlyMatchSubject;
  $("#subj-note").textContent = full
    ? state.mySubjects.join(' + ') + ' · 已用于校验选科要求'
    : `已选 ${state.mySubjects.length} / 2 门`;
}
function toggleSubject(v) {
  const k = state.mySubjects.indexOf(v);
  if (k >= 0) state.mySubjects.splice(k, 1);
  else {
    if (state.mySubjects.length >= 2) state.mySubjects.shift();
    state.mySubjects.push(v);
  }
  saveSubjects();
  syncSubjectUI();
  renderFilters();
  applyQuery(true);
  if (state.mySubjects.length === 2) {
    const ok = lastList.length;
    toast(`已按「${state.mySubjects.join(' + ')}」校验选科 · 符合的组 ${nf(ok)} 个`);
  }
}

/* 院校在川全部专业组的调档线区间（新高考按专业组投档，一校多条线） */
function schoolLines(si) {
  const gs = D.schoolGroups.get(si) || [];
  const byTrack = [[], []];
  gs.forEach(i => {
    const g = D.groups[i];
    if (g[G_.R25] > 0) byTrack[g[G_.TRACK]].push([g[G_.R25], g[G_.S25]]);
  });
  return byTrack.map(arr => {
    if (!arr.length) return null;
    arr.sort((x, y) => x[0] - y[0]);          /* 按位次升序：位次越小 = 分数越高 */
    const withScore = arr.filter(x => x[1] > 0);
    return {
      n: arr.length,
      best: arr[0][0], worst: arr[arr.length - 1][0],   /* best = 最小位次 */
      /* 数组已按位次升序，所以 [0] 是最高分、末尾是最低分 */
      sHigh: withScore.length ? withScore[0][1] : 0,
      sLow: withScore.length ? withScore[withScore.length - 1][1] : 0,
      nScore: withScore.length
    };
  });
}

/* 一组学科数据的紧凑展示 */
function academicChips(o) {
  const out = [];
  const sr = dictAt('sr', o[O_.SR]);
  if (sr) out.push(`<span class="acad sr${(sr[0] === 'A' ? ' top' : '')}">软科 ${esc(sr)}${o[O_.SRANK] > 0 ? ' · 第 ' + o[O_.SRANK] : ''}</span>`);
  const ml = dictAt('ml', o[O_.ML]);
  if (ml) out.push(`<span class="acad ml">${esc(ml)}</span>`);
  const de = dictAt('de', o[O_.DE]);
  if (de) out.push(`<span class="acad de">${esc(de)}</span>`);
  return out.join('');
}

/* ==========================================================================
   11b. 标签释义
   学生看到「双高计划」「部委直属」这些词往往不知何意，
   每个标签都要能点开看解释，并说明它是名单、项目还是隶属关系。
   ========================================================================== */
const KIND_DESC = {
  '名单': '入选名单，代表学校整体层次',
  '项目': '参与了某项建设或培养计划，反映办学特色',
  '隶属': '说明学校归谁管、资源从哪来',
  '资格': '具备某项资格，不等于实际水平',
  '行业': '历史上的部委隶属关系，反映行业背景',
  '合称': '民间约定俗成的叫法，不是官方名单',
  '其他': '本站尚未逐一撰写释义'
};
function tagInfo(tag) { return (D.meta.tags || {})[tag] || null; }

function openTagLegend(focusTag) {
  const tags = D.meta.tags || {};
  /* 分类顺序。注意这里必须列出所有可能出现的 kind ——
     原来是写死的白名单 + order.filter()，新分类一旦不在数组里就会被整组丢掉：
     加了「行业」「合称」两类标签后，如果不补这里，40 多个原部委标签
     会在释义里凭空消失（数据有、界面没有，比缺数据更难发现）。 */
  const order = ['名单', '资格', '项目', '隶属', '行业', '合称', '其他'];
  const groups = {};
  Object.keys(tags).forEach(t => {
    const k = tags[t].kind || '其他';
    (groups[k] = groups[k] || []).push(t);
  });
  /* 兜底：万一数据里出现了 order 没列到的 kind，也要显示出来 */
  Object.keys(groups).forEach(k => { if (order.indexOf(k) < 0) order.push(k); });
  const body = order.filter(k => groups[k]).map(k => `
    <div class="lg-grp">
      <div class="lg-kind"><b>${esc(k)}</b><span>${esc(KIND_DESC[k] || '')} · ${groups[k].length} 个</span></div>
      ${groups[k].map(t => {
        const v = tags[t];
        return `<div class="lg-item${focusTag === t ? ' hi' : ''}" data-lg="${esc(t)}">
          <div class="lg-h"><span class="lg-tag">${esc(t)}</span>
            <span class="lg-title">${esc(v.title)}</span>
            <span class="lg-cnt">${v.count} 所</span></div>
          <div class="lg-desc">${esc(v.desc)}</div>
          ${v.caution ? `<div class="lg-warn">${esc(v.caution)}</div>` : ''}
          ${v.official ? `<div class="lg-off">教育部官方名单 ${v.official} 所 · 本站按名称匹配到 ${v.count} 所（含医学部、校区等继承母体标签）</div>` : ''}
          <div class="lg-foot">
            ${v.source ? `<a class="lg-src" href="${esc(v.source)}" target="_blank" rel="noopener">教育部说明原文</a>` : ''}
            <button class="lg-go" data-lgjump="${esc(t)}">看去这 ${v.count} 所院校
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');

  $('#d-title').textContent = '院校标签说明';
  $('#d-sub').innerHTML = '<span>这些标签性质不同，混在一起看容易误判</span>';
  $('#d-body').innerHTML = `<div class="dsec">
    <div class="explain" style="margin-top:0">
      <b>「名单」类</b>说明学校整体层次，但都是历史或阶段性的，<b>不是大学排名</b>。<br>
      <b>「项目」类</b>说明学校参与了某项建设计划，只反映某方面的特色。<br>
      <b>「隶属」类</b>说明管理体制，与学校好坏没有直接关系。<br>
      判断某个专业强不强，要看<b>专业级</b>的软科评级和学科评估，不是看这些院校标签。
    </div>
    <div class="explain" style="margin-top:8px">
      同一所学校可以同时带着好几个标签 —— 它们是<b>并存的属性</b>，不是等级。
      点每条的「看去这 N 所院校」会直接筛出这些学校。
    </div></div>
    <div class="dsec"><h3>全部标签</h3><div class="lglist">${body}</div></div>`;
  openDrawer('#drawer');
  drawerGo('openTagLegend', focusTag);
  if (focusTag) {
    setTimeout(() => {
      const el = document.querySelector(`[data-lg="${focusTag}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 260);
  }
}

/* ==========================================================================
   12. 详情抽屉
   ========================================================================== */
function openGroup(i) {
  const g = D.groups[i], s = D.gSchool[i];
  const line = g[G_.R25];
  const offs = D.offByGroup[i];

  const years = [[2025, g[G_.S25], g[G_.R25], true], [2024, g[G_.S24], g[G_.R24], false], [2023, g[G_.S23], g[G_.R23], false]]
    .map(([y, sc, rk, ok]) => `<div class="ycard ${rk > 0 ? '' : 'off'}">
      <div class="y"><span>${y} 年</span>${ok ? '<span class="pill ok">可比</span>' : (rk > 0 ? '<span class="pill warn">口径不同</span>' : '<span class="pill no">无</span>')}</div>
      ${yearCell(sc, rk)}
    </div>`).join('');

  /* ---- 你的位置：位次对照尺 ----
     刻度窗口按「两者的差距」自适应，不按绝对位次 —— 22,303 的 6% 是 1338，
     远大于 68 的实际差距；按绝对位次留白会把两个标记挤到只差 2.4%，整条尺
     什么都看不出。现在：半跨度 = 差距 × 2，两点间距恒定占轨道 25%，
     差 68 和差 21,843 看起来一样清楚。窗口再按科类位次定义域 [1, HI] 收窄，
     收窄只会让间距更大，不会更小。轨道位置本身不代表百分比，真实数值在刻度上。 */
  let scale = '';
  const track = g[G_.TRACK];
  const d25 = DIST['2025|' + TRACK_EN[track]];
  if (state.rank && line > 0 && track === state.track) {
    const you = state.rank;
    const gap = Math.abs(you - line);
    /* 位次差 ≤11 名时两个针脚会合并成一个（见下），既然不需要留间距，
       就把窗口改成「你的位次 ±30%」，把冲/稳/保三档完整展开——
       比 ±25 名的超微距有用得多：压线的学生看的是「冲在哪、保在哪」。 */
    const merged = gap <= 11;
    const half = Math.max(gap * 2, 25, merged ? you * 0.3 : 0);
    const mid = (you + line) / 2;
    const HI = Math.max(D.trackMaxR[track] || 0, you, line) * 1.04;
    const lo = Math.max(1, mid - half);
    const hi = Math.max(Math.min(HI, mid + half), lo + 1);
    const span = hi - lo;
    const pos = r => clamp((r - lo) / span * 100, 0, 100);
    const pYou = pos(you), pLine = pos(line);
    const tt = TIER[tierOf(you, line)];
    const ahead = you < line;

    /* 同口径分数：2026 的分数和 2025 的组线分不能直接相减（两年的卷子）。
       先把「你的位次」用 2025 分段表反推成 2025 等效分，再和组线分比。
       自检：位次 44,146 反推 2025 物理类 = 572 分，正好等于该组官方线分。 */
    const youS = d25 ? scoreFromRank(d25, you) : null;
    const lineS = g[G_.S25] > 0 ? g[G_.S25] : (d25 ? scoreFromRank(d25, line) : null);
    const dS = (youS && lineS) ? youS - lineS : null;

    /* 冲稳保分区：四道边界都挂在「你的位次」上，所以线落在哪一段就是哪一档，
       线所在的那一段必定落在窗口内。险和远是同一类（都不是有效志愿）。
       分区名不能直接居中 —— 实测 16.7% 的情况下分区中心正好被针脚圆点压住
       （最极端的一例分区中心与针脚重合）。所以在分区内挑一个离两个针脚
       都最远的位置；实在挤不下就不标，色带本身还在。 */
    const zones = [];
    for (const [k, a, b] of [['risk', 0, .77], ['chong', .77, .95], ['wen', .95, 1.18],
                             ['bao', 1.18, 1.67], ['far', 1.67, Infinity]]) {
      const z0 = Math.max(lo, a * you), z1 = Math.min(hi, b * you);
      if (z1 <= z0) continue;
      const wp = (z1 - z0) / span * 100;
      let lbl = '';
      if (wp >= 9) {
        const zp = (z0 - lo) / span * 100;
        const near = c => Math.min(Math.abs(c - pYou), Math.abs(c - pLine));
        let bc = zp + wp / 2, bd = near(bc);
        for (const c of [zp + 3, zp + wp - 3, (pYou + pLine) / 2]) {
          if (c < zp + 1 || c > zp + wp - 1) continue;
          const d = near(c);
          if (d > bd) { bd = d; bc = c; }
        }
        if (bd >= 4) lbl = `<i style="left:${((bc - zp) / wp * 100).toFixed(1)}%">${TIER[k].n}</i>`;
      }
      zones.push(`<span class="zn ${k}" style="flex:${wp.toFixed(4)} 0 0">${lbl}</span>`);
    }

    /* 刻度：位次等距，标签用 2025 等效分（大）+ 位次（小） */
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000,
                   10000, 20000, 25000, 50000, 100000];
    let step = steps[steps.length - 1];
    for (const s of steps) if (span / s <= 5) { step = s; break; }
    let ticks = '';
    for (let v = Math.ceil(lo / step) * step, n = 0; v <= hi && n < 6; v += step, n++) {
      const p = pos(v);
      const al = p < 9 ? ' a' : p > 91 ? ' b' : '';
      const sv = d25 ? scoreFromRank(d25, v) : null;
      ticks += `<div class="tk${al}" style="left:${p.toFixed(3)}%"><i></i>` +
               `<b>${sv ? sv + ' 分' : ''}</b><span>${nf(v)}</span></div>`;
    }

    const left = Math.min(pYou, pLine), right = Math.max(pYou, pLine);
    /* 两个针脚靠得太近时标签会糊在一起，所以 gap ≤ 11 时合并成一个针脚，
       读作「你 ≈ 组线」—— 这正是「你正好压线」的意思，两个分开的点反而画不清楚。
       位次完全相同时用「=」。 */
    const pins = merged
      ? `<div class="rg-pin you" style="left:${((pYou + pLine) / 2).toFixed(3)}%">
            <span class="pk">你 ${gap === 0 ? '=' : '≈'} 组线<i>${youS || ''}</i></span>
            <i class="nd"></i><b class="kb"></b></div>`
      : `<div class="rg-pin you" style="left:${pYou.toFixed(3)}%">
            <span class="pk">你<i>${youS || ''}</i></span><i class="nd"></i><b class="kb"></b></div>
          <div class="rg-pin line" style="left:${pLine.toFixed(3)}%">
            <span class="pk">组线<i>${lineS || ''}</i></span><i class="nd"></i><b class="kb"></b></div>`;
    scale = `<div class="dsec"><h3>你的位置<span class="h3n">与 2025 年该组调档线对比</span></h3>
      <div class="rul" style="--tc:${tt.c}">
        <div class="rul-head">
          <div class="rh">
            <span class="k">你的成绩</span>
            <span class="v">${state.score || '—'}<i>分</i></span>
            <span class="s">位次 ${nf(you)} · 2026 ${TRACK_CN[track]}类</span>
          </div>
          <div class="rh mid">
            <span class="k">分差 · 2025 口径</span>
            <span class="v">${dS === null ? '—' : (dS > 0 ? '+' : '') + dS}<i>分</i></span>
            <span class="s">${gap === 0 ? '位次相同' : (ahead ? '领先' : '落后') + ' ' + nf(gap) + ' 名'}</span>
          </div>
          <div class="rh end">
            <span class="k">该组调档线</span>
            <span class="v">${lineS || nf(line)}<i>分</i></span>
            <span class="s">位次 ${nf(line)} · 2025</span>
          </div>
        </div>

        <div class="rul-gauge">
          <div class="rg-zones">${zones.join('')}</div>
          ${merged ? '' : `<div class="rg-span" style="left:${left.toFixed(3)}%;width:${Math.max(right - left, 0.6).toFixed(3)}%;
            transform-origin:${pYou <= pLine ? 'left' : 'right'};
            background:linear-gradient(90deg,${pYou <= pLine ? 'var(--amber),var(--navy-3)' : 'var(--navy-3),var(--amber)'})"></div>`}
          ${pins}
        </div>
        <div class="rg-axis">${ticks}</div>
        <div class="rg-foot"><span>← 位次靠前 · 分数更高</span>
          <span class="hint">色带 = 组线落在这一档</span>
          <span>位次靠后 · 分数更低 →</span></div>

        <div class="rul-verdict">
          <b>${tt.n}</b>
          <div class="vt"><span>${tt.d}</span><em>${TIER_ACT[tierOf(you, line)] || ''}</em></div>
        </div>
        ${dS === null ? '' : `<div class="rul-note">
          同口径换算：你的位次 ${nf(you)} 换成 2025 年约 <b>${youS} 分</b>，
          与 2025 年的组线 <b>${lineS} 分</b> 相比 <b>${dS > 0 ? '+' : ''}${dS} 分</b>。
          不能拿 2026 的 ${state.score} 分直接减 ${lineS} 分 —— 那是两年的卷子，只有位次能跨年比。
        </div>`}
      </div></div>`;
  } else if (state.rank && line > 0) {
    /* 跨科类：物理类和历史类各自独立排名，位次不能相减。
       深链接 ?group=<序号> 可以打开另一科类的组，必须挡住。 */
    scale = `<div class="dsec"><h3>你的位置</h3>
      <div class="explain" style="margin-top:0">这是 <b>${TRACK_CN[track]}类</b> 的专业组，
      而你的分数是 <b>${TRACK_CN[state.track]}类</b> 的。两个科类的位次是两套彼此独立的排名，
      不能相减，所以这里不显示差距。切到「${TRACK_CN[track]}类」并填一个该科类的分数即可。</div></div>`;
  } else if (!state.rank) {
    scale = `<div class="dsec"><h3>你的位置</h3>
      <div class="explain" style="margin-top:0">还没有输入分数。到「定位」页填入分数或位次，
      这里会显示你与这个组调档线的差距。</div></div>`;
  } else {
    /* 有你的位次，但这个组没有 2025 组线（今年新组）—— 原来这里什么都不渲染，
       整个「你的位置」板块静默消失，看起来像坏了。 */
    scale = `<div class="dsec"><h3>你的位置</h3>
      <div class="explain" style="margin-top:0">这个组<b>暂无有效的 2025 年调档线记录</b>，
      算不出你与它的差距。可以看同校其他组的线，或参考组内专业的往年位次。</div></div>`;
  }

  const mlist = offs.map(oi => {
    const o = D.offerings[oi];
    const r = o[O_.R25];
    const ac = academicChips(o);
    return `<div class="mrow" data-open-major="${oi}">
      <span class="mn">
        <span class="nm">${esc(D.meta.dicts.major[o[O_.MAJOR]] || '')}</span>
        ${o[O_.NEW] ? '<span class="pill warn">新增</span>' : ''}
        <span class="mono dim">${esc(o[O_.CODE])}</span>
      </span>
      <span class="mp">${o[O_.PLAN] > 0 ? o[O_.PLAN] + ' 人' : '—'}</span>
      <span class="mr ${r > 0 ? '' : 'none'}">${r > 0
        ? (o[O_.S25] > 0 ? `<span class="sc"><span class="n">${o[O_.S25]}</span><span class="u">分</span></span>` : '')
          + `<span class="u">位次 ${nf(r)}</span>`
        : '<span class="n">无数据</span>'}</span>
      ${ac ? `<span class="mfull">${ac}</span>` : ''}
    </div>`;
  }).join('');

  /* 院校在川各专业组的调档线区间 —— 新高考按专业组投档，一校多条线 */
  const sl = schoolLines(siOfGroup(i));
  const slTxt = sl[g[G_.TRACK]]
    ? `${nf(sl[g[G_.TRACK]].best)} – ${nf(sl[g[G_.TRACK]].worst)}`
    : '无往年数据';
  const slN = sl[g[G_.TRACK]] ? sl[g[G_.TRACK]].n : 0;

  /* ---- 学费：两个口径分列，互不覆盖，也绝不判定一致 ----
     主 = 招生考试报填报值（四川口径，96.1% 的专业有）
     辅 = 官方收费表区间（院校级，按收费类别列，可能来自别的省份）
     南溟库这次更新后官方证据从 213 所涨到 1,639 所，但 33,666 条走的是
     「省级考试院招生计划」，其中 33,328 条来自福建省 —— 对四川考生是跨省代理。
     所以来源必须写清楚，不能含糊成「官方核实」四个字。 */
/* 学费证据的口径 → 配色。与 export.py 的 FEE_PROV_CN 一一对应；
   南溟库新增档位时这里必须同步，否则新档会掉进兜底、颜色和含义对不上。
   测试里有一条断言：每一档都能在这张表里找到。 */
const FEE_KIND_CLS = {
  '学校官方': 'self',
  '教育部阳光高考': 'moe',
  '省级考试院招生计划': 'other',
  '其他官方来源': 'misc',
};
  const feeRows = offs.slice(0, 1).map(oi => {
    const o = D.offerings[oi];
    const verified = o[O_.FSCOPE] && o[O_.FSCOPE] !== 'UNVERIFIED';
    const pub = o[O_.FPUB] >= 0 ? (D.meta.dicts.fpub[o[O_.FPUB]] || '') : '';
    const kind = o[O_.FKIND] >= 0 ? (D.meta.dicts.fkind[o[O_.FKIND]] || '') : '';
    /* 口径 → 配色。原来写的是三元表达式，只认三种；南溟库这次多出
       「其他官方来源」一档，会掉进 else 被当成「教育部阳光高考」—— 归错类了。
       改成查表 + 兜底，并且下面有一条断言保证每档都在表里。 */
    const kindCls = FEE_KIND_CLS[kind] || 'misc';
    const tmin = g[G_.TMIN], tmax = g[G_.TMAX];
    return `<div class="fee">
      <div class="fr">
        <span class="k">招生考试报填报</span>
        <span class="v">${tmin > 0 ? (tmin === tmax ? nf(tmin) : nf(tmin) + ' – ' + nf(tmax)) : '—'}</span>
        <span class="u">元 / 年</span>
      </div>
      <div class="fs">四川口径 · 组内各专业分别是
        ${esc(D.meta.dicts.tfee[o[O_.TFEE]] || '—')} 元/年</div>
      ${verified ? `
      <div class="fsep"></div>
      <div class="fr">
        <span class="k">官方收费表</span>
        <span class="v">${nf(o[O_.FMIN])}${o[O_.FMAX] !== o[O_.FMIN] ? ' – ' + nf(o[O_.FMAX]) : ''}</span>
        <span class="u">元 / 年</span>
      </div>
      <div class="fs">院校级收费表，按收费类别列，不是按你这个专业列的
        <span class="prov ${kindCls}">${esc(kind)}${pub ? ' · ' + esc(pub) : ''}</span></div>
      <div class="fw">官方表覆盖的是全校各收费类别，和上面的填报值<b>不一定对口</b>，
        也不能据此判定谁对谁错 —— 你实际按<b>招生考试报</b>的金额交费。</div>
      ${o[O_.FSUM] >= 0 ? `<details class="fdet">
        <summary>查看官方收费明细（${((D.meta.dicts.fee[o[O_.FSUM]] || '').length / 1).toFixed(0)} 字）</summary>
        <div class="note">${esc(D.meta.dicts.fee[o[O_.FSUM]] || '')}</div>
      </details>` : ''}
      ${o[O_.FURL] >= 0 ? `<a class="src" href="${esc(D.meta.dicts.url[o[O_.FURL]])}" target="_blank" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        ${pub ? esc(pub) : '官方来源'} · 查看原文</a>` : ''}`
      : `<div class="note" style="margin-top:8px">这所学校的学费还没有官方核实证据，
        上面是招生考试报的填报值。</div>`}
    </div>`;
  }).join('');

  const t = state.rank && line > 0 ? TIER[tierOf(state.rank, line)] : null;
  const inB = state.basket.indexOf(i) >= 0;

  $('#d-title').textContent = s.n;
  $('#d-sub').innerHTML = `<span>${TRACK_CN[g[G_.TRACK]]}类 · ${esc(g[G_.BATCH])}</span>
    <span class="mono">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span>
    ${t ? `<span class="pill" style="background:${t.c};color:#fff">${t.n}</span>` : ''}`;

  $('#d-body').innerHTML =
    scale +
    /* ---- 调档线：三个层级分开讲清楚 ---- */
    `<div class="dsec"><h3>调档线（投档线）</h3>
      <div class="lines3">
        <div class="ln-card main">
          <div class="ln-head"><span class="ln-k">本专业组调档线</span>
            <span class="ln-tag">${g[G_.SRC] === 0 ? '官方值' : g[G_.SRC] === 1 ? '推导值' : '暂无往年线'}</span></div>
          <div class="ln-v num">${g[G_.S25] > 0 ? g[G_.S25] + '<span class="u">分</span>' : (line > 0 ? nf(line) : '—')}</div>
          <div class="ln-s">${line > 0 ? '位次 ' + nf(line) + ' · 2025 年' : '无往年数据'}</div>
        </div>
        <div class="ln-card">
          <div class="ln-head"><span class="ln-k">该校在川 ${TRACK_CN[g[G_.TRACK]]}类</span>
            <span class="ln-tag">院校级参考</span></div>
          <div class="ln-v num range">${slTxt}</div>
          <div class="ln-s">位次区间 · ${slN} 个专业组各有其线</div>
        </div>
      </div>
      <div class="explain">
        <b>新高考按「院校专业组」投档</b>，一所学校会有多条调档线（每个专业组一条）。
        上面左边是你正在看的这个组的线；右边是该校 ${slN} 个组的线分布区间。
        进组之后才分专业，所以<b>组内热门专业的实际录取位次会高于组调档线</b>——
        下面「组内专业」一列给的就是每个专业自己的录取最低位次。
      </div>
    </div>` +
    `<div class="dsec"><h3>本组历年调档线</h3><div class="years">${years}</div>
      <div class="explain" style="margin-top:10px">
        2024 与 2023 是<b>文理分科</b>口径，与 2026 的物理类 / 历史类不是同一定义，<b>不可直接比较</b>，只作趋势参考。
      </div></div>` +
    `<div class="dsec"><h3>组内 ${offs.length} 个专业</h3>
      <div class="mlist ${offs.some(o => academicChips(D.offerings[o])) ? 'has-acad' : ''}">${mlist}</div>
      <div class="explain" style="margin-top:10px">
        最右列是<b>专业录取最低位次</b>（专业自己的线，通常高于组线）。
        ${offs.some(o => academicChips(D.offerings[o])) ? '下面的评级也都是<b>专业级</b>数据，同一所学校不同专业各不相同。' : ''}
      </div></div>` +
    `<div class="dsec"><h3>学费</h3>${feeRows}</div>` +
    `<div class="dsec"><h3>院校信息<span class="lv-tag">院校级</span></h3><dl class="kv">
      <dt>所在</dt><dd>${esc(s.prov)} ${esc(s.city)}${s.tier ? ' · ' + esc(s.tier) : ''}</dd>
      <dt>性质</dt><dd>${esc(s.own)} · ${esc(s.typ)} · ${esc(s.lvl)}</dd>
      <dt>主管</dt><dd>${esc(s.aff || '—')}</dd>
      <dt>院校排名</dt><dd>${s.rk ? s.rk + ' <span class="lv-tag">软科中国大学排名</span>' : '—'}</dd>
      ${s.pg != null ? `<dt>保研率</dt><dd>${(s.pg * 100).toFixed(2)}%</dd>` : ''}
      <dt>院校水平</dt><dd>${esc(s.ilv || '—')}</dd>
      ${s.mn ? `<dt>教育部名录</dt><dd>${esc(s.mn)}${s.mid ? ' · <span class="mono">' + esc(s.mid) + '</span>' : ''}</dd>`
             : `<dt>教育部名录</dt><dd class="dim">未按名称匹配（军队、港澳或特殊招生单位）</dd>`}
    </dl>
    <div class="explain" style="margin-top:10px">
      「院校排名」是<b>学校综合排名</b>（软科中国大学排名），不是专业排名。
      学校的专业强弱差异很大——请看上面每个专业各自的软科专业评级。
    </div>
    ${s.desc ? `<div class="desc-box">${esc(s.desc)}</div>` : ''}
    ${s.charter ? `<a class="src" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--navy-3);margin-top:12px" href="${esc(s.charter)}" target="_blank" rel="noopener">招生章程入口</a>` : ''}
    </div>` +
    `<div style="display:flex;gap:9px">
      <button class="btn ${inB ? 'ghost' : 'primary'}" data-add="${i}" style="flex:1">
        ${inB ? '已在志愿表 · 点击移出' : '加入志愿表'}</button>
    </div>`;

  openDrawer('#drawer');
  drawerGo('openGroup', i);
}
const siOfGroup = i => D.groups[i][G_.SCHOOL];

/* ==========================================================================
   院校详细档案
   --------------------------------------------------------------------------
   数据侧每校都有一份详细档案（平均 915 字，按【章节】分段，8 个固定章节）。
   原来页面上只有一句短简介 —— 详情导出来了却没人用。

   渲染成折叠分节而不是一整块文字：研究生培养那节光硕士就列 85 项，
   不折叠的话一屏全是专业名，反而盖住了真正要看的东西。
   第一节默认展开（概况），其余收起。
   ========================================================================== */
function detailSections(text) {
  if (!text) return [];
  const out = [];
  const re = /【([^】]{1,24})】\s*([\s\S]*?)(?=【[^】]{1,24}】|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const b = m[2].trim();
    if (b) out.push({ t: m[1].trim(), b: b });
  }
  /* 没有【】标记就整段当作一节，不要丢内容 */
  return out.length ? out : [{ t: '院校档案', b: String(text).trim() }];
}

/* detailStatus 是数据侧的状态码，翻成学生看得懂的话。
   不是「已核实」，只是「有哪些官方来源进了索引」—— 措辞必须留有余地。 */
const DETAIL_STATUS_CN = {
  OFFICIAL_REGISTRY_AND_CHSI_INDEX: '已关联教育部名录与阳光高考索引',
  CHSI_INDEX_WITHOUT_MOE_NAME_MATCH: '已关联阳光高考索引（未与教育部名录名称匹配）',
  OFFICIAL_SOURCE_INDEX_INCOMPLETE: '官方来源索引不完整',
  OFFICIAL_REGISTRY_ONLY: '仅有教育部名录',
};

function detailBlock(s) {
  const secs = detailSections(s.detail);
  if (!secs.length) return '';
  const st = DETAIL_STATUS_CN[s.detailStatus] || '';
  const n = s.detailSourceCount || 0;
  const up = (s.detailUpdatedAt || '').slice(0, 10);
  return `<div class="dsec"><h3>院校详细档案<span class="lv-tag">官方来源索引</span></h3>
    <div class="ax-meta">
      ${n ? `<span class="ax-pill">官方来源 ${n} 项</span>` : ''}
      ${st ? `<span class="ax-pill">${esc(st)}</span>` : ''}
      ${up ? `<span class="ax-pill mono">${esc(up)}</span>` : ''}
    </div>
    <div class="ax-list">${secs.map((x, k) => `<details class="ax"${k === 0 ? ' open' : ''}>
      <summary>${esc(x.t)}</summary><div class="ax-b">${esc(x.b)}</div></details>`).join('')}</div>
    <div class="explain" style="margin-top:12px">档案由官方来源索引与库内结构化字段编排而成，
      <b>用于快速了解这所学校</b>；具体招生要求、专业与费用，请以学校招生章程和当年招生计划为准。</div>
  </div>`;
}

function openSchool(si) {
  const s = D.schools[si];
  const gs = (D.schoolGroups.get(si) || []).slice();
  gs.sort((a, b) => {
    const ra = D.groups[a][G_.R25], rb = D.groups[b][G_.R25];
    return (ra > 0 ? ra : Infinity) - (rb > 0 ? rb : Infinity);
  });
  const byTrack = [[], []];
  gs.forEach(i => byTrack[D.groups[i][G_.TRACK]].push(i));
  const blocks = byTrack.map((arr, t) => {
    if (!arr.length) return '';
    return `<div class="dsec"><h3>${TRACK_CN[t]}类 · ${arr.length} 个可填组</h3><div class="mlist">` +
      arr.slice(0, 50).map(i => {
        const g = D.groups[i];
        const r = g[G_.R25];
        const sc = g[G_.S25];
        return `<div class="mrow" data-open-group="${i}">
          <span class="mn"><span class="nm mono">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span>
            <span class="dim" style="font-size:12px">${esc(g[G_.BATCH])}</span></span>
          <span class="mp">${g[G_.NMAJ]} 专业 · ${g[G_.PLAN] || '—'} 人</span>
          <span class="mr ${r > 0 ? '' : 'none'}">${r > 0
            ? (sc > 0 ? `<span class="sc"><span class="n">${sc}</span><span class="u">分</span></span>` : '')
              + `<span class="u">位次 ${nf(r)}</span>`
            : '<span class="n">新组</span>'}</span></div>`;
      }).join('') + `</div>${arr.length > 50 ? `<div class="note" style="font-size:12px;color:var(--faint);margin-top:8px">仅显示前 50 个组</div>` : ''}</div>`;
  }).join('');

  /* 各科类调档线区间 */
  const sl = schoolLines(si);
  const lineCards = [0, 1].map(t => {
    const d = sl[t];
    if (!d) return '';
    const same = d.sHigh === d.sLow;
    return `<div class="ln-card">
      <div class="ln-k">${TRACK_CN[t]}类调档线区间</div>
      <div class="ln-v num">${d.nScore
        ? (same ? d.sHigh : d.sLow + ' – ' + d.sHigh) + '<span class="u">分</span>'
        : '—'}</div>
      <div class="ln-s">${d.n} 个专业组${d.nScore ? ' · 位次 ' + nf(d.best) + '–' + nf(d.worst) : '，无往年分数'}</div>
    </div>`;
  }).join('');

  $('#d-title').textContent = s.n;
  $('#d-sub').innerHTML = `<span>${esc(s.prov)}${s.city ? ' · ' + esc(s.city) : ''}</span>
    <span>${esc(s.own)} · ${esc(s.typ)} · ${esc(s.lvl)}</span>
    ${(s.tag || []).slice(0, 4).map(t => `<span class="pill" style="background:var(--surface-3);color:var(--dim)">${esc(t)}</span>`).join('')}`;
  $('#d-body').innerHTML =
    (lineCards ? `<div class="dsec"><h3>调档线（投档线）</h3><div class="lines3 wide">${lineCards}</div>
      <div class="explain"><b>新高考按「院校专业组」投档</b>，一所学校会有多条调档线，每个专业组一条。
      下面是各组的线分布区间，点开具体组看它自己的线。</div></div>` : '') +
    (s.desc ? `<div class="dsec"><h3>院校简介</h3><div class="desc-box">${esc(s.desc)}</div>
      ${s.focus ? `<div class="explain" style="margin-top:10px">专业覆盖与方向：${esc(s.focus)}</div>` : ''}
      ${s.ev ? `<div class="explain" style="margin-top:6px">学科 / 专业证据：${esc(s.ev)}</div>` : ''}</div>` : '') +
    detailBlock(s) +
    `<div class="dsec"><h3>基本信息<span class="lv-tag">院校级</span></h3><dl class="kv">
      <dt>院校代码</dt><dd class="mono">${esc(s.code)}</dd>
      <dt>所在</dt><dd>${esc(s.prov)} ${esc(s.city)}${s.tier ? ' · ' + esc(s.tier) : ''}</dd>
      <dt>性质类型</dt><dd>${esc(s.own)} · ${esc(s.typ)} · ${esc(s.lvl)}</dd>
      <dt>主管</dt><dd>${esc(s.aff || '—')}</dd>
      <dt>院校排名</dt><dd>${s.rk ? s.rk + ' <span class="lv-tag">软科中国大学排名</span>' : '—'}</dd>
      ${s.pg != null ? `<dt>保研率</dt><dd>${(s.pg * 100).toFixed(2)}%</dd>` : ''}
      <dt>录取规则</dt><dd>${esc(s.rule || '—')}</dd>
      <dt>在川招生</dt><dd>${gs.length} 个专业组</dd>
      ${s.mn ? `<dt>教育部名录</dt><dd>${esc(s.mn)}${s.mid ? ' · <span class="mono">' + esc(s.mid) + '</span>' : ''}<br><span class="dim">${esc(s.md || '')}${s.ml ? ' · ' + esc(s.ml) : ''}${s.mvl ? ' · ' + esc(s.mvl) : ''}</span></dd>`
             : `<dt>教育部名录</dt><dd class="dim">未按名称匹配</dd>`}
    </dl>
    <div class="explain" style="margin-top:10px">
      以上都是<b>院校级</b>数据。<b>一所学校的专业强弱差异很大</b>——
      软科专业评级、学科评估、专业水平这些都是<b>每个专业各自的值</b>，请在具体专业组里查看。
    </div>
    ${s.charter ? `<a class="src" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--navy-3);margin-top:12px" href="${esc(s.charter)}" target="_blank" rel="noopener">招生章程入口</a>` : ''}
    </div>` + blocks;
  openDrawer('#drawer');
  drawerGo('openSchool', si);
}

function openMajor(oi) {
  const o = D.offerings[oi], g = D.groups[o[O_.GROUP]], s = D.gSchool[o[O_.GROUP]];
  const years = [[2025, o[O_.S25], o[O_.R25], true], [2024, o[O_.S24], o[O_.R24], false], [2023, o[O_.S23], o[O_.R23], false]]
    .map(([y, sc, rk, ok]) => `<div class="ycard ${rk > 0 ? '' : 'off'}">
      <div class="y"><span>${y} 年</span>${ok ? '<span class="pill ok">可比</span>' : (rk > 0 ? '<span class="pill warn">口径不同</span>' : '<span class="pill no">无</span>')}</div>
      ${yearCell(sc, rk)}</div>`).join('');
  $('#d-title').textContent = D.meta.dicts.major[o[O_.MAJOR]] || '';
  $('#d-sub').innerHTML = `<span>${esc(s.n)}</span><span class="mono">${esc(g[G_.COMPOUND] || g[G_.CODE])} · ${esc(o[O_.CODE])}</span>`;
  const ac = academicChips(o);
  $('#d-body').innerHTML =
    `<div class="dsec"><h3>专业调档线</h3>
      <div class="lines3">
        <div class="ln-card main">
          <div class="ln-head"><span class="ln-k">本专业录取最低位次</span><span class="ln-tag">专业级</span></div>
          <div class="ln-v num">${o[O_.S25] > 0 ? o[O_.S25] + '<span class="u">分</span>' : (o[O_.R25] > 0 ? nf(o[O_.R25]) : '—')}</div>
          <div class="ln-s">${o[O_.R25] > 0 ? '位次 ' + nf(o[O_.R25]) + ' · 2025 年' : '无往年数据'}</div>
        </div>
        <div class="ln-card">
          <div class="ln-head"><span class="ln-k">所属专业组调档线</span>
            <span class="ln-tag">${g[G_.SRC] === 0 ? '官方值' : '暂无往年线'}</span></div>
          <div class="ln-v num">${g[G_.S25] > 0 ? g[G_.S25] + '<span class="u">分</span>' : (g[G_.R25] > 0 ? nf(g[G_.R25]) : '—')}</div>
          <div class="ln-s">${g[G_.R25] > 0 ? '位次 ' + nf(g[G_.R25]) + ' · 2025 年' : '无往年数据'}</div>
        </div>
      </div>
      <div class="explain">专业录取线通常<b>高于</b>所属专业组的调档线——先投档进组，再在组内分专业。</div>
    </div>` +
    (ac ? `<div class="dsec"><h3>学科评级<span class="lv-tag">专业级</span></h3>
      <div class="acad-list">${ac}</div>
      <div class="explain" style="margin-top:10px">
        <b>这些是「${esc(D.meta.dicts.major[o[O_.MAJOR]] || '')}」这一个专业自己的数据</b>，
        不是学校的。同一所学校不同专业的评级可以差很多。
        ${o[O_.MP] >= 0 ? `<br>本专业硕士点：${esc(D.meta.dicts.mp[o[O_.MP]])}` : ''}
        ${o[O_.DP] >= 0 ? `<br>本专业博士点：${esc(D.meta.dicts.dp[o[O_.DP]])}` : ''}
      </div></div>` : '') +
    `<div class="dsec"><h3>专业信息</h3><dl class="kv">
      <dt>所属院校</dt><dd>${esc(s.n)}</dd>
      <dt>专业组</dt><dd class="mono">${esc(g[G_.COMPOUND] || g[G_.CODE])}</dd>
      <dt>专业代码</dt><dd class="mono">${esc(o[O_.CODE])}</dd>
      <dt>26 计划</dt><dd>${o[O_.PLAN] > 0 ? o[O_.PLAN] + ' 人' : '—'}</dd>
      <dt>26 学费</dt><dd>${esc(D.meta.dicts.tfee[o[O_.TFEE]] || '—')}</dd>
      <dt>门类</dt><dd>${esc(D.meta.dicts.cat[o[O_.CAT]] || '—')} · ${esc(D.meta.dicts.catc[o[O_.CATC]] || '—')}</dd>
      <dt>层次</dt><dd>${esc(o[O_.LEVEL] || '—')}</dd>
      <dt>选科要求</dt><dd>${esc(g[G_.REQ] || '不限')}</dd>
      ${o[O_.NOTE] >= 0 ? `<dt>专业备注</dt><dd>${esc(D.meta.dicts.note[o[O_.NOTE]] || '')}</dd>` : ''}
      ${o[O_.NEW] ? `<dt>标记</dt><dd><span class="pill warn">2026 新增</span></dd>` : ''}
    </dl></div>
    <div class="dsec"><h3>历年录取</h3><div class="years">${years}</div></div>
    <div style="display:flex;gap:9px"><button class="btn ghost" data-open-group="${o[O_.GROUP]}" style="flex:1">查看整个专业组</button></div>`;
  openDrawer('#drawer');
  drawerGo('openMajor', oi);
}

/* ==========================================================================
   抽屉的开关 —— 手机上的退出是这里的重点
   --------------------------------------------------------------------------
   原来只有三条退出路径：× 按钮、点遮罩、Esc 键。
   问题是抽屉在手机上宽 min(620px,100%)，375px 屏就是满屏 —— 遮罩被完全盖住，
   「点外面关掉」根本点不到；而 Esc 键手机上没有。于是只剩右上角一个按钮，
   学生点进院校/专业详情后经常找不到怎么退出来。
   补两条手机原生的退出方式：
     ① 返回键 / 返回手势 —— 打开时压一条历史记录，popstate 时关掉详情而不是离开站点；
     ② 向右滑动手势 —— 和大多数手机上的侧滑面板一致。
   ========================================================================== */
/* ==========================================================================
   抽屉的层级栈
   --------------------------------------------------------------------------
   抽屉是同一个元素复用了 4 种内容：标签说明 / 专业组 / 院校 / 专业。
   「院校列表 → 点卡片进院校详情 → 点专业进专业详情」这条路径上，
   抽屉从头到尾都是开着的。

   原来只用「抽屉是否已打开」判断要不要压历史记录，于是第二级、第三级都漏了：
   在专业详情按返回，一次就把整个抽屉关掉，直接回到院校列表 —— 中间那一级丢了。

   现在逐级记录，返回时逐级回退；并且只压「一条」历史记录，层级在应用内维护：
   返回时先退一级、再把这条记录补回去，这样下一次返回仍然可用；
   栈空了才真正关闭抽屉。这样避免 history.go(-n) 的计数对不上。
   ========================================================================== */
let drawerStack = [];        // [{ fn, arg, scroll }]
let drawerReplaying = false; // 回放上一级时不要重复入栈
const LD_OVERLAY = 'ldOverlay';

/* 只有「当前历史条目确实是自己压的」才敢调 history.back()。
   ----------------------------------------------------------------------
   back() 的语义是「退到浏览器历史的上一条」。那条如果不是我们压的，
   用户看到的就是「点 × 直接退出了网页」—— 之前就是这样：
   下面引用了未定义的 LD_OVERLAY，pushState 抛 ReferenceError 被空 catch 吞掉，
   历史里根本没留下我们的条目，closeDrawers 却照样 back()，一路退到站外。

   两道保险：
   ① 压栈成功才认为「有我们的一条」（pushOk）；
   ② 关闭前再用 history.state 上的标记复核一次。
   goto() 的 replaceState 会换掉 state，所以那里必须保留 history.state ——
   标记丢了只是退不回去、留一条多余记录，绝不会退到站外，失败方向是安全的。 */
let pushOk = false;
function overlayIsOurs() {
  return pushOk && !!(history.state && history.state[LD_OVERLAY]);
}

function drawerTop() { return drawerStack[drawerStack.length - 1] || null; }

/* 由各 open* 函数在渲染完成后调用，记下这一级 */
function drawerGo(fn, arg) {
  if (drawerReplaying) return;
  const box = $('#d-body');
  const cur = drawerTop();
  if (cur) cur.scroll = box ? box.scrollTop : 0;   // 记住离开时的位置
  drawerStack.push({ fn: fn, arg: arg, scroll: 0 });
  if (drawerStack.length === 1) {
    /* 压栈失败要如实记下来 —— 之前空 catch 吞掉异常，后面照样 back() 就退到站外了 */
    try { history.pushState({ [LD_OVERLAY]: 1 }, '', location.href); pushOk = true; }
    catch (e) { pushOk = false; }
  }
  updateDrawerBack();
}

function updateDrawerBack() {
  const b = $('#d-back');
  if (b) b.hidden = drawerStack.length < 2;   // 只有一级时没有「上一级」可回
}

function replayDrawer(rec) {
  drawerReplaying = true;
  try {
    ({ openTagLegend: openTagLegend, openGroup: openGroup,
       openSchool: openSchool, openMajor: openMajor })[rec.fn](rec.arg);
  } catch (e) { }
  drawerReplaying = false;
  const box = $('#d-body');
  if (box) box.scrollTop = rec.scroll || 0;
  updateDrawerBack();
}

/* 返回上一级：有上级就回退，没有就关掉 */
function drawerBack(skipHistory) {
  if (!drawerStack.length) return false;
  drawerStack.pop();
  const top = drawerTop();
  if (!top) { closeDrawers(skipHistory); return false; }
  replayDrawer(top);
  return true;
}

function openDrawer(sel) {
  $('#scrim').classList.add('on');
  $(sel).classList.add('on');
  document.body.classList.add('no-scroll');
  bindDrawerSwipe($(sel));
}
/* skipHistory：由 popstate 触发的关闭、或「关掉抽屉顺带跳页」的情况，
   不能再调 history.back() —— 前者会把用户弹出站点，后者会跟路由打架。 */
function closeDrawers(skipHistory) {
  const had = drawerStack.length > 0;
  drawerStack = [];
  updateDrawerBack();
  $('#scrim').classList.remove('on');
  $('#drawer').classList.remove('on');
  $('#basket').classList.remove('on');
  document.body.classList.remove('no-scroll');
  /* 复核：当前条目确实是我们的才 back()，否则宁可留一条多余记录 */
  if (had && !skipHistory && overlayIsOurs()) {
    pushOk = false;
    try { history.back(); } catch (e) { }
  }
}
window.addEventListener('popstate', () => {
  pushOk = false;   // 条目已被系统返回消费
  if (!drawerStack.length) return;
  if (drawerStack.length > 1) {
    /* 还有上级：退一级，并把历史记录补回来，让下一次返回依然生效 */
    drawerStack.pop();
    replayDrawer(drawerTop());
    try { history.pushState({ [LD_OVERLAY]: 1 }, '', location.href); pushOk = true; } catch (e) { pushOk = false; }
  } else {
    drawerStack.pop();
    updateDrawerBack();
    closeDrawers(true);
  }
});

/* 向右滑动关闭。只在抽屉内部起手、且横向位移明显时生效，
   避免和纵向滚动、以及卡片里的横滑手势打架。 */
function bindDrawerSwipe(el) {
  if (!el || el.dataset.swipeBound) return;
  el.dataset.swipeBound = '1';
  let x0 = 0, y0 = 0, live = false;
  el.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1) return;
    x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; live = true;
  }, { passive: true });
  el.addEventListener('touchmove', ev => {
    if (!live) return;
    const dx = ev.touches[0].clientX - x0, dy = ev.touches[0].clientY - y0;
    /* 纵向为主就放弃，交给页面滚动 */
    if (Math.abs(dy) > Math.abs(dx)) { live = false; return; }
    if (dx > 74) { live = false; closeDrawers(); }
  }, { passive: true });
  el.addEventListener('touchend', () => { live = false; }, { passive: true });
}

/* ==========================================================================
   13. 志愿表
   ========================================================================== */
const BK_KEY = 'luodian.basket.v1';
function loadBasket() {
  try { const v = JSON.parse(localStorage.getItem(BK_KEY) || '[]'); if (Array.isArray(v)) state.basket = v; } catch (e) { }
}
function saveBasket() { try { localStorage.setItem(BK_KEY, JSON.stringify(state.basket)); } catch (e) { } }

function toggleBasket(i, silent) {
  const k = state.basket.indexOf(i);
  if (k >= 0) state.basket.splice(k, 1); else state.basket.push(i);
  saveBasket();
  renderBasket();
  $$(`[data-add="${i}"]`).forEach(b => {
    const on = state.basket.indexOf(i) >= 0;
    b.classList.toggle('on', on);
    const svg = b.querySelector('svg');
    if (svg) svg.innerHTML = on ? '<path d="m5 12.5 4.5 4.5L19 7"/>' : '<path d="M12 5v14M5 12h14"/>';
    b.setAttribute('aria-label', on ? '移出志愿表' : '加入志愿表');
  });
  if (!silent) {
    /* 从按钮位置爆开，让反馈落在手指按的地方 */
    const btn = document.querySelector(`[data-add="${i}"]`);
    if (btn) {
      const r = btn.getBoundingClientRect();
      const on = state.basket.indexOf(i) >= 0;
      FX.burst(r.left + r.width / 2, r.top + r.height / 2,
        on ? ['#2e8b6b', '#3aa37e', '#7fd6a8'] : ['#8d95a3', '#a8b0bd'], on ? 18 : 10);
      btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 540);
    }
    toast(state.basket.indexOf(i) >= 0 ? '已加入志愿表' : '已移出志愿表');
  }
  checkMilestone();
}

/* 里程碑：填满 45 个 / 梯度首次配平 */
function checkMilestone() {
  const n = state.basket.length;
  if (n === 45 && !state.milestone45) {
    state.milestone45 = true;
    FX.confetti(130);
    toast('45 个志愿位填满了 · 记得检查梯度');
  }
  if (state.rank && n >= 15) {
    const c = { chong: 0, wen: 0, bao: 0 };
    state.basket.forEach(i => { const t = tierOf(state.rank, D.groups[i][G_.R25]); if (c[t] !== undefined) c[t]++; });
    const bal = c.chong >= 4 && c.bao >= 8 && c.chong <= c.wen + c.bao;
    if (bal && !state.milestoneBal) {
      state.milestoneBal = true;
      FX.confetti(80);
      toast(`梯度已配平：冲 ${c.chong} · 稳 ${c.wen} · 保 ${c.bao}`);
    } else if (!bal) state.milestoneBal = false;
  }
}

function renderBasket() {
  const n = state.basket.length;
  $('#basket-n').textContent = n; $('#basket-n').style.display = n ? '' : 'none';
  $('#rail-plan').textContent = n;
  $('#bk-sub').textContent = n ? `${n} 个专业组 · 建议按冲稳保排序` : '还没收起任何组';
  if (!n) {
    $('#bk-body').innerHTML = `<div class="empty" style="padding:70px 24px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16l-1.4 12.1a2 2 0 0 1-2 1.9H7.4a2 2 0 0 1-2-1.9Z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>
      <h3>志愿表是空的</h3><p>在「选组」里点卡片右下角的 + 收进来。</p></div>`;
    renderPlanPage(); return;
  }
  const sorted = state.basket.slice().sort((a, b) => {
    if (state.rank) {
      const order = { chong: 0, wen: 1, bao: 2, risk: 3, far: 4, none: 5 };
      const ta = order[tierOf(state.rank, D.groups[a][G_.R25])];
      const tb = order[tierOf(state.rank, D.groups[b][G_.R25])];
      if (ta !== tb) return ta - tb;
      return (D.groups[a][G_.R25] || 0) - (D.groups[b][G_.R25] || 0);
    }
    return big(D.groups[a][G_.R25]) - big(D.groups[b][G_.R25]);
  });
  $('#bk-body').innerHTML = sorted.map((i, k) => {
    const g = D.groups[i], s = D.gSchool[i];
    const t = state.rank && g[G_.R25] > 0 ? TIER[tierOf(state.rank, g[G_.R25])] : null;
    return `<div class="bitem" style="animation-delay:${k * 24}ms">
      <span class="idx" style="${t ? 'background:' + t.c : ''}">${k + 1}</span>
      <div class="info"><div class="nm">${esc(s.n)}</div>
        <div class="sub"><span class="mono">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span>
          <span>${g[G_.NMAJ]} 专业</span>
          <span>${g[G_.R25] > 0 ? nf(g[G_.R25]) + ' 位次' : '新组'}</span></div></div>
      <button class="rm" data-rm="${i}" aria-label="移出"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
    </div>`;
  }).join('');
  renderPlanPage();
}

function renderPlanPage() {
  const el = $('#plan-body');
  if (!state.basket.length) {
    el.innerHTML = `<div class="empty card" style="padding:70px 24px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16l-1.4 12.1a2 2 0 0 1-2 1.9H7.4a2 2 0 0 1-2-1.9Z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>
      <h3>还没有收起任何组</h3><p>去「选组」页面，点卡片右下角的 + 把想填的组收进来。<br>收够之后这里会自动排好梯度。</p></div>`;
    return;
  }

  const order = { chong: 0, wen: 1, bao: 2, risk: 3, far: 4, none: 5 };
  const sorted = state.basket.slice().sort((a, b) => {
    if (state.rank) {
      const ta = order[tierOf(state.rank, D.groups[a][G_.R25])], tb = order[tierOf(state.rank, D.groups[b][G_.R25])];
      if (ta !== tb) return ta - tb;
    }
    return big(D.groups[a][G_.R25]) - big(D.groups[b][G_.R25]);
  });

  const buckets = { chong: [], wen: [], bao: [], risk: [], far: [], none: [] };
  sorted.forEach(i => buckets[state.rank ? tierOf(state.rank, D.groups[i][G_.R25]) : 'none'].push(i));
  const SLOTS = 45;
  const used = state.basket.length;
  const pct = clamp(used / SLOTS, 0, 1);

  /* ---- 容量 + 配比 ---- */
  let html = `<div class="plan-head card">
    <div class="ph-l">
      <div class="ph-k">本科批B段志愿位</div>
      <div class="ph-n"><b>${used}</b><span>/ ${SLOTS}</span></div>
      <div class="ph-bar"><i style="transform:scaleX(${pct})"></i></div>
      <div class="ph-hint">${used >= SLOTS ? '已填满，再加会超出容量' : '还可以再填 ' + (SLOTS - used) + ' 个'}</div>
    </div>
    <div class="ph-r">
      ${['chong', 'wen', 'bao'].map(k => `<div class="ph-t" style="--tc:${TIER[k].c}">
        <span class="d"></span><span class="n">${TIER[k].n}</span>
        <b>${buckets[k].length}</b></div>`).join('')}
      ${buckets.none.length ? `<div class="ph-t" style="--tc:var(--faint)"><span class="d"></span><span class="n">新</span><b>${buckets.none.length}</b></div>` : ''}
    </div>
  </div>`;

  /* ---- 梯度分布刻度尺 ---- */
  html += planScale(sorted);

  /* ---- 诊断 ---- */
  html += planDiagnosis(buckets, used, SLOTS);

  /* ---- 列表（可拖拽） ---- */
  html += `<div class="sec-h" style="margin:20px 0 10px">
    <h2>志愿顺序</h2><span class="line"></span>
    <span class="note">按住左侧手柄拖动排序 · 已按冲稳保预排</span></div>
    <div class="plan-list" id="plan-list">${sorted.map((i, k) => planRow(i, k)).join('')}</div>`;

  el.innerHTML = html;
  bindPlanDrag();
}

function planRow(i, k) {
  const g = D.groups[i], s = D.gSchool[i];
  const t = state.rank && g[G_.R25] > 0 ? TIER[tierOf(state.rank, g[G_.R25])] : TIER.none;
  const ec = enrollChange(g);
  const mine = state.mySubjects.length === 2 ? state.mySubjects : null;
  const bad = mine ? !subjectOK(g[G_.REQ], mine) : false;
  return `<div class="prow${bad ? ' mismatch' : ''}" data-pk="${i}" data-idx="${k}">
    <button class="grip" aria-label="拖动排序"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
    <span class="pidx" style="background:${t.c}">${k + 1}</span>
    <div class="pinfo">
      <div class="pnm">${esc(s.n)}<span class="mono dim">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span>
        ${bad ? '<span class="tag bad">选科不符</span>' : ''}</div>
      <div class="psub">
        <span>${esc(g[G_.BATCH])}</span>
        <span>${g[G_.NMAJ]} 专业</span>
        <span>计划 ${g[G_.PLAN] || '—'}${enrollLabel(ec, true)}</span>
        <span>选科 ${esc(g[G_.REQ] || '不限')}</span>
      </div>
    </div>
    <div class="prank">${g[G_.R25] > 0
      ? (g[G_.S25] > 0 ? `<span class="n">${g[G_.S25]}</span><span class="u">分</span>` : '')
        + `<span class="r">位次 ${nf(g[G_.R25])}</span>`
      : '<span class="n" style="font-size:13px;color:var(--faint);font-weight:400">新组</span>'}</div>
    <button class="prm" data-rm="${i}" aria-label="移出"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
  </div>`;
}

/* 梯度刻度尺：把选中的组画在一条对数位次轴上 */
function planScale(sorted) {
  const withRank = sorted.filter(i => D.groups[i][G_.R25] > 0);
  if (!withRank.length) return '';
  const ranks = withRank.map(i => D.groups[i][G_.R25]);
  if (state.rank) ranks.push(state.rank);
  const lo = Math.log(Math.min.apply(null, ranks) * 0.85);
  const hi = Math.log(Math.max.apply(null, ranks) * 1.15);
  const pos = r => clamp((Math.log(r) - lo) / (hi - lo) * 100, 0, 100);
  const dots = withRank.map(i => {
    const g = D.groups[i];
    const t = TIER[tierOf(state.rank, g[G_.R25])];
    const k = sorted.indexOf(i);
    return `<i class="dot" style="left:${pos(g[G_.R25])}%;background:${t.c}" title="${esc(D.gSchool[i].n)} · 位次 ${nf(g[G_.R25])} · 第 ${k + 1} 志愿"></i>`;
  }).join('');
  const you = state.rank ? `<span class="you-line" style="left:${pos(state.rank)}%"><b>你</b><em>${nf(state.rank)}</em></span>` : '';
  return `<div class="sec"><div class="sec-h"><h2>梯度分布</h2><span class="line"></span>
      <span class="note">横轴为对数位次，越靠左越难考</span></div>
    <div class="pscale card">
      <div class="ps-track">${dots}${you}</div>
      <div class="ps-ax"><span>难 · 位次靠前</span><span>易 · 位次靠后</span></div>
    </div></div>`;
}

/* 配比诊断 */
function planDiagnosis(b, used, SLOTS) {
  const c = b.chong.length, w = b.wen.length, s = b.bao.length;
  const notes = [];

  /* 选科不符优先提示——这是硬伤，不是配比问题 */
  const mine = state.mySubjects.length === 2 ? state.mySubjects : null;
  if (mine) {
    const bad = state.basket.filter(i => !subjectOK(D.groups[i][G_.REQ], mine));
    if (bad.length) {
      const names = bad.slice(0, 4).map(i => D.gSchool[i].n).join('、');
      notes.push(['bad', `<b>${bad.length} 个组的选科要求与你的「${mine.join(' + ')}」不符</b>：${names}${bad.length > 4 ? ' 等' : ''}。这些组无法投档，请删掉或调整选科。`]);
    }
  }
  /* 地域过度集中 */
  const provs = new Map();
  state.basket.forEach(i => { const p = D.gSchool[i].prov; provs.set(p, (provs.get(p) || 0) + 1); });
  const top = Array.from(provs.entries()).sort((a, b2) => b2[1] - a[1])[0];
  if (used >= 12 && top && top[1] / used > 0.6) {
    notes.push(['info', `${top[1]} / ${used} 个志愿都在${top[0]}。如果愿意去外地，同样位次能选的学校会多不少。`]);
  }

  if (used < 8) notes.push(['info', '志愿还很少。本科批有 45 个位置，建议先收够 20–30 个再挑。']);
  if (c === 0 && used >= 6) notes.push(['warn', '没有「冲」的志愿，可能会浪费分数。可以考虑加 5–8 个组线比你高 5%–20% 的组。']);
  else if (c > w + s + 4) notes.push(['warn', `冲的偏多（${c} 个）。冲档命中率低，建议冲 : 稳 : 保 大致控制在 2 : 4 : 4。`]);
  if (s < 3 && used >= 8) notes.push(['warn', `「保」只有 ${s} 个，兜底不足。建议至少 8–12 个保底组，且覆盖不同省份或院校。`]);
  if (b.none.length) notes.push(['info', `有 ${b.none.length} 个暂无往年线的组，没有往年组线，位次无法预估，建议留足保底。`]);
  if (b.risk.length) notes.push(['warn', `有 ${b.risk.length} 个组的往年线高出你 30% 以上，录取希望较小。`]);
  if (b.far.length) notes.push(['info', `有 ${b.far.length} 个组的往年线远低于你，可能浪费志愿位。`]);

  const total = c + w + s;
  const hasBad = notes.some(n => n[0] === 'bad');
  if (!hasBad && total >= 10 && c > 0 && s >= 8 && c <= w + s) {
    notes.push(['ok', `梯度合理：冲 ${c} · 稳 ${w} · 保 ${s}，覆盖了不同难度。`]);
  }
  if (!notes.length) notes.push(['ok', '梯度看起来没问题。']);

  return `<div class="sec"><div class="sec-h"><h2>梯度检查</h2><span class="line"></span>
      <span class="note">${used} / ${SLOTS} 个志愿位</span></div>
    <div class="diags">${notes.map(([k, t]) => `<div class="diag ${k}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        ${k === 'ok' ? '<path d="m5 12.5 4.5 4.5L19 7"/>'
          : k === 'warn' ? '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5m0 3v.5"/>'
          : k === 'bad' ? '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'
          : '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8.5v.5"/>'}
      </svg><span>${t}</span></div>`).join('')}</div></div>`;
}

/* 拖拽排序：Pointer Events + FLIP */
function bindPlanDrag() {
  const list = $('#plan-list');
  if (!list) return;
  let dragEl = null, startY = 0, moved = false;

  const onDown = e => {
    const grip = e.target.closest('.grip');
    if (!grip) return;
    dragEl = grip.closest('.prow');
    if (!dragEl) return;
    e.preventDefault();
    moved = false;
    startY = e.clientY;
    dragEl.classList.add('dragging');
    dragEl.setPointerCapture(e.pointerId);
  };

  const onMove = e => {
    if (!dragEl) return;
    if (Math.abs(e.clientY - startY) > 3) moved = true;
    const rows = $$('.prow', list);
    const y = e.clientY;
    let target = null;
    for (const r of rows) {
      if (r === dragEl) continue;
      const b = r.getBoundingClientRect();
      if (y >= b.top && y <= b.bottom) { target = r; break; }
    }
    if (!target) {
      const first = rows[0], last = rows[rows.length - 1];
      if (first && y < first.getBoundingClientRect().top) target = first;
      else if (last && y > last.getBoundingClientRect().bottom) target = last;
    }
    if (!target || target === dragEl) return;
    const rect = list.getBoundingClientRect();
    if (target.compareDocumentPosition(dragEl) & Node.DOCUMENT_POSITION_FOLLOWING) list.insertBefore(dragEl, target);
    else list.insertBefore(dragEl, target.nextSibling);
    /* 实时重编号 */
    $$('.prow', list).forEach((r, k) => { const p = $('.pidx', r); if (p) p.textContent = k + 1; });
  };

  const onUp = e => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    const el = dragEl; dragEl = null;
    if (!moved) return;
    /* 把 DOM 顺序写回 state.basket */
    const order = $$('.prow', list).map(r => +r.dataset.pk);
    state.basket = order;
    saveBasket();
    renderBasket();
    renderPlanPage();
    toast('已更新志愿顺序');
  };

  list.addEventListener('pointerdown', onDown);
  list.addEventListener('pointermove', onMove);
  list.addEventListener('pointerup', onUp);
  list.addEventListener('pointercancel', onUp);
}

function exportPlan() {
  if (!state.basket.length) { toast('志愿表还是空的'); return; }
  const order = { chong: 0, wen: 1, bao: 2, risk: 3, far: 4, none: 5 };
  const sorted = state.basket.slice().sort((a, b) => {
    if (state.rank) {
      const ta = order[tierOf(state.rank, D.groups[a][G_.R25])], tb = order[tierOf(state.rank, D.groups[b][G_.R25])];
      if (ta !== tb) return ta - tb;
    }
    return big(D.groups[a][G_.R25]) - big(D.groups[b][G_.R25]);
  });
  const lines = [`落点 · 四川 2026 志愿草稿`, `科类：${TRACK_CN[state.track]}类` +
    (state.rank ? `　位次：${state.rank}` : '') + `　生成：${new Date().toLocaleString('zh-CN')}`, ''];
  sorted.forEach((i, k) => {
    const g = D.groups[i], s = D.gSchool[i];
    const t = state.rank && g[G_.R25] > 0 ? TIER[tierOf(state.rank, g[G_.R25])].n : '新';
    lines.push(`${String(k + 1).padStart(2, '0')}. [${t}] ${esc(s.n)}  ${g[G_.COMPOUND] || g[G_.CODE]}  ${g[G_.BATCH]}  ` +
      `组线 ${g[G_.R25] > 0 ? g[G_.R25] : '—'}  计划 ${g[G_.PLAN] || '—'}  专业 ${g[G_.NMAJ]} 个`);
    lines.push(`     ${D.offByGroup[i].slice(0, 8).map(oi => D.meta.dicts.major[D.offerings[oi][O_.MAJOR]]).join('、')}${D.offByGroup[i].length > 8 ? ' 等' : ''}`);
  });
  lines.push('', '本表为往年录取位置对照，不构成录取概率预测。正式填报请以当年招生章程与省考试院计划为准。');
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `落点志愿草稿_${TRACK_CN[state.track]}类_${state.rank || '未定位'}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出志愿草稿');
}

/* ==========================================================================
   14. 院校页
   ========================================================================== */
const STAGS = ['985', '211', '双一流', '国重点', '保研资格', '省重点', '双高计划', '部委直属'];
let lastSchools = [];
function renderSchoolChips() {
  $('#stagchips').innerHTML = [`<button class="chip" data-stag="" aria-pressed="${!state.sTag}"><span>全部</span></button>`]
    .concat(STAGS.map(t => {
      const n = D.schools.filter(s => (s.tag || []).indexOf(t) >= 0).length;
      return `<button class="chip" data-stag="${t}" aria-pressed="${state.sTag === t}"><span>${t}</span><span class="n">${n}</span></button>`;
    })).join('');
}
function runSchools() {
  const q = state.sq ? state.sq.trim().toLowerCase().split(/\s+/).filter(Boolean) : null;
  const out = [];
  for (let i = 0; i < D.schools.length; i++) {
    const s = D.schools[i];
    if (!D.schoolGroups.has(i)) continue;
    if (state.sTag && (s.tag || []).indexOf(state.sTag) < 0) continue;
    if (q) {
      const hay = (s.n + ' ' + s.city + ' ' + s.prov + ' ' + s.aff + ' ' + s.typ + ' ' + s.code + ' ' + (s.tag || []).join(' ')).toLowerCase();
      let ok = true;
      for (const w of q) if (hay.indexOf(w) < 0) { ok = false; break; }
      if (!ok) continue;
    }
    out.push(i);
  }
  const gs = D.schoolGroups;
  switch (state.sSort) {
    case 'groups': out.sort((a, b) => gs.get(b).length - gs.get(a).length); break;
    case 'rank': out.sort((a, b) => (D.schools[a].rk || 99999) - (D.schools[b].rk || 99999)); break;
    case 'name': out.sort((a, b) => D.schools[a].n.localeCompare(D.schools[b].n, 'zh')); break;
  }
  return out;
}
/* 有筛选（标签 / 搜索）时给全量，否则按 pagePlan 分页。
   原来一律每页 30 条：点 985 只看得到 30 所，默认排序又是「可填组数」降序，
   天津大学只有 5 个组、排第 41 位 —— 首屏没有，第二页又因为缺 motion.reveal
   而不可见，学生会直接认定「985 名单漏了天津大学」。 */
function renderSchools(reset) {
  if (reset) { lastSchools = runSchools(); state.sPage = 1; state.sShowAll = false; }
  const g = $('#sgrid');
  $('#s-cnt').textContent = nf(lastSchools.length);
  $('#s-meta').textContent = `${nf(D.schools.length)} 所院校中，${nf(lastSchools.length)} 所有 ${TRACK_CN[state.track]}类招生`;
  $('#rail-schools').textContent = lastSchools.length > 999 ? (lastSchools.length / 1000).toFixed(1) + 'k' : lastSchools.length;
  if (!lastSchools.length) {
    g.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>没有找到院校</h3><p>换个关键词试试</p></div>`;
    $('#smore').innerHTML = ''; return;
  }
  const plan = pagePlan(lastSchools.length, state.sPage, SPAGE, state.sShowAll);
  const slice = lastSchools.slice(plan.from, plan.shown);
  const html = slice.map((si, k) => {
    const s = D.schools[si], gs = D.schoolGroups.get(si);
    const plan = gs.reduce((a, i) => a + (D.groups[i][G_.PLAN] || 0), 0);
    const tags = (s.tag || []).slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('');
    /* 当前科类的调档线分数区间 */
    const rl = D.schoolLine.get(si);
    const b = rl ? rl[state.track] : null;
    const other = rl ? rl[1 - state.track] : null;
    let lineHTML;
    if (b && b.n > 0) {
      const same = b.lo === b.hi;
      lineHTML = `<div class="sf-k">${TRACK_CN[state.track]}类调档线</div>
        <div class="sf-v">${same ? b.lo : b.lo + ' – ' + b.hi}<span class="u">分</span></div>`;
    } else if (other && other.n > 0) {
      lineHTML = `<div class="sf-k">${TRACK_CN[state.track]}类调档线</div>
        <div class="sf-v none">本类暂无往年数据</div>`;
    } else {
      lineHTML = `<div class="sf-k">${TRACK_CN[state.track]}类调档线</div>
        <div class="sf-v none">今年新设，无往年数据</div>`;
    }

    return `<button class="scard" data-school="${si}" style="--i:${Math.min(k, 13)}">
      <div class="top"><div class="mono-badge">${esc(s.n.slice(0, 1))}</div>
        <div style="min-width:0"><div class="nm">${esc(s.n)}</div>
        <div class="loc">${esc(s.prov)}${s.city && s.city !== s.prov ? ' · ' + esc(s.city) : ''}${s.tier ? ' · ' + esc(s.tier) : ''}</div></div></div>
      ${tags ? `<div class="tg">${tags}</div>` : ''}
      <div class="ds">${esc(s.desc || '暂无简介')}</div>
      <div class="ft">
        <div class="sf-line">${lineHTML}
          <div class="sf-n">${TRACK_CN[state.track]}类 ${gs.length} 个可填组 · 计划 ${nf(plan)}</div></div>
        <i class="go"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13m-5-6 6 6-6 6"/></svg></i>
      </div>
    </button>`;
  }).join('');
  paintList(g, html, reset || plan.all);
  $('#smore').innerHTML = moreBtn('more-schools', plan.canAll ? 'all-schools' : '',
    plan.rest, SPAGE, lastSchools.length);
}

/* ==========================================================================
   14b. 先选专业，再看学校
   ========================================================================== */
const MP = { cat: null, q: '', page: 1, list: [], major: null, tier: null, sort: 'close', showAll: false };
const MP_PAGE = 30;
const MP_SHOW = 36;

function majorList() {
  const q = MP.q.trim().toLowerCase();
  const out = [];
  D.majorMeta.forEach((m, mi) => {
    if (MP.cat && m.cat !== MP.cat) return;
    if (q) {
      const name = (D.meta.dicts.major[mi] || '').toLowerCase();
      if (name.indexOf(q) < 0 && (m.catc || '').toLowerCase().indexOf(q) < 0) return;
    }
    out.push(mi);
  });
  if (q) {
    out.sort((a, b) => {
      const na = (D.meta.dicts.major[a] || '').toLowerCase();
      const nb = (D.meta.dicts.major[b] || '').toLowerCase();
      const pa = na.indexOf(q) === 0 ? 0 : 1, pb = nb.indexOf(q) === 0 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return D.majorMeta.get(b).schools - D.majorMeta.get(a).schools;
    });
  } else {
    out.sort((a, b) => D.majorMeta.get(b).schools - D.majorMeta.get(a).schools);
  }
  return out;
}

function renderMajorPicker() {
  const cats = new Map();
  D.majorMeta.forEach(m => { if (m.cat) cats.set(m.cat, (cats.get(m.cat) || 0) + 1); });
  const catArr = Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  $('#mp-cats').innerHTML =
    `<button class="chip" data-mcat="" aria-pressed="${!MP.cat}"><span>全部门类</span></button>` +
    catArr.map(([c, n]) => `<button class="chip" data-mcat="${esc(c)}" aria-pressed="${MP.cat === c}">
      <span>${esc(c)}</span><span class="n">${n}</span></button>`).join('');

  const list = majorList();
  const shown = MP.showAll ? list : list.slice(0, MP_SHOW);
  const box = $('#mp-list');
  if (!list.length) {
    box.innerHTML = `<div class="mp-empty" style="grid-column:1/-1">没有匹配的专业名<br>换个关键词试试，比如「计算机」「医学」「会计」</div>`;
    $('#mp-foot').innerHTML = '';
    return;
  }
  box.innerHTML = shown.map((mi, k) => {
    const m = D.majorMeta.get(mi);
    return `<button class="mcard" data-major="${mi}" style="animation-delay:${Math.min(k, 14) * 22}ms">
      <span class="mn">${esc(D.meta.dicts.major[mi])}</span>
      <span class="mc">${esc(m.cat)}${m.catc && m.catc !== m.cat ? ' · ' + esc(m.catc) : ''}</span>
      <span class="ms"><b>${m.schools}</b>所学校在川招生</span>
    </button>`;
  }).join('');
  $('#mp-foot').innerHTML = list.length > MP_SHOW && !MP.showAll
    ? `<button class="btn ghost sm" id="mp-more">还有 ${nf(list.length - MP_SHOW)} 个专业，全部展开</button>`
    : `<span>共 ${nf(list.length)} 个专业名</span>`;
}

function pickMajor(mi) {
  MP.major = mi; MP.tier = null; MP.page = 1;
  $('#majpick').hidden = true;
  $('#majresult').hidden = false;
  revealBlock($('#majresult'));
  syncMajorTierSeg();
  runMajorQuery();
  setTimeout(() => motion.scrollTo($('#majresult').getBoundingClientRect().top + window.scrollY - 90), 60);
}
function backToPicker() {
  MP.major = null;
  $('#majresult').hidden = true;
  $('#majpick').hidden = false;
  revealBlock($('#majpick'));
  motion.scrollTo($('#majpick').getBoundingClientRect().top + window.scrollY - 90);
}
function syncMajorTierSeg() {
  $$('[data-mtier]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.mtier || null) === MP.tier ? 'true' : 'false'));
  moveGlider('#mtierseg', '#mtierglider');
}

function runMajorQuery() {
  const mi = MP.major;
  if (mi === null) return;
  const all = D.byMajor.get(mi) || [];
  const rows = [];
  for (let k = 0; k < all.length; k++) {
    const o = D.offerings[all[k]];
    const gi = o[O_.GROUP];
    const g = D.groups[gi];
    if (!g || g[G_.TRACK] !== state.track) continue;
    if (!groupPass(gi)) continue;          /* 复用选组页的筛选条件 */
    const t = g[G_.R25] > 0 ? tierOf(state.rank, g[G_.R25]) : 'none';
    if (MP.tier && t !== MP.tier) continue;
    rows.push(all[k]);
  }
  const you = state.rank || 0;
  const near = oi => {
    const r = D.offerings[oi][O_.R25];
    return r > 0 ? Math.abs(Math.log(you / r)) : 9;
  };
  switch (MP.sort) {
    case 'close': rows.sort((a, b) => near(a) - near(b)); break;
    case 'scoreDesc': rows.sort((a, b) => (D.offerings[b][O_.S25] || -1) - (D.offerings[a][O_.S25] || -1)); break;
    case 'scoreAsc': rows.sort((a, b) => {
      const x = D.offerings[a][O_.S25], y = D.offerings[b][O_.S25];
      return (x > 0 ? x : 9999) - (y > 0 ? y : 9999);
    }); break;
    case 'srank': rows.sort((a, b) =>
      (D.gSchool[D.offerings[a][O_.GROUP]].rk || 99999) - (D.gSchool[D.offerings[b][O_.GROUP]].rk || 99999)); break;
    case 'plan': rows.sort((a, b) => (D.offerings[b][O_.PLAN] || 0) - (D.offerings[a][O_.PLAN] || 0)); break;
  }
  MP.list = rows;

  const m = D.majorMeta.get(mi) || { cat: '', catc: '' };
  const buckets = { chong: 0, wen: 0, bao: 0, risk: 0, far: 0, none: 0 };
  const schools = new Set();
  rows.forEach(oi => {
    const o = D.offerings[oi], g = D.groups[o[O_.GROUP]];
    schools.add(g[G_.SCHOOL]);
    const t = g[G_.R25] > 0 ? tierOf(state.rank, g[G_.R25]) : 'none';
    if (buckets[t] !== undefined) buckets[t]++; else buckets.other++;
  });
  $('#majhead').innerHTML = `<div class="mh-l">
      <div class="mh-k">${esc(m.cat)}${m.catc && m.catc !== m.cat ? ' · ' + esc(m.catc) : ''}</div>
      <div class="mh-n">${esc(D.meta.dicts.major[mi])}</div>
      <div class="mh-s">${nf(schools.size)} 所学校在川招收这个专业 · 共 ${nf(rows.length)} 条招生记录</div>
    </div>
    <div class="mh-r">
      ${['chong', 'wen', 'bao'].map(k => `<div class="mh-t" style="--tc:${TIER[k].c}">
        <span class="d"></span><span class="n">${TIER[k].n}</span><b>${nf(buckets[k])}</b></div>`).join('')}
      ${buckets.risk ? `<div class="mh-t" style="--tc:var(--risk)"><span class="d"></span><span class="n">险</span><b>${nf(buckets.risk)}</b></div>` : ''}
      ${buckets.far ? `<div class="mh-t" style="--tc:var(--risk)"><span class="d"></span><span class="n">远</span><b>${nf(buckets.far)}</b></div>` : ''}
      ${buckets.none ? `<div class="mh-t" style="--tc:var(--faint)"><span class="d"></span><span class="n">新组</span><b>${nf(buckets.none)}</b></div>` : ''}
    </div>
    ${(buckets.chong + buckets.wen + buckets.bao) === 0 && rows.length > 0
      ? `<div class="mh-note">这个专业的招生组<b>普遍低于你的位次</b>（${nf(buckets.far + buckets.risk)} 个属于「远」或「险」），
          对你来说基本是保底选择。想找更有挑战的，可以换个难度更高的专业，或看看下面「新组」。</div>` : ''}`;

  const cnt = $('#m-cnt');
  if (!motion.ready) { cnt.dataset.v = rows.length; cnt.textContent = nf(rows.length); }
  else motion.count(cnt, rows.length);
  const withS = rows.filter(oi => D.offerings[oi][O_.S25] > 0).length;
  $('#m-meta').textContent = `其中 ${nf(withS)} 条有 2025 年分数`;

  MP.page = 1;
  renderMajorRows(true);
  $('#rail-major').textContent = nf(D.majorMeta.size);
}

function renderMajorRows(reset) {
  const box = $('#maj-list');
  if (reset) { box.innerHTML = ''; MP.page = 1; MP.showAllRows = false; }
  const total = MP.list.length;
  if (!total) {
    box.innerHTML = `<div class="empty"><h3>没有符合条件的学校</h3>
      <p>可能是当前科类或筛选条件太窄。<br>试试切到「${TRACK_CN[1 - state.track]}类」，或放宽左侧筛选。</p></div>`;
    $('#maj-more').innerHTML = '';
    return;
  }
  const plan = pagePlan(total, MP.page, MP_PAGE, MP.showAllRows);
  const slice = MP.list.slice(plan.from, plan.shown);
  box.insertAdjacentHTML('beforeend', slice.map(oi => {
    const o = D.offerings[oi], g = D.groups[o[O_.GROUP]], s = D.gSchool[o[O_.GROUP]];
    const t = g[G_.R25] > 0 ? TIER[tierOf(state.rank, g[G_.R25])] : null;
    const inB = state.basket.indexOf(o[O_.GROUP]) >= 0;
    const tags = [];
    ['985', '211', '双一流'].forEach(x => { if (D.gTag[o[O_.GROUP]].indexOf(x) >= 0) tags.push(`<span class="tag hot">${x}</span>`); });
    if (D.gTag[o[O_.GROUP]].indexOf('国重点') >= 0) tags.push('<span class="tag">国重点</span>');
    if (o[O_.NEW]) tags.push('<span class="tag bad">新增</span>');
    /* 选科是否符合 —— 和选组卡片同一套判断，不给学生两套口径 */
    const mine = state.mySubjects.length === 2 ? state.mySubjects : null;
    const subjBad = mine ? !subjectOK(g[G_.REQ], mine) : false;
    if (subjBad) tags.push('<span class="tag bad">选科不符</span>');
    const ac = academicChips(o);
    return `<div class="mjrow${subjBad ? ' mismatch' : ''}" data-mjg="${o[O_.GROUP]}"
        style="--tc:${t ? t.c : 'transparent'}">
      <div class="row1">
        <div class="who">
          <div class="sname">${esc(s.n)}${t ? `<span class="tag" style="background:${t.c};color:#fff">${t.n}</span>` : ''}${tags.join('')}
            <span class="gcode">${esc(g[G_.COMPOUND] || g[G_.CODE])}</span></div>
          <div class="cmeta">
            <span class="m">${esc(s.prov)}${s.city && s.city !== s.prov ? ' · ' + esc(s.city) : ''}</span>
            <span class="m">${esc(g[G_.BATCH])}</span>
            ${g[G_.ATYPE] !== '普通类' ? `<span class="m">${esc(g[G_.ATYPE])}</span>` : ''}
            <span class="m">组内 <b>${g[G_.NMAJ]}</b> 个专业</span>
            <span class="m">本专业计划 <b>${o[O_.PLAN] > 0 ? o[O_.PLAN] + ' 人' : '—'}</b></span>
            <span class="m">学费 <b>${feeText(D.meta.dicts.tfee[o[O_.TFEE]])}</b></span>
            <span class="m">选科 <b class="${subjBad ? 'bad' : ''}">${esc(g[G_.REQ] || '不限')}</b></span>
          </div>
        </div>
        ${scoreCell(o[O_.S25], o[O_.R25], '今年新增')}
      </div>
      ${ac ? `<div class="mac">${ac}</div>` : ''}
      <button class="add ${inB ? 'on' : ''}" data-add="${o[O_.GROUP]}" aria-label="${inB ? '移出志愿表' : '加入志愿表'}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          ${inB ? '<path d="m5 12.5 4.5 4.5L19 7"/>' : '<path d="M12 5v14M5 12h14"/>'}</svg>
      </button>
    </div>`;
  }).join(''));
  motion.reveal(box, '.mjrow');
  $('#maj-more').innerHTML = moreBtn('more-major', plan.canAll ? 'all-major' : '',
    plan.rest, MP_PAGE, total);
}

/* ==========================================================================
   15. 页面切换
   ========================================================================== */
const PAGES = ['find', 'groups', 'major', 'schools', 'plan'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  || new URLSearchParams(location.search).get('noanim') === '1';
const CAN_VT = typeof document.startViewTransition === 'function' && !REDUCED;

function goto(p, silent) {
  if (PAGES.indexOf(p) < 0) p = 'groups';
  if (p === state.page && !silent) { motion.scrollTo(0); return; }

  const swap = () => {
    state.page = p;
    $$('.page').forEach(el => el.classList.toggle('on', el.id === 'p-' + p));
    $$('.navitem').forEach(b => {
      if (b.dataset.page === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    staggerPage($('#p-' + p));
  };

  /* 原生 View Transitions：整屏交叉淡入，比手写 class 切换顺得多 */
  if (CAN_VT && !silent) document.startViewTransition(swap);
  else swap();

  if (!silent) { try { history.replaceState(history.state, '', '#' + p); } catch (e) { } }
  window.scrollTo(0, 0);
  if (p === 'groups' && !lastList.length) applyQuery(true);
  if (p === 'major' && !$('#mp-list').children.length) renderMajorPicker();
  if (p === 'schools' && !lastSchools.length) renderSchools(true);
  if (p === 'plan') renderPlanPage();
}

/* 页面内的分区依次入场 */
function staggerPage(el) {
  if (!el || REDUCED) return;
  /* 必须跳过 hidden 的子块：元素在 display:none 时动画不会播放，
     而 fill-mode 会把 from 状态（opacity:0）冻结住，之后再显示就是全透明。
     动态显示的块要用 revealBlock() 重新触发。 */
  const kids = Array.prototype.slice.call(el.children).filter(k => !k.hidden);
  kids.forEach(k => { k.classList.remove('sec-in'); k.style.animationDelay = ''; });
  void el.offsetWidth;
  kids.forEach((k, i) => {
    k.classList.add('sec-in');
    k.style.animationDelay = Math.min(i, 7) * 62 + 'ms';
  });
}
function revealBlock(el) {
  if (!el) return;
  el.classList.remove('sec-in');
  if (REDUCED) return;
  void el.offsetWidth;
  el.style.animationDelay = '0ms';
  el.classList.add('sec-in');
}

/* ==========================================================================
   16. 事件
   ========================================================================== */
function bind() {
  /* --- 全局点击 --- */
  document.addEventListener('click', e => {
    const el = e.target;

    /* 导航 */
    const nav = el.closest('[data-page]');
    if (nav) { goto(nav.dataset.page); return; }
    const gt = el.closest('[data-goto]');
    if (gt) {
      if (gt.dataset.preset === 'reach') { state.tierFilter = 'chong'; syncViewSeg(); }
      goto(gt.dataset.goto); if (lastList.length) applyQuery(true);
      return;
    }

    /* 科类 */
    const tr = el.closest('[data-track]');
    if (tr) {
      const t = +tr.dataset.track;
      if (t !== state.track) {
        state.track = t;
        $$('[data-track]').forEach(b => b.setAttribute('aria-pressed', b.dataset.track === String(t) ? 'true' : 'false'));
        moveGlider('#trackseg', '#trackglider');
        state.filters = {}; state.tierFilter = null;
        recalc(); refreshFacets(); renderFilters(); applyQuery(true); renderSchools(true);
        if (MP.major !== null) runMajorQuery();
        toast('已切换到' + TRACK_CN[t] + '类');
      }
      return;
    }

    /* 分档卡 */
    const tc = el.closest('[data-tier]');
    if (tc) {
      const k = tc.dataset.tier;
      state.tierFilter = state.tierFilter === k ? null : k;
      $$('[data-tier]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tier === state.tierFilter ? 'true' : 'false'));
      if (state.tierFilter) { state.view = 'all'; syncViewSeg(); goto('groups'); }
      applyQuery(true);
      return;
    }

    /* 视图切换 */
    const vs = el.closest('[data-view]');
    if (vs) {
      state.view = vs.dataset.view;
      state.tierFilter = null;
      $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view ? 'true' : 'false'));
      moveGlider('#viewseg', '#viewglider');
      applyQuery(true);
      return;
    }

    /* 筛选芯片 */
    const fc = el.closest('[data-f]');
    if (fc) {
      const k = fc.dataset.f, v = fc.dataset.v;
      const set = state.filters[k] || (state.filters[k] = new Set());
      if (set.has(v)) set.delete(v); else set.add(v);
      if (k === 'cat') { state.filters.catc = new Set(); }
      renderFilters(); applyQuery(true);
      return;
    }
    const sw = el.closest('[data-sw]');
    if (sw) {
      const k = sw.dataset.sw;
      if (k === 'onlyMatchSubject' && state.mySubjects.length < 2) {
        toast('请先在「定位」页选择 2 门再选科目'); goto('find'); return;
      }
      state[k] = !state[k];
      if (k === 'onlyMatchSubject') { saveSubjects(); syncSubjectUI(); }
      renderFilters(); renderSelbar(); applyQuery(true);
      return;
    }
    const pf = el.closest('[data-preset-fee]');
    if (pf) {
      const [a, b] = pf.dataset.presetFee.split(',').map(Number);
      state.fee = eqArr(state.fee, [a, b]) ? null : [a, b];
      renderFilters(); applyQuery(true); return;
    }
    const pp = el.closest('[data-preset-plan]');
    if (pp) {
      const [a, b] = pp.dataset.presetPlan.split(',').map(Number);
      state.plan = eqArr(state.plan, [a, b]) ? null : [a, b];
      renderFilters(); applyQuery(true); return;
    }
    const cl = el.closest('[data-clear]');
    if (cl) { cl.dataset.clear.split(',').forEach(k => state.filters[k] = new Set()); renderFilters(); applyQuery(true); return; }
    const ca = el.closest('[data-clear-adv]');
    if (ca) { state.fee = null; state.plan = null; state.onlyLine = state.onlyNewGroup = state.onlyNewMajor = false; renderFilters(); applyQuery(true); return; }
    const mr = el.closest('[data-more]');
    if (mr) { const k = mr.dataset.more; state.showAllChips[k] = !state.showAllChips[k]; renderFilters(); return; }

    /* 取消已选 */
    const un = el.closest('[data-un]');
    if (un) {
      const [k, v] = un.dataset.un.split('|');
      if (k === 'all') { state.filters = {}; state.fee = null; state.plan = null; state.onlyLine = state.onlyNewGroup = state.onlyNewMajor = false; state.onlyMatchSubject = false; saveSubjects(); syncSubjectUI(); }
      if (k === 'fee') state.fee = null;
      else if (k === 'plan') state.plan = null;
      else if (k === 'onlyMatchSubject') { state.onlyMatchSubject = false; saveSubjects(); syncSubjectUI(); }
      else if (['onlyLine', 'onlyNewGroup', 'onlyNewMajor'].indexOf(k) >= 0) state[k] = false;
      else if (state.filters[k]) state.filters[k].delete(v);
      renderFilters(); applyQuery(true);
      return;
    }

    /* 志愿表 */
    const ad = el.closest('[data-add]');
    if (ad) { e.stopPropagation(); toggleBasket(+ad.dataset.add); return; }
    const rm = el.closest('[data-rm]');
    if (rm) { toggleBasket(+rm.dataset.rm); return; }

    /* 分组卡片 → 详情 */
    const gc = el.closest('[data-g]');
    if (gc) { openGroup(+gc.dataset.g); return; }
    const sc = el.closest('[data-school]');
    if (sc) { openSchool(+sc.dataset.school); return; }
    const og = el.closest('[data-open-group]');
    if (og) { openGroup(+og.dataset.openGroup); return; }
    const om = el.closest('[data-open-major]');
    if (om) { openMajor(+om.dataset.openMajor); return; }

    /* 展开某一档 */
    const mt = el.closest('[data-more-tier]');
    if (mt) { expandTier(mt.dataset.moreTier); return; }
    if (el.closest('[data-more-groups]')) { state.groupPage++; renderGroups(false); return; }
    if (el.closest('[data-all-groups]')) { state.gShowAll = true; renderGroups(false); return; }
    if (el.closest('[data-more-schools]')) { state.sPage++; renderSchools(false); return; }
    if (el.closest('[data-all-schools]')) { state.sShowAll = true; renderSchools(false); return; }

    /* 关于落点（彩蛋） */
    if (el.closest('[data-about]')) { openAbout(); return; }
    if (el.closest('[data-copy-qq]')) { copyQQ(e); return; }
    /* 关于与设置里的偏好项 */
    const prefEl = el.closest('[data-pref]');
    if (prefEl) {
      const w = prefEl.dataset.pref;
      if (w === 'clear') clearLocal();
      else if (w === 'motion') setMotion(prefEl.dataset.val);
      else if (w === 'track') setPrefTrack(+prefEl.dataset.val);
      return;
    }

    /* 院校标签 */
    const st = el.closest('[data-stag]');
    if (st) { const v = st.dataset.stag || null; state.sTag = (state.sTag === v) ? null : v; renderSchoolChips(); renderSchools(true); return; }

    /* 释义里「看去这 N 所院校」：设好筛选、跳到院校页、关掉抽屉 */
    const lgj = el.closest('[data-lgjump]');
    if (lgj) {
      state.sTag = lgj.dataset.lgjump;
      if (state.page !== 'schools') goto('schools');
      renderSchoolChips(); renderSchools(true);
      /* 这里是「关抽屉顺带跳页」，不是单纯退出：调 history.back() 会和
         goto() 的 replaceState 抢同一个历史条目，导致地址栏和界面对不上。 */
      closeDrawers(true);
      return;
    }
    /* 标签说明入口：院校页芯片行末尾的按钮 + 筛选面板「院校层次」旁的问号 */
    if (el.closest('#stag-help') || el.closest('[data-tags-help]')) {
      openTagLegend(state.sTag);
      return;
    }

    /* 抽屉关闭 */
    if (el.closest('#d-back')) { drawerBack(); return; }
    if (el.closest('#d-x') || el.closest('#bk-x') || el === $('#scrim')) { closeDrawers(); return; }
    if (el.closest('#basket-btn')) { renderBasket(); openDrawer('#basket'); return; }
    if (el.closest('#plan-export')) { exportPlan(); return; }
    if (el.closest('#plan-clear')) { state.basket = []; saveBasket(); renderBasket(); toast('已清空志愿表'); return; }
    if (el.closest('#f-toggle')) {
      const p = $('#fpanel'), b = $('#f-toggle');
      const open = p.hidden;
      p.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = 'fade-up .4s cubic-bezier(.16,1,.3,1) both'; }
      return;
    }
    if (el.closest('#btn-reset')) { resetAll(); return; }

    /* ---- 先选专业 ---- */
    const mcat = el.closest('[data-mcat]');
    if (mcat) { MP.cat = mcat.dataset.mcat || null; MP.showAll = false; renderMajorPicker(); return; }
    const mcard = el.closest('[data-major]');
    if (mcard) { pickMajor(+mcard.dataset.major); return; }
    const mtier = el.closest('[data-mtier]');
    if (mtier) {
      MP.tier = mtier.dataset.mtier || null;
      syncMajorTierSeg();
      runMajorQuery();
      return;
    }
    if (el.closest('#m-back')) { backToPicker(); return; }
    if (el.closest('#mp-more')) { MP.showAll = true; renderMajorPicker(); return; }
    if (el.closest('[data-more-major]')) { MP.page++; renderMajorRows(false); return; }
    if (el.closest('[data-all-major]')) { MP.showAllRows = true; renderMajorRows(false); return; }
    const mjrow = el.closest('[data-mjg]');
    if (mjrow && !el.closest('[data-add]')) { openGroup(+mjrow.dataset.mjg); return; }

    /* 再选科目 */
    const sj = el.closest('[data-subj]');
    if (sj) { toggleSubject(sj.dataset.subj); return; }

    /* 演示模式 */
    if (el.closest('#stage-toggle')) { Stage.toggle(); return; }
  });

  /* 选科开关 */
  $('#sw-subj').addEventListener('change', e => {
    state.onlyMatchSubject = e.target.checked;
    saveSubjects(); renderFilters(); renderSelbar(); applyQuery(true);
  });

  /* --- 搜索 --- */
  const q = $('#q');
  q.addEventListener('input', debounce(() => {
    state.q = q.value;
    $('#q-x').classList.toggle('on', !!q.value);
    if (state.page === 'schools') { state.sq = q.value; renderSchools(true); }
    else { if (state.page !== 'groups') goto('groups'); applyQuery(true); }
  }, 200));
  $('#q-x').addEventListener('click', () => {
    q.value = ''; state.q = ''; state.sq = ''; $('#q-x').classList.remove('on');
    if (state.page === 'schools') renderSchools(true); else applyQuery(true);
    q.focus();
  });

  /* --- 排序 --- */
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; applyQuery(true); });
  $('#ssort').addEventListener('change', e => { state.sSort = e.target.value; renderSchools(true); });

  /* --- 先选专业：搜索与排序 --- */
  const mpq = $('#mp-q');
  if (mpq) mpq.addEventListener('input', debounce(() => {
    MP.q = mpq.value; MP.showAll = false;
    $('#mp-x').classList.toggle('on', !!mpq.value);
    renderMajorPicker();
  }, 190));
  const mpx = $('#mp-x');
  if (mpx) mpx.addEventListener('click', () => {
    mpq.value = ''; MP.q = ''; MP.showAll = false;
    $('#mp-x').classList.remove('on'); renderMajorPicker(); mpq.focus();
  });
  const msort = $('#m-sort');
  if (msort) msort.addEventListener('change', e => { MP.sort = e.target.value; runMajorQuery(); });

  /* --- 刻度尺：指针拖动 --- */
  const track = $('#track');
  let dragging = false;
  const valueFromEvent = ev => {
    const d = curDist(); if (!d) return null;
    const r = track.getBoundingClientRect();
    const p = clamp((ev.clientX - r.left) / r.width, 0, 1);
    if (state.mode === 'score') return Math.round(d.min + (d.max - d.min) * p);
    return Math.round(1 + (d.total - 1) * p);
  };
  const applyFromEvent = ev => {
    const v = valueFromEvent(ev);
    if (v === null) return;
    if (state.mode === 'score') state.score = v; else state.rank = v;
    recalc();
  };
  track.addEventListener('pointerdown', ev => {
    dragging = true; track.classList.add('drag');
    track.setPointerCapture(ev.pointerId);
    applyFromEvent(ev);
  });
  track.addEventListener('pointermove', ev => { if (dragging) applyFromEvent(ev); });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; track.classList.remove('drag');
    if (state.page !== 'groups') return;
    applyQuery(true);
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('keydown', ev => {
    const d = curDist(); if (!d) return;
    const step = ev.shiftKey ? 10 : 1;
    let v = state.mode === 'score' ? state.score : state.rank;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') v += step;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') v -= step;
    else if (ev.key === 'Home') v = state.mode === 'score' ? d.min : 1;
    else if (ev.key === 'End') v = state.mode === 'score' ? d.max : d.total;
    else return;
    ev.preventDefault();
    if (state.mode === 'score') state.score = v; else state.rank = v;
    recalc();
  });

  /* --- 模式切换 --- */
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (!m) return;
    state.mode = m.dataset.mode;
    $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode ? 'true' : 'false'));
    recalc();
  });

  /* --- 键盘 / 滚轮 --- */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); q.focus();
    }
    if (e.key === 'Escape') closeDrawers();
  });

  /* --- 滚动进度 & 回到顶部按钮 --- */
  let tick = false;
  window.addEventListener('scroll', () => {
    if (tick) return; tick = true;
    rAF(() => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      $('#prog').style.transform = `scaleX(${h > 0 ? clamp(window.scrollY / h, 0, 1) : 0})`;
      tick = false;
    });
  }, { passive: true });

  /* --- 无限滚动 --- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(en => {
      if (!en[0].isIntersecting) return;
      if (state.page === 'groups' && state.view !== 'tier' && lastList.length > state.groupPage * PAGE) {
        state.groupPage++; renderGroups(false);
      } else if (state.page === 'schools' && lastSchools.length > state.sPage * SPAGE) {
        state.sPage++; renderSchools(false);
      }
    }, { rootMargin: '500px' });
    io.observe($('#gmore'));
    io.observe($('#smore'));
  }
}

function moveGlider(segSel, gliderSel) {
  const seg = $(segSel), gl = $(gliderSel);
  const on = seg.querySelector('button[aria-pressed="true"]');
  if (!on || !gl) return;
  gl.style.width = on.offsetWidth + 'px';
  gl.style.transform = `translateX(${on.offsetLeft - 2}px)`;
}
function syncViewSeg() {
  $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view ? 'true' : 'false'));
  moveGlider('#viewseg', '#viewglider');
}

function resetAll() {
  state.filters = {}; state.fee = null; state.plan = null;
  state.onlyLine = state.onlyNewGroup = state.onlyNewMajor = false;
  state.tierFilter = null; state.view = 'all'; state.q = '';
  state.score = 600; state.mode = 'score';
  $('#q').value = ''; $('#q-x').classList.remove('on');
  $$('[data-tier]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === 'score' ? 'true' : 'false'));
  syncViewSeg();
  recalc(); refreshFacets(); renderFilters(); applyQuery(true);
  toast('已重置');
}

/* ==========================================================================
   16b. 滑动手势：左滑加入 / 右滑跳过
   只在触摸或粗指针设备上启用；鼠标设备用右上角的 + 和卡片点击即可。
   ========================================================================== */
const Gestures = {
  st: null,
  init() {
    const list = document.getElementById('glist');
    if (!list) return;
    list.addEventListener('pointerdown', e => this.down(e), { passive: true });
    list.addEventListener('pointermove', e => this.move(e), { passive: false });
    list.addEventListener('pointerup', e => this.up(e));
    list.addEventListener('pointercancel', e => this.up(e));
  },
  down(e) {
    /* 点在 + 按钮或志愿表按钮上时不参与滑动 */
    if (e.target.closest('[data-add]')) return;
    const card = e.target.closest('.gcard');
    const wrap = e.target.closest('.swipe-wrap');
    if (!card || !wrap) return;
    this.st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, axis: null,
      card, wrap, idx: +card.dataset.g, moved: false };
  },
  move(e) {
    const s = this.st;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.axis) {
      if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      if (s.axis === 'x') {
        try { s.card.setPointerCapture(e.pointerId); } catch (err) { }
      }
    }
    if (s.axis !== 'x') return;
    e.preventDefault();
    s.moved = true;
    /* 阻尼：越拉越沉 */
    const lim = 150;
    s.dx = Math.sign(dx) * Math.min(Math.abs(dx), lim + (Math.abs(dx) - lim) * .28);
    s.card.style.transition = 'none';
    s.card.style.transform = `translateX(${s.dx}px)`;
    const armed = Math.abs(s.dx) > 62;
    s.wrap.classList.toggle('arm-add', armed && s.dx > 0);
    s.wrap.classList.toggle('arm-skip', armed && s.dx < 0);
  },
  up(e) {
    const s = this.st;
    if (!s || (e.pointerId !== undefined && e.pointerId !== s.id)) return;
    this.st = null;
    if (!s.moved) return;                       /* 没滑动 → 交给 click 打开详情 */
    const armed = Math.abs(s.dx) > 62;
    s.card.style.transition = 'transform .34s cubic-bezier(.22,1,.36,1)';
    s.wrap.classList.remove('arm-add', 'arm-skip');
    if (armed && s.dx > 0) {
      /* 左滑到底 → 加入志愿表 */
      s.card.style.transform = '';
      const r = s.card.getBoundingClientRect();
      if (state.basket.indexOf(s.idx) < 0) {
        toggleBasket(s.idx, true);
        FX.burst(r.right - 40, r.top + r.height / 2, ['#2e8b6b', '#3aa37e', '#7fd6a8'], 20);
        s.card.classList.add('pop');
        setTimeout(() => s.card.classList.remove('pop'), 540);
        toast('已加入志愿表');
      } else {
        toast('这个组已经在志愿表里了');
      }
    } else if (armed && s.dx < 0) {
      /* 右滑到底 → 本次会话内跳过（不写入数据，只隐藏） */
      s.card.style.transform = '';
      s.wrap.classList.add('gone');
      setTimeout(() => { s.wrap.style.display = 'none'; }, 340);
      toast('已跳过 · 换一批可以恢复');
      state.skipped = state.skipped || new Set();
      state.skipped.add(s.idx);
    } else {
      s.card.style.transform = '';
    }
  }
};

/* ==========================================================================
   16c. 全局触摸反馈
   ========================================================================== */
function bindTouchFeedback() {
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* 涟漪落在可交互元素上，纯背景不响应 */
    const hit = e.target.closest('button, .gcard, .scard, .chip, .fchip, .navitem, .prow, .tiercard, [data-track], [data-mode], [data-view], [data-subj]');
    if (!hit) return;
    const tone = hit.classList.contains('add') || hit.dataset.add ? 'green'
      : hit.classList.contains('tiercard') || hit.dataset.tier ? 'amber' : '';
    Touch.ripple(e.clientX, e.clientY, tone);
  }, { passive: true });
}

/* ==========================================================================
   17. 启动
   ========================================================================== */
(async function init() {
  try {
    boot.set(8, '载入字典与一分一段表');
    await load('data/meta.js');
    boot.set(46, '载入 2,308 所院校');
    await load('data/schools.js');
    boot.set(68, '载入 12,275 个院校专业组');
    await load('data/groups.js');
    boot.set(88, '载入 51,878 条招生专业');
    await load('data/offerings.js');
    boot.set(94, '建立索引');

    D = { meta: window.LD.meta, schools: window.LD.schools, groups: window.LD.groups, offerings: window.LD.offerings };
    D.provRegion = {};

    /* 省 → 大区 反查 */
    const REG = { 华北: ['北京', '天津', '河北', '山西', '内蒙古'], 华东: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'], 华中: ['河南', '湖北', '湖南'], 华南: ['广东', '广西', '海南'], 西南: ['重庆', '四川', '贵州', '云南', '西藏'], 东北: ['辽宁', '吉林', '黑龙江'], 西北: ['陕西', '甘肃', '青海', '宁夏', '新疆'], 港澳台: ['香港', '澳门', '台湾'] };
    for (const r in REG) REG[r].forEach(p => { D.provRegion[p] = r; });

    await new Promise(r => setTimeout(r, 20));
    buildIndex();
    /* ?noanim=1 关掉全部动画：便于无头截图取到稳定画面，也照顾不想看动画的用户 */
    if (new URLSearchParams(location.search).get('noanim') === '1') {
      document.body.classList.add('noanim');
    }
    FX.init();
    Touch.init();
    Stage.load();
    loadBasket();
    loadSubjects();
    bind();
    Gestures.init();
    bindTouchFeedback();
    bindAboutEgg();
    applyMotion();   // 用户选的动效偏好（跟随系统 / 全部 / 减少）
    syncSubjectUI();
    renderSchoolChips();
    renderMajorPicker();
    $('#major-aside').innerHTML = nf(D.majorMeta.size) + ' 个专业名，覆盖 ' + nf(D.schools.length) + ' 所院校';
    $('#rail-major').textContent = nf(D.majorMeta.size);
    renderFilters();
    recalc();
    applyQuery(true);
    firstPaint = false;
    motion.ready = true;
    renderBasket();
    syncViewSeg();
    moveGlider('#trackseg', '#trackglider');
    setTimeout(() => { moveGlider('#trackseg', '#trackglider'); moveGlider('#viewseg', '#viewglider'); }, 120);

    const gs = D.groups.length, ss = D.schools.length;
    $('#rail-groups').textContent = gs > 999 ? (gs / 1000).toFixed(1) + 'k' : gs;
    $('#rail-schools').textContent = ss > 999 ? (ss / 1000).toFixed(1) + 'k' : ss;
    $('#groups-sub').textContent =
      `四川新高考以「院校专业组」为志愿单位。${TRACK_CN[0]}类 ${D.groups.filter(g => g[G_.TRACK] === 0).length} 个组、` +
      `${TRACK_CN[1]}类 ${D.groups.filter(g => g[G_.TRACK] === 1).length} 个组，每个卡片就是一个可以直接填的志愿。`;
    $('#schools-sub').textContent = `${ss} 所院校在四川招生，共投放 ${gs} 个院校专业组。`;

    boot.set(100, '就绪');
    goto((location.hash || '').slice(1) || 'groups', true);
    setTimeout(() => boot.done(), 260);
    /* 存活标记：冒烟测试靠它确认页面真的渲染了，
       否则浏览器错误页（无 JS 错误）会被误判为通过 */
    console.log('[LUODIAN_READY] schools=' + D.schools.length +
      ' groups=' + D.groups.length + ' offerings=' + D.offerings.length +
      ' majors=' + D.majorMeta.size);

    /* 深链接：?school=0043 直接打开院校详情；?group=<序号> 直接打开专业组详情
       白板演示时可以把常用页面存成书签 */
    const dq = new URLSearchParams(location.search);
    const dSchool = dq.get('school'), dGroup = dq.get('group'), dMajor = dq.get('major');

    /* ?score=600&track=0 直接定位到指定分数与科类。
       白板演示可以把「600 分物理类」存成书签；也是验证压线、
       极端位次这类边界情况最方便的办法。 */
    const dTrack = dq.get('track'), dScore = parseInt(dq.get('score'), 10);
    const trackChanged = (dTrack === '0' || dTrack === '1') && +dTrack !== state.track;
    if (trackChanged) state.track = +dTrack;
    if (dScore > 0) { state.mode = 'score'; state.score = dScore; }
    if (trackChanged || dScore > 0) {
      if (trackChanged) {
        $$('[data-track]').forEach(b =>
          b.setAttribute('aria-pressed', b.dataset.track === dTrack ? 'true' : 'false'));
        setTimeout(() => moveGlider('#trackseg', '#trackglider'), 60);
        refreshFacetsShallow(); renderFilters();
      }
      recalc();
      applyQuery(true);
    }

    if (dSchool) {
      const si = D.schools.findIndex(x => x.code === dSchool);
      if (si >= 0) { goto('schools', true); setTimeout(() => openSchool(si), 420); }
    } else if (dGroup !== null) {
      const gi = parseInt(dGroup, 10);
      if (gi >= 0 && gi < D.groups.length) { goto('groups', true); setTimeout(() => openGroup(gi), 420); }
    } else if (dMajor) {
      /* ?major=专业名 或 ?major=序号 —— 直接进「先选专业」的结果页 */
      let mi = parseInt(dMajor, 10);
      if (isNaN(mi) || !D.majorMeta.has(mi)) {
        mi = D.meta.dicts.major.indexOf(dMajor);
        if (mi < 0) mi = D.meta.dicts.major.findIndex(x => x && x.indexOf(dMajor) >= 0);
      }
      if (mi >= 0 && D.majorMeta.has(mi)) {
        goto('major', true);
        setTimeout(() => pickMajor(mi), 380);
      }
    }
    if (dq.get('tags') === '1') setTimeout(() => openTagLegend(), 500);

    /* 首次访问给一次手势提示；触摸设备上尤其重要 */
    try {
      if (!localStorage.getItem('luodian.hinted')) {
        localStorage.setItem('luodian.hinted', '1');
        setTimeout(() => Touch.hint(
          Touch.isTouch
            ? '左滑卡片加入志愿表 · 右滑跳过 · 点卡片看详情'
            : '拖刻度尺或直接输入分数 · 按 <kbd>/</kbd> 搜索 · 右下角可开演示模式', 7000), 1400);
      }
    } catch (e) { }

    window.addEventListener('hashchange', () => goto((location.hash || '').slice(1) || 'groups', true));
    window.addEventListener('resize', debounce(() => { moveGlider('#trackseg', '#trackglider'); moveGlider('#viewseg', '#viewglider'); }, 150));
  } catch (err) {
    console.error(err);
    boot.fail('无法载入数据文件：<code>' + esc(err.message) + '</code><br><br>' +
      '请确认 <code>data/meta.js</code>、<code>data/groups.js</code>、<code>data/offerings.js</code>、<code>data/schools.js</code> 与 index.html 在同一目录。<br><br>' +
      '若浏览器限制本地文件访问，可在本目录运行 <code>python serve.py</code>。');
  }
})();
