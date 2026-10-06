import { AdmissionsRepository } from "./data.js";
import { Motion } from "./motion.js?v=3.1.0";

const C = window.LuodianV3,
  G = C.G,
  O = C.O,
  $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const repository = new AdmissionsRepository(),
  motion = new Motion();
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const nf = (v) =>
    Number.isFinite(v) && v >= 0 ? v.toLocaleString("zh-CN") : "—",
  positive = (v) => (v > 0 ? nf(v) : "—");
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};
const trackName = (t) => (t === 1 ? "历史类" : "物理类");
const icon = {
  save: '<svg class="bookmark" viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>',
  compare:
    '<svg viewBox="0 0 24 24"><path d="M5 5v14M12 3v18M19 5v14M3 8h4M10 16h4M17 10h4"/></svg>',
};
const defaults = () => ({
  q: "",
  batch: "本科批B段",
  province: "",
  region: "",
  schoolCode: "",
  own: "",
  level: "",
  type: "",
  tag: "",
  category: "",
  class: "",
  major: "",
  fee: "",
  tier: "",
  line: false,
  subjectOnly: false,
  scoreFrom: "",
  scoreTo: "",
  sort: "close",
});
const state = {
  route: "explore",
  profile: { track: 0, mode: "score", value: 600, subjects: [], demo: true },
  filters: defaults(),
  layout: "list",
  limit: 24,
  saved: [],
  compare: [],
  planBatch: "本科批B段",
  settings: { theme: "light", motion: "none", stage: false },
};
let D,
  pos = {},
  matched = [],
  unbanded = [],
  viewRows = [],
  toastTimer,
  refreshTimer,
  searchTimer,
  noteSaveTimer,
  detailToken = 0,
  detailStack = [],
  historyOwned = false,
  popupLayer = null,
  popupOwned = false,
  popupReturning = false,
  pendingDetailHistory = false,
  destinationRegion = "",
  subjectDraft = [];
const store = {
  read(k, f) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  },
  write(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      toast("当前浏览器无法保存，请导出清单留存。");
      return false;
    }
  },
};
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3200);
}
function saveProfile() {
  store.write("luodian.v3.profile", state.profile);
}
function saveWorkbench() {
  store.write("luodian.v3.workbench", state.saved);
  syncActions();
}
function bkey(i) {
  return D.keys[i];
}
function isSaved(i) {
  return state.saved.some((x) => x.id === bkey(i));
}
function band(i) {
  return D.groups[i][1] === state.profile.track
    ? C.tier(pos.rank, D.groups[i][G.r25])
    : "none";
}
function badge(i) {
  const b = C.bands[band(i)];
  return `<span class="band-badge" data-band="${band(i)}" style="--band:${b.color}">${b.name}</span>`;
}
function fee(g) {
  if (!(g[G.feeMin] >= 0)) return "学费未提供";
  if (g[G.feeMin] === 0 && g[G.feeMax] === 0) return "免费（源表）";
  return `${nf(g[G.feeMin])}${g[G.feeMax] > g[G.feeMin] ? "–" + nf(g[G.feeMax]) : ""} 元/年`;
}
function majors(i, n = 4) {
  return [...new Set(D.links[i].map((l) => D.dicts.major[l[0]]))]
    .slice(0, n)
    .join(" · ");
}
function seal(s) {
  return esc(
    s.n
      .replace(
        /^(中国|中华|北京|上海|四川|重庆|广东|江苏|浙江|山东|河南|河北|湖南|湖北|辽宁|山西|陕西|广西|贵州|云南)/,
        "",
      )
      .slice(0, 2) || s.n.slice(0, 2),
  );
}
function scoreGap(i) {
  const g = D.groups[i];
  if (
    g[1] !== state.profile.track ||
    !pos.rank ||
    !pos.equivalent ||
    pos.equivalent.edge ||
    !(g[G.s25] > 0) ||
    !(g[G.r25] > 0)
  )
    return "";
  const n = pos.equivalent.score - g[G.s25];
  return `${n > 0 ? "+" : ""}${n} 分 · 同位次口径`;
}
function groupActions(i) {
  return `<button class="text-button" data-group="${i}">详情</button><button class="mini-action" data-compare="${i}" aria-pressed="${state.compare.includes(i)}" aria-label="对比${esc(D.schools[D.groups[i][0]].n)}专业组${esc(D.groups[i][4])}">${icon.compare}</button><button class="mini-action" data-save="${i}" aria-pressed="${isSaved(i)}" aria-label="${isSaved(i) ? "取消关注" : "关注"}${esc(D.schools[D.groups[i][0]].n)}专业组${esc(D.groups[i][4])}">${icon.save}</button>`;
}
function groupIdentity(i) {
  const g = D.groups[i], s = D.schools[g[0]];
  return `<div class="school-line"><button class="card-school" data-school="${g[0]}">${esc(s.n)}</button>${(s.tag || []).filter(t => ["985", "211", "双一流"].includes(t)).slice(0, 1).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div><p class="row-meta">${esc(s.prov)} · ${esc(s.city)} · ${esc(s.own)}<span>院校代码 ${esc(s.code)}</span></p><div class="row-group"><button data-group="${i}">专业组 ${esc(g[4])}</button><span>${esc(g[G.req] || "选科待核对")}</span></div><p class="row-majors" title="${esc(majors(i, 100))}">${esc(majors(i, 4))}${D.links[i].length > 4 ? " 等" : ""}</p>`;
}
function groupCard(i) {
  const g = D.groups[i];
  return `<article class="result-card" data-card="${i}"><div class="card-overline">${badge(i)}<span class="quiet-badge">${esc(g[G.batch])}</span></div>${groupIdentity(i)}<div class="compact-metrics"><div><span>2025 组线</span><strong>${positive(g[G.s25])}<small>分</small></strong></div><div><span>最低位次</span><strong>${positive(g[G.r25])}</strong></div><div><span>2026 计划</span><strong>${nf(g[G.plan])}<small>人</small></strong></div></div><div class="card-info-line"><span>${esc(fee(g))}</span><span>${scoreGap(i)}</span></div><div class="card-actions">${groupActions(i)}</div></article>`;
}
function groupRow(i) {
  const g = D.groups[i];
  return `<tr data-card="${i}"><td class="identity-cell">${groupIdentity(i)}</td><td class="score-cell" data-label="2025 组线"><strong class="list-score">${positive(g[G.s25])}<span> 分</span></strong><small>${scoreGap(i) || "暂不作分差对照"}</small></td><td class="rank-cell" data-label="最低位次"><strong>${positive(g[G.r25])}</strong></td><td class="plan-cell" data-label="2026 计划"><strong>${nf(g[G.plan])}</strong><small>人</small></td><td class="fee-cell" data-label="年学费">${esc(fee(g))}</td><td class="band-cell" data-label="分档">${badge(i)}</td><td class="actions-cell"><div class="list-actions">${groupActions(i)}</div></td></tr>`;
}
function schoolCard(row, n) {
  const s = D.schools[row.i],
    lines = row.groups.map((i) => D.groups[i][G.s25]).filter((x) => x > 0);
  return `<article class="result-card school-card" style="--order:${Math.min(n, 7)}"><div class="card-overline"><span class="school-seal">${seal(s)}</span><span class="quiet-badge">${esc(s.typ)}</span></div><button class="card-school" data-school="${row.i}">${esc(s.n)}</button><p class="card-location">${esc(s.prov)} · ${esc(s.city)} · ${esc(s.own)} · ${esc(s.lvl)}</p><div class="card-tags">${(
    s.tag || []
  )
    .slice(0, 4)
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join(
      "",
    )}</div><p class="card-majors">${esc(s.focus || "学科方向暂未提供，打开院校档案继续了解。")}</p><div class="card-metrics"><div><span>当前筛选下的专业组</span><strong>${row.groups.length}<small>组</small></strong></div><div><span>2025 组线范围</span><strong class="rank-number">${lines.length ? Math.min(...lines) + "–" + Math.max(...lines) : "—"}</strong></div></div><div class="card-actions"><button class="text-button" data-school="${row.i}">查看院校档案</button></div></article>`;
}
function majorCard(row, n) {
  const schoolIds = [...row.schools],
    scores = [...row.groups]
      .map((i) => D.groups[i][G.s25])
      .filter((x) => x > 0);
  return `<article class="result-card major-card" style="--order:${Math.min(n, 7)}"><div class="card-overline"><span class="major-glyph">${["◈", "✧", "⌘", "⟡", "⌖"][row.i % 5]}</span><span class="quiet-badge">${esc([...row.categories].map((c) => D.dicts.cat[c]).join(" / "))}</span></div><h3>${esc(D.dicts.major[row.i])}</h3><p>当前条件下在川招生的院校与专业组</p><div class="card-metrics"><div><span>院校记录</span><strong>${schoolIds.length}<small>条</small></strong></div><div><span>关联专业组</span><strong>${row.groups.size}<small>组</small></strong></div></div><p class="major-schools">${esc(
    schoolIds
      .slice(0, 3)
      .map((i) => D.schools[i].n)
      .join(" · "),
  )}${schoolIds.length > 3 ? " 等" : ""}</p><div class="card-info-line"><span>2025 组线 ${scores.length ? Math.min(...scores) + "–" + Math.max(...scores) + " 分" : "暂缺"}</span></div><div class="card-actions"><button class="text-button" data-major="${row.i}">查看招生专业组</button></div></article>`;
}
function options(items, value, blank = "全部") {
  return (
    `<option value="">${esc(blank)}</option>` +
    items
      .map((item) => {
        const [v, label] = Array.isArray(item) ? item : [item, item];
        return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(label)}</option>`;
      })
      .join("")
  );
}
function filterMarkup(prefix = "f") {
  const f = state.filters,
    unique = (key) =>
      [...new Set(D.schools.map((s) => s[key]).filter(Boolean))].sort((a, b) =>
        a === "四川" ? -1 : b === "四川" ? 1 : a.localeCompare(b, "zh-CN"),
      );
  const fields = [
    ["province", "目的地", unique("prov"), "全国"],
    [
      "batch",
      "招生批次",
      [
        ...new Set(
          D.groups.filter((g) => g[1] === state.profile.track).map((g) => g[2]),
        ),
      ],
      "全部批次",
    ],
    ["category", "学科门类", D.dicts.cat.map((n, i) => [i, n]), "所有门类"],
    ["class", "专业类", D.dicts.catc.map((n, i) => [i, n]), "所有专业类"],
    ["own", "办学性质", unique("own"), "全部性质"],
    ["level", "办学层次", unique("lvl"), "所有层次"],
    ["type", "院校类型", unique("typ"), "所有类型"],
    ["tag", "院校标签", Object.keys(D.tags), "所有标签"],
    [
      "fee",
      "组内最高年学费",
      [
        [5000, "≤ 5,000 元"],
        [8000, "≤ 8,000 元"],
        [15000, "≤ 15,000 元"],
        [30000, "≤ 30,000 元"],
      ],
      "不限（含未知）",
    ],
  ];
  const renderField = ([k, label, items, blank]) =>
    `<label class="filter-field" for="${prefix}-${k}"><span>${label}</span><select id="${prefix}-${k}" data-filter="${k}">${options(items, f[k], blank)}</select></label>`;
  const primary = ["batch", "province", "own", "category", "fee"];
  const advanced = fields.filter(([k]) => !primary.includes(k));
  return primary.map(k => renderField(fields.find(([name]) => name === k))).join("") +
    `<details class="advanced-filters" ${advanced.some(([k]) => f[k] !== "") ? "open" : ""}><summary>更多筛选条件</summary>${advanced.map(renderField).join("")}</details><label class="filter-check"><input type="checkbox" data-filter="subjectOnly" ${f.subjectOnly ? "checked" : ""} ${state.profile.subjects.length !== 2 ? "disabled" : ""}>仅看选科匹配</label><label class="filter-check"><input type="checkbox" data-filter="line" ${f.line ? "checked" : ""}>仅看有 2025 组线</label>`;
}

function syncProfile() {
  const p = state.profile,
    dist = D.dist["2026|" + C.tracks[p.track]];
  $$("[data-track]").forEach((b) =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.track) === p.track)),
  );
  $(".position-card").classList.toggle("rank-mode", p.mode === "rank");
  if (document.activeElement !== $("#position-value"))
    $("#position-value").value = p.value;
  $("#value-label").textContent = p.mode === "score" ? "我的分数" : "我的位次";
  $("#value-unit").textContent = p.mode === "score" ? "分" : "名";
  $("[data-action=mode]").textContent =
    p.mode === "score" ? "改用位次" : "改用分数";
  $("#demo-badge").textContent = p.demo ? "示例分数" : "我的定位";
  $("#subject-label").textContent = p.subjects.length
    ? p.subjects.join(" + ")
    : "设置再选科目";
  motion.number($("#rank-value"), pos.rank);
  $("#equivalent-value").textContent = pos.equivalent
    ? (pos.equivalent.edge ? "≥" : "") + pos.equivalent.score + " 分"
    : "—";
  const min = dist.rows.at(-1)[0],
    max = dist.rows[0][0],
    v = pos.score ?? min;
  $("#score-range").min = min;
  $("#score-range").max = max;
  $("#score-range").value = v;
  $("#score-range").disabled = p.mode === "rank";
  $("#score-range").style.setProperty(
    "--progress",
    Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) + "%",
  );
  $("#range-min").textContent = min + " 分";
  $("#range-max").textContent = max + " 分";
  $("#position-note").classList.toggle("error", !!pos.error);
  $("#position-note").textContent =
    pos.error || `同分位次 ${nf(pos.lo)}–${nf(pos.hi)} · 按 2026 表定位`;
  $("[data-action=plus]").setAttribute(
    "aria-label",
    p.mode === "score" ? "增加一分" : "位次增加一名",
  );
  $("[data-action=minus]").setAttribute(
    "aria-label",
    p.mode === "score" ? "减少一分" : "位次减少一名",
  );
}
function renderAtlas() {
  if (!$("#distribution-panel").open) return;
  const rows = unbanded
    .filter((i) => D.groups[i][G.s25] > 0)
    .sort((a, b) => D.groups[a][G.s25] - D.groups[b][G.s25]);
  if (!rows.length) {
    $("#atlas").innerHTML =
      '<div class="loading-orbit"><span>当前筛选范围暂无有效的 2025 组线</span></div>';
    $("#atlas-note").textContent = "可调整筛选条件";
    return;
  }
  const mobile = innerWidth < 680,
    cap = mobile ? 54 : 145,
    sample =
      rows.length <= cap
        ? rows
        : Array.from(
            { length: cap },
            (_, n) => rows[Math.floor((n * (rows.length - 1)) / (cap - 1))],
          );
  const low = Math.floor((D.groups[rows[0]][G.s25] - 10) / 20) * 20,
    high = Math.ceil((D.groups[rows.at(-1)][G.s25] + 10) / 20) * 20,
    W = mobile ? 350 : 900,
    H = mobile ? 215 : 250,
    left = mobile ? 42 : 60,
    right = mobile ? 18 : 38,
    bottom = mobile ? 176 : 218,
    x = (s) => left + ((s - low) / (high - low)) * (W - left - right),
    regions = [
      "西南",
      "华北",
      "华东",
      "华中",
      "华南",
      "东北",
      "西北",
      "港澳台",
    ];
  const y = (s, i) =>
    (mobile ? 25 : 35) +
    Math.max(0, regions.indexOf(s.reg)) * (mobile ? 19 : 23) +
    ((i * 17) % (mobile ? 11 : 15)) -
    (mobile ? 5 : 7);
  const eq = pos.equivalent?.edge ? null : pos.equivalent,
    marker = eq ? Math.max(left, Math.min(W - right, x(eq.score))) : null;
  const dots = sample
    .map((i, n) => {
      const g = D.groups[i],
        s = D.schools[g[0]],
        b = C.bands[band(i)],
        px = x(g[G.s25]),
        py = y(s, i);
      return `<circle class="star-dot" data-group="${i}" cx="${px}" cy="${py}" r="3" fill="${b.color}" opacity="${n % 7 === 0 ? 0.95 : 0.75}" role="button" tabindex="0" aria-label="${esc(s.n)}专业组${esc(g[4])}，2025组线${g[G.s25]}分"/>`;
    })
    .join("");
  const label = !mobile
      ? unbanded.find((i) => D.groups[i][G.s25] > 0)
      : undefined,
    labelGroup = label !== undefined ? D.groups[label] : null,
    labelSchool = labelGroup ? D.schools[labelGroup[0]] : null;
  const tickCount = mobile ? 4 : 6,
    ticks = Array.from({ length: tickCount }, (_, n) => {
      const score = Math.round(low + ((high - low) * n) / (tickCount - 1));
      return `<line x1="${x(score)}" y1="20" x2="${x(score)}" y2="${bottom}" stroke="var(--line)" stroke-dasharray="2 6"/><text x="${x(score)}" y="${bottom + 21}" text-anchor="middle">${score}</text>`;
    }).join("");
  $("#atlas").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="专业组调档线分布。横轴为2025调档线，纵向为地域大区。点选可查看详情。">${regions.map((r, n) => `<text x="0" y="${(mobile ? 29 : 39) + n * (mobile ? 19 : 23)}">${r}</text>`).join("")}${ticks}${marker !== null ? `<line class="my-line" x1="${marker}" y1="15" x2="${marker}" y2="${bottom}"/><text class="my-label" x="${Math.max(mobile ? 85 : 100, Math.min(W - 70, marker))}" y="12" text-anchor="middle">${mobile ? "等效分" : "你的等效分"} ${eq.score}${x(eq.score) < left || x(eq.score) > W - right ? "（范围外）" : ""}</text>` : ""}${dots}${labelSchool ? `<text x="${Math.min(W - 130, x(labelGroup[G.s25]) + 8)}" y="${y(labelSchool, label) + 19}" data-group="${label}" style="cursor:pointer;font-size:11px">${esc(labelSchool.n)}</text>` : ""}<text x="${W - right}" y="${H - 2}" text-anchor="end" style="font-size:${mobile ? 9 : 10}px">2025 专业组调档线 / 分</text></svg>`;
  $("#atlas-note").textContent =
    `展示 ${sample.length} / ${nf(rows.length)} 个有线组 · 点选查看`;
}
function aggregate() {
  if (state.route === "explore") return matched;
  if (state.route === "schools") {
    const map = new Map();
    matched.forEach((i) => {
      const school = D.groups[i][0];
      if (!map.has(school)) map.set(school, { i: school, groups: [] });
      map.get(school).groups.push(i);
    });
    return [...map.values()];
  }
  const map = new Map(),
    q = state.filters.q.trim().toLowerCase(),
    majorQuery = q && D.dicts.major.some((m) => m.toLowerCase().includes(q));
  for (const i of matched)
    for (const [m, c, k] of D.links[i]) {
      if (
        (state.filters.major !== "" && m !== Number(state.filters.major)) ||
        (state.filters.category !== "" &&
          c !== Number(state.filters.category)) ||
        (state.filters.class !== "" && k !== Number(state.filters.class)) ||
        (majorQuery && !D.dicts.major[m].toLowerCase().includes(q))
      )
        continue;
      if (!map.has(m))
        map.set(m, {
          i: m,
          groups: new Set(),
          schools: new Set(),
          categories: new Set(),
        });
      const row = map.get(m);
      row.groups.add(i);
      row.schools.add(D.groups[i][0]);
      row.categories.add(c);
    }
  return [...map.values()].sort(
    (a, b) => b.schools.size - a.schools.size || a.i - b.i,
  );
}
function renderChips() {
  const f = state.filters,
    labels = {
      province: f.province,
      region: f.region,
      schoolCode: f.schoolCode
        ? D.schools.find((s) => s.code === f.schoolCode)?.n || f.schoolCode
        : "",
      batch: f.batch !== "本科批B段" ? f.batch || "全部批次" : "",
      own: f.own,
      level: f.level,
      type: f.type,
      tag: f.tag,
      category: f.category !== "" ? D.dicts.cat[Number(f.category)] : "",
      class: f.class !== "" ? D.dicts.catc[Number(f.class)] : "",
      major: f.major !== "" ? D.dicts.major[Number(f.major)] : "",
      fee: f.fee ? "学费 ≤ " + nf(Number(f.fee)) : "",
      tier: f.tier ? C.bands[f.tier].name : "",
      subjectOnly: f.subjectOnly ? "选科匹配" : "",
      line: f.line ? "有2025组线" : "",
      q: f.q,
    };
  $("#filter-chips").innerHTML = Object.entries(labels)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<button data-clear-filter="${k}">${esc(v)}<span>×</span></button>`,
    )
    .join("");
  $("#search-clear").hidden = !f.q;
  $("#sort").value = f.sort;
  $$("[data-tier]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.tier === f.tier)),
  );
  $$("[data-layout]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.layout === state.layout)),
  );
}
function renderResults(append = false) {
  if (state.route === "plan") return renderPlan();
  const rows = viewRows.slice(0, state.limit),
    unit =
      state.route === "explore"
        ? "个专业组"
        : state.route === "schools"
          ? "条院校记录"
          : "个专业名称";
  $("#results-count").innerHTML =
    `<strong>${nf(viewRows.length)}</strong> ${unit} <span>· ${trackName(state.profile.track)}</span>`;
  const table = state.route === "explore" && state.layout === "list";
  $("#results").className = table ? "list-results" : "results-grid";
  $(".layout-switch").hidden = state.route !== "explore";
  if (!rows.length)
    $("#results").innerHTML =
      `<div class="empty-state"><span>✧</span><h3>没有符合条件的结果</h3><p>可以减少筛选条件或更换关键词。</p><button class="button primary" data-action="reset">重置筛选</button></div>`;
  else if (table) {
    if (append && $("#list-body"))
      $("#list-body").insertAdjacentHTML(
        "beforeend",
        rows
          .slice(state.limit - 24)
          .map(groupRow)
          .join(""),
      );
    else
      $("#results").innerHTML =
        `<table class="list-table"><thead><tr><th>院校 / 专业组</th><th>2025 组线</th><th>最低位次</th><th>2026 计划</th><th>年学费</th><th>分档</th><th>操作</th></tr></thead><tbody id="list-body">${rows.map(groupRow).join("")}</tbody></table>`;
  } else {
    const renderer =
      state.route === "explore"
        ? groupCard
        : state.route === "schools"
          ? schoolCard
          : majorCard;
    if (append)
      $("#results").insertAdjacentHTML(
        "beforeend",
        rows
          .slice(state.limit - 24)
          .map(renderer)
          .join(""),
      );
    else $("#results").innerHTML = rows.map(renderer).join("");
  }
  $("#results").setAttribute("aria-busy", "false");
  $("[data-action=more]").hidden = state.limit >= viewRows.length;
  $("#shown-count").textContent = viewRows.length
    ? `已显示 ${nf(rows.length)} / ${nf(viewRows.length)} ${unit}`
    : "";
  syncActions();
}
function refresh(reset = true) {
  if (!D) return;
  pos = C.position(
    D,
    state.profile.track,
    state.profile.mode,
    state.profile.value,
  );
  syncProfile();
  const p = { ...state.profile, rank: pos.rank };
  unbanded = C.query(D, { ...state.filters, tier: "" }, p);
  matched = state.filters.tier
    ? unbanded.filter((i) => band(i) === state.filters.tier)
    : unbanded;
  motion.number($("#count-all"), unbanded.length);
  for (const k of ["chong", "wen", "bao"])
    motion.number(
      $("#count-" + k),
      pos.rank ? unbanded.filter((i) => band(i) === k).length : null,
    );
  if (reset) state.limit = 24;
  viewRows = aggregate();
  renderChips();
  renderResults();
  renderAtlas();
  updateURL();
}
function applySettings() {
  document.documentElement.dataset.theme =
    state.settings.theme === "light" ? "light" : "dark";
  motion.set(state.settings.motion);
  document.body.classList.toggle("stage", state.settings.stage);
  $("#stage-dock").hidden = !state.settings.stage;
  store.write("luodian.v3.settings", state.settings);
}
function url() {
  const p = new URLSearchParams();
  p.set("track", state.profile.track);
  if (state.profile.value !== "")
    p.set(state.profile.mode, state.profile.value);
  if (state.profile.demo) p.set("demo", "1");
  if (state.profile.subjects.length)
    p.set("subjects", state.profile.subjects.join(","));
  for (const k of Object.keys(defaults()))
    if (state.filters[k] !== defaults()[k]) {
      if (["line", "subjectOnly"].includes(k)) {
        if (state.filters[k]) p.set(k, "1");
      } else p.set(k, state.filters[k]);
    }
  if (state.layout !== "list") p.set("layout", state.layout);
  if (state.settings.stage) p.set("stage", "1");
  return "?" + p + "#" + state.route;
}
function updateURL() {
  try {
    history.replaceState(history.state, "", url());
  } catch {}
}
function navigate(route, fromHistory = false) {
  if (!["explore", "schools", "majors", "plan"].includes(route))
    route = "explore";
  const changed = state.route !== route;
  state.route = route;
  document.body.dataset.route = route;
  $$("[data-route]").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === route);
    if (b.dataset.route === route) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const labels = {
    explore: ["四川 · 2026 招生计划", "专业组查询"],
    schools: ["四川 · 2026 招生计划", "院校查询"],
    majors: ["四川 · 2026 招生计划", "专业查询"],
    plan: ["按科类与批次整理", "我的志愿"],
  };
  $("#workspace-eyebrow").textContent = labels[route][0];
  $("#workspace-title").textContent = labels[route][1];
  $("#explore-layout").hidden = route === "plan";
  $("#plan-workspace").hidden = route !== "plan";
  $(".workspace-actions").hidden = route === "plan";
  if (changed && !fromHistory) {
    try {
      history.pushState({ ldV3Page: true }, "", url());
    } catch {}
  }
  refresh();
  if (changed && !fromHistory)
    $("#workspace").scrollIntoView({
      behavior: motion.active() ? "smooth" : "auto",
      block: "start",
    });
}
function toggleSave(i, button) {
  if (!D.groups[i]) return;
  const id = bkey(i),
    at = state.saved.findIndex((x) => x.id === id);
  if (at >= 0) {
    state.saved.splice(at, 1);
    toast("已从工作台移除");
  } else {
    state.saved.push({ id, note: "", majors: [] });
    toast("已关注，在志愿工作台继续比较。");
    motion.pop(button);
  }
  saveWorkbench();
  if (state.route === "plan") renderPlan();
}
function syncActions() {
  $("#saved-count").textContent = state.saved.length;
  $$("[data-save]").forEach((b) => {
    const i = Number(b.dataset.save);
    b.setAttribute("aria-pressed", String(isSaved(i)));
    if (b.dataset.saveLabel !== undefined)
      b.innerHTML = icon.save + (isSaved(i) ? "已关注" : "关注这个组");
  });
  $$("[data-compare]").forEach((b) =>
    b.setAttribute(
      "aria-pressed",
      String(state.compare.includes(Number(b.dataset.compare))),
    ),
  );
  $("#compare-tray").hidden = !state.compare.length;
  $("#compare-summary").textContent =
    `已选 ${state.compare.length} / 3 个专业组`;
  $("#compare-names").textContent = state.compare
    .map((i) => D.schools[D.groups[i][0]].n + " " + D.groups[i][4])
    .join(" · ");
}
function toggleCompare(i) {
  const at = state.compare.indexOf(i);
  if (at >= 0) state.compare.splice(at, 1);
  else if (state.compare.length < 3) state.compare.push(i);
  else return toast("一次最多比较三个专业组，先移除一个再试试。");
  syncActions();
}

// Dialog navigation retains an internal stack and only consumes its own history.
function showDialog(el) {
  el._ldEpoch = (el._ldEpoch || 0) + 1;
  el.classList.remove("closing");
  if (!el.open) {
    el._ldReturnFocus = document.activeElement;
    if (el.id !== "detail-dialog") {
      const reusePopup = popupLayer?.open && popupOwned;
      if (popupLayer?.open) {
        popupLayer.close();
      }
      popupLayer = el;
      try {
        history[reusePopup ? "replaceState" : "pushState"](
          { ldV3Popup: el.id },
          "",
          location.href,
        );
        popupOwned = true;
      } catch {
        popupOwned = false;
      }
    }
    el.showModal();
  }
  el.scrollTop = 0;
  el.querySelector("[data-close]")?.focus({ preventScroll: true });
}
function hideDialog(el, skipHistory = false) {
  if (!el || !el.open || el.classList.contains("closing")) return;
  if (el.id === "detail-dialog") {
    detailToken++;
    detailStack = [];
    $("#detail-back").hidden = true;
    const owned = historyOwned && history.state?.ldV3Dialog;
    historyOwned = false;
    if (owned && !skipHistory)
      try {
        history.back();
      } catch {}
  } else if (popupLayer === el) {
    const owned = popupOwned && history.state?.ldV3Popup === el.id;
    popupLayer = null;
    popupOwned = false;
    if (owned && !skipHistory)
      try {
        popupReturning = true;
        history.back();
      } catch {
        popupReturning = false;
      }
  }
  const epoch = el._ldEpoch,
    done = () => {
      if (el._ldEpoch !== epoch) return;
      el.classList.remove("closing");
      if (el.open) el.close();
      if (el._ldReturnFocus?.isConnected)
        el._ldReturnFocus.focus({ preventScroll: true });
    };
  if (!motion.active()) {
    done();
    return;
  }
  el.classList.add("closing");
  let ended = false;
  const once = () => {
    if (ended) return;
    ended = true;
    done();
  };
  el.addEventListener("animationend", once, { once: true });
  setTimeout(once, 250);
}
function openModal(title, kicker, content) {
  $("#modal-title").textContent = title;
  $("#modal-kicker").textContent = kicker;
  $("#modal-content").innerHTML = content;
  showDialog($("#modal-dialog"));
}
function enterDetail(type, id, replay = false) {
  for (const el of [$("#modal-dialog"), $("#command-dialog")])
    if (el.open) {
      hideDialog(el);
      el.classList.remove("closing");
      el.close();
    }
  if (!replay) {
    if (!detailStack.length) {
      if (popupReturning) pendingDetailHistory = true;
      else
        try {
          history.pushState({ ldV3Dialog: true }, "", location.href);
          historyOwned = true;
        } catch {
          historyOwned = false;
        }
    }
    detailStack.push({ type, id });
  }
  $("#detail-back").hidden = detailStack.length < 2;
  detailToken++;
  $("#detail-kicker").textContent =
    type === "group"
      ? "专业组档案"
      : type === "school"
        ? "院校档案"
        : "专业组对比";
  if (type === "group") renderGroupDetail(id);
  if (type === "school") renderSchoolDetail(id);
  if (type === "compare") renderComparison();
  showDialog($("#detail-dialog"));
}
function detailBack() {
  if (detailStack.length < 2) return hideDialog($("#detail-dialog"));
  detailStack.pop();
  const prev = detailStack.at(-1);
  enterDetail(prev.type, prev.id, true);
}
function historyTable(g) {
  return `<table class="history-table"><thead><tr><th>年份与口径</th><th>组线 / 分</th><th>最低位次</th><th>实际录取</th></tr></thead><tbody><tr><td>2025 · 新高考</td><td>${positive(g[G.s25])}</td><td>${positive(g[G.r25])}</td><td>${positive(g[G.admit25])}</td></tr><tr class="old"><td>2024 · 旧文理参考</td><td>${positive(g[G.s24])}</td><td>${positive(g[G.r24])}</td><td>${positive(g[G.admit24])}</td></tr><tr class="old"><td>2023 · 旧文理参考</td><td>${positive(g[G.s23])}</td><td>${positive(g[G.r23])}</td><td>未收录</td></tr></tbody></table>`;
}
function comparisonPosition(i) {
  const g = D.groups[i];
  if (g[1] !== state.profile.track)
    return '<div class="note-box">这个专业组与你当前科类不同，不做跨科类位次或分差比较。</div>';
  if (!pos.rank)
    return '<div class="note-box">设置有效的分数或位次后，查看你与往年组线的距离。</div>';
  if (!(g[G.r25] > 0))
    return '<div class="note-box">暂无有效的 2025 组线，暂不分档；缺少往年线不自动表示这是新增专业组。</div>';
  const eq = pos.equivalent,
    gap = eq && !eq.edge && g[G.s25] > 0 ? eq.score - g[G.s25] : null,
    min = Math.max(1, Math.floor(Math.min(pos.rank, g[G.r25]) * 0.9)),
    max = Math.ceil(Math.max(pos.rank, g[G.r25]) * 1.1),
    x = (r) => ((r - min) / (max - min)) * 100;
  return `<div class="position-comparison"><div class="comparison-numbers"><div><small>你的 2025 同位次等效分</small><strong>${eq ? (eq.edge ? "≥" : "") + eq.score : "—"}</strong><small>2026 位次 ${nf(pos.rank)}</small></div><div class="gap"><small>同口径分差</small><strong>${gap === null ? "—" : (gap > 0 ? "+" : "") + gap}</strong>${badge(i)}</div><div><small>该组 2025 调档线</small><strong>${positive(g[G.s25])}</strong><small>最低位次 ${positive(g[G.r25])}</small></div></div><div class="comparison-scale"><i style="left:${x(pos.rank)}%" title="你的位次"></i><i class="theirs" style="left:${x(g[G.r25])}%" title="2025组线位次"></i><span>${nf(min)} 名</span><span>${nf(max)} 名</span></div><p class="fine-print">你与往年组线相差 ${nf(Math.abs(pos.rank - g[G.r25]))} 名。分档是往年位置对照，不能换算成录取概率。${eq?.edge ? "等效分在表格边界之外，不给出精确分差。" : ""}</p></div>`;
}
function renderGroupDetail(i) {
  const g = D.groups[i];
  if (!g) return;
  const s = D.schools[g[0]],
    charter = safeURL(s.charter),
    status = C.subjectStatus(g[G.req], state.profile.subjects);
  $("#detail-content").innerHTML =
    `<div class="detail-head"><div class="card-tags">${(s.tag || [])
      .slice(0, 6)
      .map(
        (t) =>
          `<button class="tag" data-tag-info="${esc(t)}">${esc(t)}</button>`,
      )
      .join(
        "",
      )}</div><h2 id="detail-title">${esc(s.n)}</h2><div class="detail-sub"><b>专业组 ${esc(g[G.code])}</b><span>${trackName(g[1])} · ${esc(g[G.batch])} · ${esc(g[G.type])}</span></div><div class="detail-sub">院校代码 ${esc(s.code)} · ${esc(s.prov)} ${esc(s.city)} · ${esc(s.own)}</div><div class="detail-actions"><button class="button primary" data-save="${i}" data-save-label aria-pressed="${isSaved(i)}">${icon.save}${isSaved(i) ? "已关注" : "关注这个组"}</button><button class="button" data-compare="${i}" aria-pressed="${state.compare.includes(i)}">${icon.compare}加入比较</button>${charter ? `<a class="button" href="${esc(charter)}" target="_blank" rel="noopener">招生章程</a>` : ""}</div></div><section class="detail-section"><h3>位次对照 ${badge(i)}</h3>${comparisonPosition(i)}</section><section class="detail-section"><h3>报考条件与招生计划</h3><div class="detail-stats"><div class="detail-stat"><span>再选科目要求</span><strong style="font-size:19px">${esc(g[G.req] || "未提供")}</strong><small>${{ ok: "符合已知选科要求", mismatch: "与你的选科不符", unset: "设置两门再选科目后核验", unknown: "请核对当年招生章程" }[status]}</small></div><div class="detail-stat"><span>2026 招生计划</span><strong>${nf(g[G.plan])}</strong><small>人 · 组内合计</small></div><div class="detail-stat"><span>四川填报学费</span><strong style="font-size:18px">${esc(fee(g))}</strong><small>招生考试报 · 组内区间</small></div></div>${g[G.type] !== "普通类" || !["本科批B段", "高职(专科)批"].includes(g[G.batch]) ? '<p class="note-box warn" style="margin-top:12px">这个组涉及特殊批次或类型。分数、选科匹配不能代替专项资格、体检和招生章程核验。</p>' : ""}</section><div class="detail-tabs" role="tablist"><button data-detail-tab="majors" role="tab" aria-selected="true">组内专业</button><button data-detail-tab="history" role="tab" aria-selected="false">历年与计划</button><button data-detail-tab="source" role="tab" aria-selected="false">来源与字段</button></div><section class="detail-section" data-detail-panel="majors"><h3>${g[G.n]} 条招生专业记录 <small>专业录取线与组线不同</small></h3><p class="note-box">达到组线不等于可以进入组内任意专业。展开专业查看它自己的往年线、计划、学费与评价。</p><div class="detail-search" style="margin-top:15px"><input type="search" id="professional-search" placeholder="在这个组里查找专业…" aria-label="筛选组内专业"></div><div id="professional-content"><div class="inline-loading">正在读取完整专业档案…</div></div></section><section class="detail-section" data-detail-panel="history" hidden><h3>历年专业组调档线</h3>${historyTable(g)}<p class="fine-print">2024、2023 为旧文理分科参考，不参与新高考冲稳保分档。专业组可能跨年重组。</p><h3 style="margin-top:25px">计划与录取</h3><div class="note-box">2026 计划 ${nf(g[G.plan])} 人，2025 实际录取 ${positive(g[G.admit25])} 人。${g[G.plan] > 0 && g[G.admit25] >= 10 ? "数量相差 " + Math.round((g[G.plan] / g[G.admit25] - 1) * 100) + "%。" : "缺少可比数据或基数较小，不显示百分比。"}组内专业、资格与统计口径可能变化，这个差异不能直接认定为同口径扩招。</div></section><section class="detail-section" data-detail-panel="source" hidden><h3>来源标记与完整组字段</h3><p class="note-box">${g[G.source] === 0 ? "源表标记为官方组线值；本次迁移保留该标记，不代表重新逐条核验原表。" : "源表暂无可用于分档的官方组线；保持原始标记和缺失值。"}</p><table class="field-table" style="margin-top:12px"><tbody>${[
      ["院校与专业组复合代码", g[G.compound]],
      ["专业组稳定标识", bkey(i)],
      ["招生类型", g[G.type]],
      ["2026 组内新专业标记数量", g[G.newCount]],
      ["源表冲突标记", g[G.conflict]],
      ["源表组线来源代码", g[G.source]],
      ["数据生成时间", D.generated],
    ]
      .map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`)
      .join(
        "",
      )}</tbody></table><p class="fine-print">新增标记、冲突标记与来源代码均为原始数据字段，不在界面推断新的结论。</p><a class="source-link" href="https://plan.sceea.cn/${g[1] === 0 ? "lkjh" : "wkjh"}.html" target="_blank" rel="noopener">核对 2026 四川官方招生计划</a></section><section class="detail-section"><button class="button" data-school="${g[0]}">查看院校档案与其他专业组</button></section>`;
  const token = detailToken;
  Promise.all([repository.school(g[0]), repository.meta()])
    .then(([data, meta]) => {
      if (token !== detailToken) return;
      const rows = data.byGroup.get(i) || [];
      if (rows.length !== g[G.n]) throw Error("本组专业记录数量与目录不一致。");
      $("#professional-content").innerHTML = rows.length
        ? rows
            .map(({ row: o, ordinal }) => professional(o, ordinal, meta))
            .join("")
        : '<p class="note-box">当前源表收录 0 条组内招生专业记录；计划为 0 时保留原值，请继续核对 2026 官方招生计划。</p>';
    })
    .catch((e) => {
      if (token === detailToken)
        $("#professional-content").innerHTML =
          `<div class="note-box warn">${esc(e.message)}<br><button class="button" data-retry-group="${i}">重试读取</button></div>`;
    });
}
function dict(meta, key, index) {
  return Number.isInteger(index) &&
    index >= 0 &&
    meta.dicts[key]?.[index] !== undefined
    ? meta.dicts[key][index]
    : "";
}
function professional(o, ordinal, meta) {
  const name = dict(meta, "major", o[O.major]),
    rawFee = dict(meta, "tfee", o[O.feeText]),
    reported = rawFee
      ? /^\d+(\.\d+)?$/.test(rawFee)
        ? rawFee + " 元/年"
        : rawFee
      : "未提供",
    url = safeURL(dict(meta, "url", o[O.feeURL]));
  const fields = [
    ["四川填报年学费", reported],
    ["2026 招生计划", o[O.plan] >= 0 ? nf(o[O.plan]) + " 人" : "未提供"],
    ["学科门类", dict(meta, "cat", o[O.category])],
    ["专业类", dict(meta, "catc", o[O.class])],
    ["软科专业评级 · 源表", dict(meta, "sr", o[O.rating])],
    ["软科专业排名 · 源表", positive(o[O.ranking])],
    ["学科评估 · 关联字段", dict(meta, "de", o[O.assessment])],
    ["特色专业 · 源表", dict(meta, "ml", o[O.specialty])],
    ["硕士点 · 源表", dict(meta, "mp", o[O.master])],
    ["博士点 · 源表", dict(meta, "dp", o[O.doctor])],
  ];
  return `<details class="major-detail" data-professional="${esc(name.toLowerCase())}"><summary><div><strong>${esc(name)} <span class="tag">${esc(o[O.code])}</span></strong><small>计划 ${nf(o[O.plan])} 人 · ${esc(reported)}</small></div><span>${o[O.s25] > 0 ? o[O.s25] + " 分" : "暂无线"}<small>2025 专业线</small></span></summary><div class="major-body"><div class="major-data">${fields.map(([k, v]) => `<div><span>${k}</span><strong>${esc(v || "未提供")}</strong></div>`).join("")}</div>${dict(meta, "note", o[O.note]) ? `<p><b>报考备注</b><br>${esc(dict(meta, "note", o[O.note]))}</p>` : ""}<table class="history-table"><thead><tr><th>年份</th><th>专业最低分</th><th>最低位次</th></tr></thead><tbody><tr><td>2025 · 新高考</td><td>${positive(o[O.s25])}</td><td>${positive(o[O.r25])}</td></tr><tr class="old"><td>2024 · 旧文理参考</td><td>${positive(o[O.s24])}</td><td>${positive(o[O.r24])}</td></tr><tr class="old"><td>2023 · 旧文理参考</td><td>${positive(o[O.s23])}</td><td>${positive(o[O.r23])}</td></tr></tbody></table><h4 style="font-size:13px;margin-top:17px">另外收录的院校收费材料</h4>${o[O.feeScope] && o[O.feeScope] !== "UNVERIFIED" ? `<p>${esc(dict(meta, "fkind", o[O.kind]) || "类型未注明")} · ${esc(dict(meta, "fpub", o[O.publisher]) || "发布机构未提供")}<br>收费区间 ${nf(o[O.officialMin])}–${nf(o[O.officialMax])} 元；原始关联范围 ${esc(o[O.feeScope])}。</p>${dict(meta, "fee", o[O.feeExcerpt]) ? `<details><summary style="padding:8px 0;min-height:44px">查看收费材料摘录</summary><p>${esc(dict(meta, "fee", o[O.feeExcerpt]))}</p></details>` : ""}${url ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener">打开收费材料原始来源</a>` : ""}` : "<p>暂无已关联的院校收费材料。</p>"}<p class="fine-print">院校收费材料可能来自其他省份，不覆盖上方四川专业填报学费。评价字段的年份与统计层级以原始资料为准；未提供不等于没有资格。</p><details><summary style="font-size:11px;color:var(--faint);min-height:44px">完整原始字段 · 记录 ${ordinal}</summary><table class="field-table"><tbody>${D.schemas.offering.map((key, k) => `<tr><td>${key}</td><td>${esc(o[k])}</td></tr>`).join("")}</tbody></table></details></div></details>`;
}
function archiveHTML(text) {
  if (text == null) return '<p class="fine-print">这所学校暂未提供长档案。</p>';
  const parts = [
    ...String(text).matchAll(
      /【([^】]{1,24})】\s*([\s\S]*?)(?=【[^】]{1,24}】|$)/g,
    ),
  ];
  return (
    parts.length ? parts.map((m) => [m[1], m[2].trim()]) : [["院校档案", text]]
  )
    .map(
      ([title, body], i) =>
        `<details class="archive-section" ${i === 0 ? "open" : ""}><summary>${esc(title)}</summary><div>${esc(body)}</div></details>`,
    )
    .join("");
}
function renderSchoolDetail(si) {
  const s = D.schools[si];
  if (!s) return;
  const ids = D.schoolGroups[si].filter(
      (i) => D.groups[i][1] === state.profile.track,
    ),
    lines = ids.map((i) => D.groups[i][G.s25]).filter((x) => x > 0),
    url = safeURL(s.charter);
  $("#detail-content").innerHTML =
    `<div class="detail-head"><span class="school-seal">${seal(s)}</span><h2 id="detail-title">${esc(s.n)}</h2><div class="detail-sub">${esc(s.prov)} · ${esc(s.city)} · ${esc(s.own)} · ${esc(s.typ)} · ${esc(s.lvl)}</div><div class="card-tags">${(s.tag || []).map((t) => `<button class="tag" data-tag-info="${esc(t)}">${esc(t)}</button>`).join("")}</div><div class="detail-actions">${url ? `<a class="button primary" href="${esc(url)}" target="_blank" rel="noopener">核对招生章程</a>` : ""}<button class="button" data-school-filter="${si}">在查询中只看这所学校</button></div></div><section class="detail-section"><h3>在川招生信息 <small>${trackName(state.profile.track)} · 全部批次</small></h3><div class="detail-stats"><div class="detail-stat"><span>当前科类专业组</span><strong>${ids.length}</strong><small>各批次分别查看</small></div><div class="detail-stat"><span>2025 组线区间</span><strong style="font-size:20px">${lines.length ? Math.min(...lines) + "–" + Math.max(...lines) : "—"}</strong><small>分 · 各组门槛不同</small></div><div class="detail-stat"><span>院校代码</span><strong>${esc(s.code)}</strong><small>源表独立招生记录</small></div></div><p class="fine-print">同一院校可能包含不同校区、批次和招生类型；最低一条组线不能代表全部专业的门槛。</p></section><section class="detail-section"><h3>完整院校档案</h3><div id="school-archive"><div class="inline-loading">正在读取院校信息与官方来源索引…</div></div></section><section class="detail-section"><h3>招生专业组</h3>${
      ids
        .map((i) => {
          const g = D.groups[i];
          return `<button class="detail-group-button" data-group="${i}"><div><strong>专业组 ${esc(g[4])} · ${esc(g[G.req] || "选科未提供")}</strong><small>${esc(g[G.batch])} · ${esc(g[G.type])}<br>${esc(majors(i, 3))}</small></div><span>${badge(i)}<small>2025 ${positive(g[G.s25])} 分</small></span></button>`;
        })
        .join("") ||
      '<p class="note-box">当前科类暂无专业组记录，请切换科类查看。</p>'
    }</section>`;
  const token = detailToken;
  repository
    .school(si)
    .then(({ school, archive }) => {
      if (token !== detailToken) return;
      const fields = [
        ["主管／举办部门", school.aff],
        ["教育部登记名称", school.mn],
        ["学校标识码", school.mid],
        ["教育部登记所在地", school.ml],
        ["教育部登记主管部门", school.md],
        ["名录匹配方式", school.mm],
        ["源表办学层次", school.tier],
        ["源表院校排名", school.rk > 0 ? school.rk : "未提供"],
        ["源表评级", school.gr],
        ["专业分配规则", school.rule],
        ["学科方向", school.focus],
        ["办学证据字段", school.ev],
        [
          "保研字段 · 源表",
          school.pg >= 0
            ? (school.pg * 100).toFixed(2) + "%（年份以源表为准）"
            : "未提供",
        ],
      ];
      $("#school-archive").innerHTML =
        `<div class="archive-meta"><span class="tag">来源索引 ${school.detailSourceCount ?? "未提供"} 项</span><span class="tag">${esc((school.detailUpdatedAt || "").slice(0, 10) || "更新时间未提供")}</span></div>${school.desc ? `<p class="note-box" style="margin-bottom:14px">${esc(school.desc)}</p>` : ""}${archiveHTML(archive)}<details class="archive-section"><summary>办学、名录与评价字段</summary><div><table class="field-table"><tbody>${fields.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v ?? "未提供")}</td></tr>`).join("")}</tbody></table></div></details><details class="archive-section"><summary>完整原始院校记录</summary><div><table class="field-table"><tbody>${Object.entries(
          school,
        )
          .map(
            ([k, v]) =>
              `<tr><td>${esc(k)}</td><td>${esc(Array.isArray(v) ? v.join("、") : v)}</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table></div></details><p class="fine-print">档案由源库官方来源索引与结构化字段编排。标记、排名、比例和评价不解释为当前录取优势；具体要求核对当年章程。</p>`;
    })
    .catch((e) => {
      if (token === detailToken)
        $("#school-archive").innerHTML =
          `<p class="note-box warn">${esc(e.message)}<br><button class="button" data-retry-school="${si}">重新读取院校档案</button></p>`;
    });
}
function renderComparison() {
  const ids = state.compare.filter((i) => D.groups[i]);
  if (ids.length < 2) {
    $("#detail-content").innerHTML =
      '<h2 id="detail-title">再选一个专业组</h2><p class="note-box">至少选择两个专业组才能并排比较。</p>';
    return;
  }
  const rows = [
    [
      "科类与批次",
      (i) =>
        `${trackName(D.groups[i][1])}<small>${esc(D.groups[i][2])} / ${esc(D.groups[i][3])}</small>`,
    ],
    ["选科要求", (i) => esc(D.groups[i][G.req] || "未提供")],
    ["2025 组线", (i) => `<strong>${positive(D.groups[i][G.s25])}</strong> 分`],
    ["2025 最低位次", (i) => positive(D.groups[i][G.r25])],
    ["与你的对照", badge],
    ["同位次分差", (i) => scoreGap(i) || "不作精确比较"],
    ["2026 招生计划", (i) => nf(D.groups[i][G.plan]) + " 人"],
    ["四川填报学费", (i) => esc(fee(D.groups[i]))],
    ["组内专业名称", (i) => esc(majors(i, 100))],
    [
      "关注与详情",
      (i) =>
        `<button class="button" data-save="${i}" data-save-label aria-pressed="${isSaved(i)}">${icon.save}${isSaved(i) ? "已关注" : "关注这个组"}</button><button class="text-button" data-group="${i}">查看完整档案</button>`,
    ],
  ];
  $("#detail-content").innerHTML =
    `<div class="detail-head"><h2 id="detail-title">专业组对比</h2><p class="fine-print">按同一套字段比较。不同科类不作位次对照，专业录取线需进入组内档案逐项查看。</p></div><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>对比维度</th>${ids.map((i) => `<th>${esc(D.schools[D.groups[i][0]].n)}<small>专业组 ${esc(D.groups[i][4])}</small></th>`).join("")}</tr></thead><tbody>${rows.map(([label, render]) => `<tr><th>${label}</th>${ids.map((i) => `<td>${render(i)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="fine-print">手机上可横向滑动比较表格。缺失值保留为“未提供”，不解释为免费、无资格或新增。</p>`;
}

function renderPlan() {
  const p = { ...state.profile, rank: pos.rank },
    d = C.diagnose(D, state.saved, p, state.planBatch),
    scope = d.ids,
    allBatches = [
      ...new Set(
        state.saved
          .map((x) => D.groups[D.byKey.get(x.id)])
          .filter((g) => g[1] === p.track)
          .map((g) => g[2]),
      ),
    ];
  if (!allBatches.includes(state.planBatch) && state.planBatch)
    allBatches.unshift(state.planBatch);
  const controls = `<div class="plan-controls"><div><select id="plan-batch" aria-label="工作台批次">${options(allBatches, state.planBatch, "当前科类 · 全部批次")}</select><button class="button" data-action="gradient">按梯度预排</button></div><div><button class="button" data-action="export">导出完整清单</button><button class="button" data-action="import">导入</button><button class="button" data-action="migrate">导入旧版收藏</button><button class="button" data-action="print">打印</button></div></div>`;
  if (!state.saved.length) {
    $("#plan-workspace").innerHTML =
      `${controls}<div class="plan-empty"><span class="empty-orbit">✧</span><h3>还没有保存专业组</h3><p>在查询结果中关注专业组，之后可在这里选择专业、排序、添加备注和导出。</p><div><button class="button primary" data-route="explore">查询专业组</button><button class="button" data-action="migrate">导入第一代 / 第二代收藏</button></div></div>`;
    return;
  }
  const lines = scope.filter((i) => D.groups[i][G.r25] > 0),
    ranks = lines.map((i) => D.groups[i][G.r25]);
  if (pos.rank) ranks.push(pos.rank);
  const low = ranks.length ? Math.log(Math.min(...ranks) * 0.85) : 0,
    high = ranks.length ? Math.log(Math.max(...ranks) * 1.15) : 1,
    x = (r) => ((Math.log(r) - low) / (high - low)) * 100;
  const notes = [];
  if (d.mismatch.length)
    notes.push([
      "warn",
      `${d.mismatch.length} 个组与你的选科不匹配，请先核对并调整。`,
    ]);
  if (d.unknown.length)
    notes.push([
      "warn",
      `${d.unknown.length} 个组未提供有效选科要求，请查当年招生计划。`,
    ]);
  if (!pos.rank) notes.push(["warn", "定位输入无效，暂不评估志愿梯度。"]);
  if (d.capacity && scope.length > d.capacity)
    notes.push([
      "warn",
      `当前草稿有 ${scope.length} 个组，超过 2026 普通类本批次的 ${d.capacity} 个专业组志愿。`,
    ]);
  if (d.counts.none)
    notes.push(["", `${d.counts.none} 个组暂无线或无法对照，保留为待了解。`]);
  if (pos.rank && scope.length >= 8 && d.counts.bao < 3)
    notes.push(["warn", "当前保档选择较少，可以继续了解往年线更靠后的组。"]);
  if (
    pos.rank &&
    scope.length >= 8 &&
    d.counts.chong > d.counts.wen + d.counts.bao
  )
    notes.push(["warn", "当前冲档偏多，建议再比较稳档与保档选择。"]);
  if (!notes.length && scope.length)
    notes.push([
      "good",
      "已按当前科类和批次单独整理。顺序、专业偏好与备注仍由你决定。",
    ]);
  const savedById = new Map(state.saved.map((v) => [v.id, v]));
  $("#plan-workspace").innerHTML =
    `<h2 class="print-only">落点 · 志愿草稿</h2>${controls}<div class="plan-summary"><div class="plan-capacity"><span class="eyebrow">${trackName(p.track)} · ${esc(state.planBatch || "全部批次")}</span><strong>${scope.length}<small>${d.capacity ? " / " + d.capacity : " 个关注组"}</small></strong><div class="capacity-bar"><i style="width:${d.capacity ? Math.min(100, (scope.length / d.capacity) * 100) : 100}%"></i></div><p>${d.capacity ? '2026 普通类：45 个组，每组 6 个专业志愿。<a class="source-link" href="https://www.sceea.cn/Html/202604/Newsdetail_4767.html" target="_blank" rel="noopener">核对官方规定</a>' : "按批次分别整理；全部批次不混算志愿容量。"}</p></div><div class="plan-spectrum"><h3>志愿梯度</h3><div class="spectrum-counts">${["chong", "wen", "bao", "risk", "far", "none"].map((k) => `<div style="--band:${C.bands[k].color}">${C.bands[k].name}<strong>${d.counts[k]}</strong></div>`).join("")}</div><details class="plan-distribution"><summary>往年位次分布</summary><div class="spectrum-track">${lines.map((i) => `<i style="left:${x(D.groups[i][G.r25])}%;--band:${C.bands[band(i)].color}" title="${esc(D.schools[D.groups[i][0]].n)}，位次${D.groups[i][G.r25]}"></i>`).join("")}${pos.rank && ranks.length ? `<div class="spectrum-you" style="left:${x(pos.rank)}%"><span>你的位次</span></div>` : ""}<small>往年位次靠前</small><small>往年位次靠后</small></div></details></div></div><div class="plan-diagnosis">${notes.map(([kind, text]) => `<div class="diagnosis ${kind}">${esc(text)}</div>`).join("")}</div><p class="plan-other">完整工作台共 ${state.saved.length} 个组；当前显示 ${scope.length} 个。${state.saved.length - scope.length ? "其他科类或批次的关注仍已保存。" : ""} 可用手柄拖动或上下按钮排序。</p><div id="plan-list">${
      scope
        .map((i, n) => {
          const g = D.groups[i],
            s = D.schools[g[0]],
            entry = savedById.get(bkey(i)),
            ms = [...new Set(D.links[i].map((l) => l[0]))];
          return `<article class="plan-row" data-plan-key="${esc(entry.id)}"><button class="plan-grip" data-handle aria-label="拖动第${n + 1}项排序">⠿</button><span class="plan-number">${String(n + 1).padStart(2, "0")}</span><div class="plan-info"><h3><button data-group="${i}">${esc(s.n)} · 专业组 ${esc(g[4])}</button></h3><p>${trackName(g[1])} · ${esc(g[G.batch])} · ${esc(g[G.req] || "选科待核对")}<br>2025 组线 ${positive(g[G.s25])} 分 / 位次 ${positive(g[G.r25])} · ${esc(fee(g))}</p><div class="preferred-majors">${ms.map((m) => `<button data-prefer-major="${m}" data-key="${esc(entry.id)}" aria-pressed="${entry.majors.includes(m)}">${esc(D.dicts.major[m])}${entry.majors.includes(m) ? " ✓" : ""}</button>`).join("")}</div><div class="plan-note" data-print-note="${esc(entry.note)}"><label for="note-${i}">我的想法</label><input id="note-${i}" data-plan-note="${esc(entry.id)}" value="${esc(entry.note)}" maxlength="2000" placeholder="喜欢的理由，或还需要核对的问题…"></div></div><div class="plan-row-actions">${badge(i)}<button data-plan-move="${esc(entry.id)}" data-direction="-1" aria-label="上移第${n + 1}项" ${n === 0 ? "disabled" : ""}>↑</button><button data-plan-move="${esc(entry.id)}" data-direction="1" aria-label="下移第${n + 1}项" ${n === scope.length - 1 ? "disabled" : ""}>↓</button><button data-compare="${i}" aria-label="加入对比" aria-pressed="${state.compare.includes(i)}">≋</button><button data-save="${i}" aria-label="移除${esc(s.n)}专业组${esc(g[4])}" aria-pressed="true">×</button></div></article>`;
        })
        .join("") ||
      '<p class="note-box">这个科类与批次下暂无关注，其他关注均已保留。可以更换批次或首选科目。</p>'
    }</div>`;
  bindPlanDrag();
  syncActions();
}
function reorderScope(order) {
  const keys = new Set(order),
    items = new Map(state.saved.map((v) => [v.id, v]));
  let j = 0;
  state.saved = state.saved.map((v) =>
    keys.has(v.id) ? items.get(order[j++]) : v,
  );
  saveWorkbench();
}
function movePlan(id, direction) {
  const ids = $$("[data-plan-key]").map((el) => el.dataset.planKey),
    at = ids.indexOf(id),
    next = at + direction;
  if (at < 0 || next < 0 || next >= ids.length) return;
  [ids[at], ids[next]] = [ids[next], ids[at]];
  reorderScope(ids);
  renderPlan();
}
function gradient() {
  const p = { ...state.profile, rank: pos.rank },
    ids = C.scopedPlan(D, state.saved, p, state.planBatch);
  if (!ids.length) return toast("当前批次还没有可排序的关注组。");
  const order = { risk: 0, chong: 1, wen: 2, bao: 3, far: 4, none: 5 };
  ids.sort(
    (a, b) =>
      order[band(a)] - order[band(b)] ||
      (D.groups[a][G.r25] > 0 ? D.groups[a][G.r25] : Infinity) -
        (D.groups[b][G.r25] > 0 ? D.groups[b][G.r25] : Infinity),
  );
  reorderScope(ids.map(bkey));
  renderPlan();
  toast("已按往年位置预排，你可以继续调整顺序。");
}
function bindPlanDrag() {
  const list = $("#plan-list");
  if (!list) return;
  let dragged = null,
    pointerId = null,
    lastY = 0,
    moved = false;
  list.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-handle]");
    if (!handle || e.button !== 0) return;
    dragged = handle.closest("[data-plan-key]");
    pointerId = e.pointerId;
    lastY = e.clientY;
    moved = false;
    handle.setPointerCapture(e.pointerId);
    dragged.classList.add("dragging");
    e.preventDefault();
  });
  list.addEventListener("pointermove", (e) => {
    if (!dragged || e.pointerId !== pointerId) return;
    if (Math.abs(e.clientY - lastY) < 5) return;
    moved = true;
    lastY = e.clientY;
    const rows = $$("[data-plan-key]", list);
    for (const row of rows) {
      if (row === dragged) continue;
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        const after = e.clientY > r.top + r.height / 2;
        list.insertBefore(dragged, after ? row.nextSibling : row);
        break;
      }
    }
    if (e.clientY < 110) window.scrollBy(0, -12);
    if (e.clientY > innerHeight - 110) window.scrollBy(0, 12);
    $$(".plan-number", list).forEach(
      (el, n) => (el.textContent = String(n + 1).padStart(2, "0")),
    );
  });
  const finish = () => {
    if (!dragged) return;
    dragged.classList.remove("dragging");
    dragged = null;
    pointerId = null;
    if (moved) {
      reorderScope($$("[data-plan-key]", list).map((el) => el.dataset.planKey));
      renderPlan();
      toast("顺序已保存。");
    }
  };
  list.addEventListener("pointerup", finish);
  list.addEventListener("pointercancel", finish);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportWorkbench(format) {
  if (!state.saved.length && format !== "json")
    return toast(
      "工作台还是空的，先关注一些专业组；JSON 仍可备份未匹配的原记录。",
    );
  if (format === "json") {
    const payload = {
      format: "luodian-workbench-v3",
      version: 3,
      sourceVersion: D.sourceVersion,
      generated: D.generated,
      profile: state.profile,
      saved: state.saved,
      unmatched: store.read("luodian.v3.unmatched", []),
    };
    download(
      "落点V3_完整工作台.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
  } else if (format === "csv") {
    const cell = (v) => {
        let s = String(v ?? "");
        if (/^[=+@-]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      },
      rows = [
        [
          "顺序",
          "院校",
          "院校代码",
          "专业组",
          "科类",
          "批次",
          "选科要求",
          "2025组线",
          "2025最低位次",
          "2026计划",
          "四川填报学费",
          "偏好专业",
          "备注",
          "稳定标识",
        ],
      ];
    state.saved.forEach((v, n) => {
      const i = D.byKey.get(v.id),
        g = D.groups[i],
        s = D.schools[g[0]];
      rows.push([
        n + 1,
        s.n,
        s.code,
        g[4],
        trackName(g[1]),
        g[2],
        g[G.req] || "未提供",
        positive(g[G.s25]),
        positive(g[G.r25]),
        nf(g[G.plan]),
        fee(g),
        v.majors.map((m) => D.dicts.major[m]).join("、"),
        v.note,
        v.id,
      ]);
    });
    download(
      "落点V3_完整清单.csv",
      "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  } else {
    const lines = [
      "落点 V3 · 志愿探索草稿",
      `定位：${trackName(state.profile.track)} ${state.profile.value}${state.profile.mode === "rank" ? " 名" : " 分"}${state.profile.demo ? "（示例）" : ""}`,
      `再选科目：${state.profile.subjects.join("、") || "未设置"}`,
      "完整关注清单；不同科类、批次需分别正式填报。",
      "",
    ];
    state.saved.forEach((v, n) => {
      const i = D.byKey.get(v.id),
        g = D.groups[i],
        s = D.schools[g[0]];
      lines.push(
        `${String(n + 1).padStart(2, "0")}. ${s.n}（${s.code}）· 专业组 ${g[4]}`,
        `   ${trackName(g[1])} / ${g[2]} / ${g[3]} / 选科 ${g[G.req] || "未提供"}`,
        `   2025组线 ${positive(g[G.s25])}分，位次 ${positive(g[G.r25])}；2026计划 ${nf(g[G.plan])}人`,
        `   四川填报学费：${fee(g)}`,
        `   组内专业：${majors(i, 100)}`,
        `   偏好专业：${v.majors.map((m) => D.dicts.major[m]).join("、") || "未选择"}`,
        `   我的想法：${v.note || "未填写"}`,
        `   招生章程：${safeURL(s.charter) || "未提供"}`,
        "",
      );
    });
    lines.push(
      "数据生成时间：" + D.generated,
      "本表为探索草稿。往年组线不是专业录取保证；正式填报核对当年招生计划与章程。",
    );
    download(
      "落点V3_完整志愿草稿.txt",
      "\ufeff" + lines.join("\r\n"),
      "text/plain;charset=utf-8",
    );
  }
  toast("完整清单已导出。");
}
function openExport() {
  openModal(
    "导出志愿清单",
    "志愿清单",
    `<p>全部 ${state.saved.length} 个关注组都会保留，包含不同科类、批次、顺序、备注与专业偏好。</p><div class="modal-bottom" style="justify-content:flex-start;flex-wrap:wrap"><button class="button primary" data-export-format="text">文字草稿</button><button class="button" data-export-format="csv">表格 CSV</button><button class="button" data-export-format="json">完整备份 JSON</button></div><p class="fine-print">JSON 备份可再次导入，恢复顺序、备注与专业偏好。清单内容保存在当前浏览器，不随查询链接分享。</p>`,
  );
}
function mergeSaved(values) {
  const valid = C.normalizeSaved(values, D),
    existing = new Map(state.saved.map((v) => [v.id, v]));
  let added = 0;
  for (const v of valid) {
    if (existing.has(v.id)) {
      const old = existing.get(v.id);
      if (!old.note && v.note) old.note = v.note;
      else if (old.note && v.note && old.note !== v.note)
        rememberUnmatched([{ reason: "note_conflict", record: v }]);
      old.majors = [...new Set([...old.majors, ...v.majors])];
    } else {
      state.saved.push(v);
      existing.set(v.id, v);
      added++;
    }
  }
  saveWorkbench();
  renderPlan();
  return { added, valid: valid.length };
}
function rememberUnmatched(values) {
  const old = store.read("luodian.v3.unmatched", []);
  const unique = new Map(
    (Array.isArray(old) ? old : [])
      .concat(values)
      .map((value) => [JSON.stringify(value), value]),
  );
  store.write("luodian.v3.unmatched", [...unique.values()]);
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024)
    return toast("备份文件过大，请选择落点导出的 JSON 清单。");
  try {
    const payload = JSON.parse(await file.text());
    if (
      payload.format !== "luodian-workbench-v3" ||
      payload.version !== 3 ||
      !Array.isArray(payload.saved)
    )
      throw Error("请导入落点 V3 的完整备份 JSON。");
    const unresolved = payload.saved.filter((v) => !D.byKey.has(v?.id));
    if (unresolved.length) rememberUnmatched(unresolved);
    if (Array.isArray(payload.unmatched)) rememberUnmatched(payload.unmatched);
    const r = mergeSaved(payload.saved);
    openModal(
      "备份已整理到工作台。",
      "IMPORT / 导入结果",
      `<p>识别 ${r.valid} 个有效专业组，新增 ${r.added} 个；已有的备注和偏好会保留。</p>${unresolved.length ? `<p class="note-box warn" style="margin-top:15px">${unresolved.length} 条记录在当前数据中未匹配，原始内容已另行留存，并会包含在下次 JSON 备份中。请核对院校、科类、批次及专业组代码。</p>` : ""}`,
    );
  } catch (e) {
    toast(e.message);
  } finally {
    $("#import-file").value = "";
  }
}
function migrate() {
  const v2 = store.read("luodian.v2.saved", []),
    v1 = store.read("luodian.basket.v1", []),
    values = Array.isArray(v2) ? [...v2] : [],
    unmatched = [];
  if (Array.isArray(v1))
    for (const i of v1) {
      if (Number.isInteger(i) && D.keys[i]) values.push(D.keys[i]);
      else unmatched.push({ legacyVersion: 1, value: i });
    }
  for (const v of values)
    if (typeof v === "string" && !D.byKey.has(v))
      unmatched.push({ legacyVersion: 2, id: v });
  if (unmatched.length) rememberUnmatched(unmatched);
  const r = mergeSaved(values);
  toast(
    `已新增 ${r.added} 个旧版关注；旧版清单仍保留。${unmatched.length ? "未匹配条目已留存。" : ""}`,
  );
}
function openSubjects() {
  subjectDraft = [...state.profile.subjects];
  openModal(
    "设置再选科目",
    "科目设置",
    `<p>首选科目为${trackName(state.profile.track)}。选择两门再选科目，才能准确核验专业组的已知要求。</p><div id="subject-options" class="subject-options"></div><label class="filter-check" style="font-size:14px"><input id="subject-only-draft" type="checkbox" ${state.filters.subjectOnly ? "checked" : ""}>筛选时只看符合选科要求的组</label><div class="modal-bottom"><button class="button" data-action="subject-clear">清除</button><button class="button primary" data-action="subject-apply">确认选科</button></div>`,
  );
  renderSubjectOptions();
}
function renderSubjectOptions() {
  $("#subject-options").innerHTML = ["化学", "生物", "政治", "地理"]
    .map(
      (s) =>
        `<button data-subject="${s}" aria-pressed="${subjectDraft.includes(s)}">${s}${subjectDraft.includes(s) ? " ✓" : ""}</button>`,
    )
    .join("");
  $("#subject-only-draft").disabled = subjectDraft.length !== 2;
  if (subjectDraft.length !== 2) $("#subject-only-draft").checked = false;
}
function openFilters() {
  openModal(
    "筛选条件",
    "查询条件",
    `<div class="modal-filters">${filterMarkup("mobile")}</div><p class="fine-print">学费筛选按组内最高四川填报值；未知学费不当作免费。专业门类与专业类须属于同一条招生专业记录。</p><div class="modal-bottom"><button class="button" data-action="reset-modal">重置</button><button class="button primary" data-close>查看结果</button></div>`,
  );
}
function openDestinations() {
  destinationRegion = state.filters.region || "";
  openModal(
    "选择院校地区",
    "院校地区",
    `<p>按当前科类与批次统计专业组。选择目的地后，还可以继续按专业、学费和选科筛选。</p><div class="destination-regions" id="destination-regions"></div><div class="destination-grid" id="destination-grid"></div>`,
  );
  renderDestinations();
}
function renderDestinations() {
  const regions = [...new Set(D.schools.map((s) => s.reg).filter(Boolean))];
  $("#destination-regions").innerHTML =
    `<button data-destination-region="" class="${destinationRegion ? "" : "active"}">全国</button>` +
    regions
      .map(
        (r) =>
          `<button data-destination-region="${esc(r)}" class="${destinationRegion === r ? "active" : ""}">${esc(r)}</button>`,
      )
      .join("");
  const map = new Map();
  D.groups.forEach((g) => {
    const s = D.schools[g[0]];
    if (
      g[1] !== state.profile.track ||
      (state.filters.batch && g[2] !== state.filters.batch) ||
      (destinationRegion && s.reg !== destinationRegion)
    )
      return;
    map.set(s.prov, (map.get(s.prov) || 0) + 1);
  });
  $("#destination-grid").innerHTML = [...map]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([p, n]) =>
        `<button data-destination="${esc(p)}">${esc(p)}<small>${nf(n)} 个专业组</small></button>`,
    )
    .join("");
}
function openSettings() {
  openModal(
    "界面设置",
    "界面设置",
    `<div class="settings-row"><div><strong>界面主题</strong><p>浅色与深色均支持全部查询功能。</p></div><select data-setting="theme" aria-label="界面主题"><option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>深色</option><option value="light" ${state.settings.theme === "light" ? "selected" : ""}>浅色</option></select></div><div class="settings-row"><div><strong>动画强度</strong><p>尊重系统减少动态效果设置；界面过渡不会影响查询结果。</p></div><select data-setting="motion" aria-label="动画强度">${[
      ["auto", "跟随设备"],
      ["full", "界面过渡"],
      ["soft", "轻微过渡"],
      ["none", "关闭动画"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${state.settings.motion === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="settings-row"><div><strong>课堂白板</strong><p>放大文字、触摸目标和档案。</p></div><button class="button" data-action="stage">${state.settings.stage ? "退出演示" : "开启演示"}</button></div><div class="settings-row"><div><strong>复制当前查询</strong><p>分享相同的定位与筛选；不包含个人工作台。</p></div><button class="button" data-action="share">复制链接</button></div>`,
  );
}
function openHelp() {
  openModal(
    "使用指南",
    "使用指南",
    `<div class="help-grid">${[
      [
        "01",
        "填写分数与选科",
        "选择物理类或历史类，填写分数或位次，再选好两门科目。分数先用 2026 表换算位次。",
      ],
      [
        "02",
        "筛选专业组",
        "用地区、批次、学费与专业条件缩小范围。列表显示全部匹配记录；可展开组线分布图查看标注数量的采样。",
      ],
      [
        "03",
        "把专业看完整",
        "打开专业组，逐项了解专业线、学费、计划和报考备注。热门专业的门槛可能高于组线。",
      ],
      [
        "04",
        "整理自己的选择",
        "关注、对比、写备注、标记喜欢的专业，在工作台按科类和批次整理。你的顺序会保留，可以导出完整备份。",
      ],
    ]
      .map(
        ([n, t, p]) =>
          `<article><span class="step-number">${n}</span><h3>${t}</h3><p>${p}</p></article>`,
      )
      .join(
        "",
      )}</div><h3>冲稳保怎样来的？</h3><p>以“2025 组线位次 ÷ 你的位次”分档：0.77–0.95 为冲，0.95–1.18 为稳，1.18–1.67 为保；更靠前、靠后或缺少数据分别另列。它描述往年位置，不是概率预测。</p><h3>手机上的快捷操作</h3><p>底部导航切换入口；详情中向右滑动可逐层返回，也可以用返回按钮或系统返回。在分布图中点选查看专业组，分数滑杆可触摸调整。桌面按 / 搜索，按 ⌘/Ctrl K 快速查找。</p><h3>把年份与口径分开看</h3><p>2024、2023 旧文理数据只供历史参考。院校收费材料与四川招生考试报专业学费分别展示。缺失保持未知，不自动判成免费、新增或无资格。</p><div class="modal-bottom"><button class="button" data-action="data">查看数据与官方入口</button></div>`,
  );
}
async function openData() {
  const m = repository.manifest,
    c = m.coverage;
  openModal(
    "数据与来源",
    "数据与来源",
    `<p>这是本项目整理的招生数据快照，源数据版本 ${esc(D.sourceVersion)}，生成于 ${esc(new Date(D.generated).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))}（北京时间）。本次无损迁移保留原始字段与缺失值，不等于逐条重新验证官方原表。</p><div class="data-stats">${[
      ["院校记录", D.counts.schools],
      ["院校专业组", D.counts.groups],
      ["招生专业条目", D.counts.offerings],
      ["专业名称", D.counts.majors],
      ["院校档案", D.counts.archives],
      ["按需数据包", m.shards],
    ]
      .map(([t, n]) => `<div><strong>${nf(n)}</strong><span>${t}</span></div>`)
      .join(
        "",
      )}</div><h3>完整迁移，与原始缺失分开看</h3><p>全部 5 份源数据逐字段还原对照通过，迁移丢失记录 0、字段 0。原本缺少的信息仍明确标为未提供。</p>${[
      ["有2025组线的专业组", c.groupsWith2025Line, D.counts.groups],
      ["有选科要求的专业组", c.groupsWithRequirements, D.counts.groups],
      ["有招生章程入口的院校", c.schoolsWithCharter, D.counts.schools],
      [
        "有软科评级字段的专业条目",
        c.offeringRatingCoverage,
        D.counts.offerings,
      ],
    ]
      .map(
        ([t, n, total]) =>
          `<div class="data-coverage-row"><div><span>${t}</span><span>${nf(n)} / ${nf(total)}</span></div><i style="--coverage:${(n / total) * 100}%"><span></span></i></div>`,
      )
      .join(
        "",
      )}<h3>官方核验入口</h3><div id="official-resources"><a class="source-link" href="https://plan.sceea.cn/" target="_blank" rel="noopener">四川省教育考试院 · 2026 招生计划</a></div><p class="fine-print">补充了已核对的官方入口及 2026 普通类本科 B 段、高职批容量规则。未通过网络摘要改写录取分数、学费、资格或招生计划。正式填报核对当年考试院计划、招生章程和学校收费公示。</p><div class="modal-bottom" style="justify-content:flex-start;flex-wrap:wrap"><a class="button" href="./data/manifest.json" target="_blank" rel="noopener">查看迁移清单</a><button class="button" data-action="download-manifest">下载数据清单</button></div>`,
  );
  try {
    const r = await fetch("./resources.json"),
      data = await r.json();
    if ($("#official-resources"))
      $("#official-resources").innerHTML = data.resources
        .map(
          (s) =>
            `<p><a class="source-link" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a><br><small style="color:var(--faint);font-size:11px">${esc(s.publisher)} · ${esc(s.purpose)}</small></p>`,
        )
        .join("");
  } catch {}
}
function tagInfo(tag) {
  const t = D.tags[tag];
  openModal(
    t?.title || tag,
    "院校标签",
    t
      ? `<p>${esc(t.desc || "说明未提供")}</p>${t.caution ? `<p class="note-box" style="margin-top:15px">${esc(t.caution)}</p>` : ""}${safeURL(t.source) ? `<a class="source-link" href="${esc(safeURL(t.source))}" target="_blank" rel="noopener">查看标签来源</a>` : ""}`
      : "<p>源表保留了这个标签，但尚未提供可核对的解释。请结合院校官方信息了解。</p>",
  );
}
function openCommand() {
  showDialog($("#command-dialog"));
  $("#command-input").value = "";
  renderCommand("");
  setTimeout(() => $("#command-input").focus(), 30);
}
function renderCommand(q) {
  q = q.trim().toLowerCase();
  const actions = [
      ["explore", "专业组查询", "按分数、地区、专业查询"],
      ["majors", "专业查询", "从专业看哪些院校招你"],
      ["schools", "院校查询", "查看完整院校档案"],
      ["plan", "志愿工作台", "备注、偏好、排序与导出"],
    ],
    rows = [];
  if (q) {
    const schools = D.schools
      .map((s, i) => ({ s, i }))
      .filter(({ s }) =>
        (s.n + " " + s.code + " " + s.city).toLowerCase().includes(q),
      )
      .slice(0, 5);
    rows.push(
      ...schools.map(
        ({ s, i }) =>
          `<button class="command-item" data-command-school="${i}"><span class="command-icon">⌖</span><span><strong>${esc(s.n)}</strong><small>${esc(s.prov)} · ${esc(s.typ)} · 院校代码 ${esc(s.code)}</small></span></button>`,
      ),
    );
    const ms = D.dicts.major
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.toLowerCase().includes(q))
      .slice(0, 5);
    rows.push(
      ...ms.map(
        ({ n, i }) =>
          `<button class="command-item" data-command-major="${i}"><span class="command-icon">✧</span><span><strong>${esc(n)}</strong><small>从专业开始查询院校专业组</small></span></button>`,
      ),
    );
  }
  rows.push(
    ...actions
      .filter(([, n, d]) => !q || (n + d).includes(q))
      .map(
        ([route, n, d]) =>
          `<button class="command-item" data-command-route="${route}"><span class="command-icon">◈</span><span><strong>${n}</strong><small>${d}</small></span></button>`,
      ),
  );
  $("#command-results").innerHTML =
    rows.join("") ||
    '<div class="empty-state"><p>没有找到这个关键词，试试院校简称或专业名。</p></div>';
}
function chooseMajor(id) {
  state.filters.major = id;
  state.filters.q = "";
  $("#search").value = "";
  navigate("explore");
}
function reset() {
  state.filters = defaults();
  $("#search").value = "";
  $("#filters").innerHTML = filterMarkup();
  refresh();
}
function preset(name) {
  state.filters = defaults();
  if (name === "sichuan") state.filters.province = "四川";
  if (name === "public") {
    state.filters.own = "公办";
    state.filters.level = "本科";
  }
  if (name === "teacher") state.filters.type = "师范";
  if (name === "tech") state.filters.category = 0;
  if (name === "vocational") state.filters.batch = "高职(专科)批";
  if (name === "985") state.filters.tag = "985";
  $("#search").value = "";
  $("#filters").innerHTML = filterMarkup();
  navigate("explore");
}
async function share() {
  updateURL();
  try {
    await navigator.clipboard.writeText(location.href);
    toast("查询链接已复制，不包含工作台内容。");
  } catch {
    openModal(
      "复制这个查询链接。",
      "分享查询",
      `<p>定位、筛选条件和当前入口会分享，个人备注与工作台内容留在你的浏览器。</p><input style="width:100%;margin-top:20px;padding:12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:14px" readonly value="${esc(location.href)}" aria-label="当前查询链接">`,
    );
  }
}
function bind() {
  $("#distribution-panel").addEventListener("toggle", renderAtlas);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button,a,[data-group]");
    if (!b) return;
    if (b.hasAttribute("data-close")) {
      hideDialog(b.closest("dialog"));
      return;
    }
    if (b.dataset.commandSchool !== undefined) {
      hideDialog($("#command-dialog"));
      enterDetail("school", Number(b.dataset.commandSchool));
      return;
    }
    if (b.dataset.commandMajor !== undefined) {
      hideDialog($("#command-dialog"));
      chooseMajor(Number(b.dataset.commandMajor));
      return;
    }
    if (b.dataset.commandRoute) {
      hideDialog($("#command-dialog"));
      navigate(b.dataset.commandRoute);
      return;
    }
    if (b.dataset.route) {
      navigate(b.dataset.route);
      return;
    }
    if (b.dataset.track !== undefined) {
      state.profile.track = Number(b.dataset.track);
      state.profile.demo = false;
      $("#filters").innerHTML = filterMarkup();
      saveProfile();
      refresh();
      return;
    }
    if (b.dataset.tier !== undefined) {
      state.filters.tier = b.dataset.tier;
      refresh();
      return;
    }
    if (b.dataset.layout) {
      state.layout = b.dataset.layout;
      store.write("luodian.v3.layout", state.layout);
      renderResults();
      renderChips();
      updateURL();
      return;
    }
    if (b.dataset.group !== undefined) {
      enterDetail("group", Number(b.dataset.group));
      return;
    }
    if (b.dataset.school !== undefined) {
      enterDetail("school", Number(b.dataset.school));
      return;
    }
    if (b.dataset.major !== undefined) {
      chooseMajor(Number(b.dataset.major));
      return;
    }
    if (b.dataset.save !== undefined) {
      toggleSave(Number(b.dataset.save), b);
      return;
    }
    if (b.dataset.compare !== undefined) {
      toggleCompare(Number(b.dataset.compare));
      return;
    }
    if (b.dataset.preset) {
      preset(b.dataset.preset);
      return;
    }
    if (b.dataset.clearFilter) {
      const key = b.dataset.clearFilter;
      state.filters[key] = defaults()[key];
      if (key === "q") $("#search").value = "";
      $("#filters").innerHTML = filterMarkup();
      refresh();
      return;
    }
    if (b.dataset.subject) {
      const at = subjectDraft.indexOf(b.dataset.subject);
      if (at >= 0) subjectDraft.splice(at, 1);
      else if (subjectDraft.length < 2) subjectDraft.push(b.dataset.subject);
      else return toast("再选科目选择两门即可。");
      renderSubjectOptions();
      return;
    }
    if (b.dataset.destinationRegion !== undefined) {
      destinationRegion = b.dataset.destinationRegion;
      renderDestinations();
      return;
    }
    if (b.dataset.destination) {
      state.filters.province = b.dataset.destination;
      state.filters.region = "";
      $("#filters").innerHTML = filterMarkup();
      hideDialog($("#modal-dialog"));
      refresh();
      return;
    }
    if (b.dataset.exportFormat) {
      exportWorkbench(b.dataset.exportFormat);
      return;
    }
    if (b.dataset.planMove) {
      movePlan(b.dataset.planMove, Number(b.dataset.direction));
      return;
    }
    if (b.dataset.preferMajor !== undefined) {
      const entry = state.saved.find((v) => v.id === b.dataset.key),
        m = Number(b.dataset.preferMajor);
      if (!entry) return;
      const at = entry.majors.indexOf(m);
      if (at >= 0) entry.majors.splice(at, 1);
      else entry.majors.push(m);
      b.setAttribute("aria-pressed", String(at < 0));
      b.textContent = D.dicts.major[m] + (at < 0 ? " ✓" : "");
      saveWorkbench();
      return;
    }
    if (b.dataset.detailTab) {
      $$("[data-detail-tab]").forEach((x) =>
        x.setAttribute(
          "aria-selected",
          String(x.dataset.detailTab === b.dataset.detailTab),
        ),
      );
      $$("[data-detail-panel]").forEach(
        (x) => (x.hidden = x.dataset.detailPanel !== b.dataset.detailTab),
      );
      return;
    }
    if (b.dataset.tagInfo) {
      tagInfo(b.dataset.tagInfo);
      return;
    }
    if (b.dataset.retryGroup !== undefined) {
      detailToken++;
      renderGroupDetail(Number(b.dataset.retryGroup));
      return;
    }
    if (b.dataset.retrySchool !== undefined) {
      detailToken++;
      renderSchoolDetail(Number(b.dataset.retrySchool));
      return;
    }
    if (b.dataset.schoolFilter !== undefined) {
      const s = D.schools[Number(b.dataset.schoolFilter)];
      state.filters = { ...defaults(), batch: "", schoolCode: s.code };
      $("#search").value = "";
      $("#filters").innerHTML = filterMarkup();
      hideDialog($("#detail-dialog"), true);
      history.replaceState({ ldV3Page: true }, "", location.href);
      navigate("explore", true);
      $("#workspace").scrollIntoView({
        behavior: motion.active() ? "smooth" : "auto",
        block: "start",
      });
      return;
    }
    switch (b.dataset.action) {
      case "command":
        openCommand();
        break;
      case "subjects":
        openSubjects();
        break;
      case "settings":
        openSettings();
        break;
      case "help":
        openHelp();
        break;
      case "data":
        openData();
        break;
      case "filters":
        openFilters();
        break;
      case "destinations":
        openDestinations();
        break;
      case "subject-clear":
        subjectDraft = [];
        renderSubjectOptions();
        break;
      case "subject-apply":
        if (subjectDraft.length === 1) {
          toast("请选择两门再选科目，或清除选科。");
          break;
        }
        state.profile.subjects = [...subjectDraft];
        state.filters.subjectOnly =
          subjectDraft.length === 2 && $("#subject-only-draft").checked;
        hideDialog($("#modal-dialog"));
        saveProfile();
        $("#filters").innerHTML = filterMarkup();
        refresh();
        break;
      case "mode":
        state.profile.mode = state.profile.mode === "score" ? "rank" : "score";
        state.profile.value =
          state.profile.mode === "rank" ? (pos.rank ?? "") : (pos.score ?? "");
        state.profile.demo = false;
        saveProfile();
        refresh();
        $("#position-value").focus();
        break;
      case "plus":
      case "minus":
        state.profile.value = Math.max(
          1,
          (Number(state.profile.value) || 0) +
            (b.dataset.action === "plus" ? 1 : -1),
        );
        state.profile.demo = false;
        saveProfile();
        refresh();
        break;
      case "reset":
        reset();
        break;
      case "reset-modal":
        reset();
        openFilters();
        break;
      case "search-clear":
        state.filters.q = "";
        $("#search").value = "";
        refresh();
        $("#search").focus();
        break;
      case "more":
        state.limit += 24;
        renderResults(true);
        break;
      case "compare-open":
        if (state.compare.length < 2) toast("再选一个专业组，就可以并排比较。");
        else enterDetail("compare", null);
        break;
      case "compare-clear":
        state.compare = [];
        syncActions();
        break;
      case "detail-back":
        detailBack();
        break;
      case "gradient":
        gradient();
        break;
      case "export":
        openExport();
        break;
      case "import":
        $("#import-file").click();
        break;
      case "migrate":
        migrate();
        break;
      case "print":
        navigate("plan");
        window.print();
        break;
      case "share":
        share();
        break;
      case "download-manifest":
        download(
          "落点V3_数据迁移清单.json",
          JSON.stringify(repository.manifest, null, 2),
          "application/json;charset=utf-8",
        );
        break;
      case "stage":
        state.settings.stage = !state.settings.stage;
        applySettings();
        updateURL();
        if (
          $("#modal-dialog").open &&
          $("#modal-kicker").textContent === "界面设置"
        )
          openSettings();
        break;
      case "fullscreen":
        if (document.fullscreenElement)
          document.exitFullscreen().catch(() => {});
        else if (document.documentElement.requestFullscreen)
          document.documentElement
            .requestFullscreen()
            .catch(() => toast("浏览器未允许全屏，演示模式仍可使用。"));
        else toast("此浏览器不支持全屏，可以继续使用放大界面。");
        break;
      case "position-focus":
        $("#position-value").focus({ preventScroll: true });
        $(".position-deck").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        break;
      case "atlas-expand":
        openModal(
          "2025 专业组调档线分布",
          "组线分布",
          `<div class="atlas-plot" style="height:350px">${$("#atlas").innerHTML}</div><p class="fine-print">横轴为 2025 专业组调档分数，纵向按地域大区排列；图中点位是当前条件下的采样。完整结果在查询列表中。</p>`,
        );
        break;
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.filter) {
      state.filters[el.dataset.filter] =
        el.type === "checkbox" ? el.checked : el.value;
      $("#filters").innerHTML = filterMarkup();
      refresh();
    }
    if (el.dataset.setting) {
      state.settings[el.dataset.setting] = el.value;
      applySettings();
    }
    if (el.dataset.planNote) {
      const entry = state.saved.find((v) => v.id === el.dataset.planNote);
      if (entry) {
        entry.note = el.value;
        el.closest(".plan-note").dataset.printNote = el.value;
        saveWorkbench();
      }
    }
    if (el.id === "plan-batch") {
      state.planBatch = el.value;
      renderPlan();
    }
    if (el.id === "sort") {
      state.filters.sort = el.value;
      refresh();
    }
    if (el.id === "import-file") importFile(el.files[0]);
  });
  $("#position-value").addEventListener("input", (e) => {
    state.profile.value = e.target.value;
    state.profile.demo = false;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      saveProfile();
      refresh();
    }, 110);
  });
  $("#position-value").addEventListener("change", () => {
    // The input handler already schedules the query update. Re-rendering on
    // blur would replace a result button between pointerdown and click.
    saveProfile();
  });
  $("#score-range").addEventListener("input", (e) => {
    state.profile.value = Number(e.target.value);
    state.profile.demo = false;
    $("#position-value").value = e.target.value;
    const min = Number(e.target.min),
      max = Number(e.target.max);
    e.target.style.setProperty(
      "--progress",
      ((Number(e.target.value) - min) / (max - min)) * 100 + "%",
    );
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      saveProfile();
      refresh();
    }, 85);
  });
  $("#score-range").addEventListener("change", () => {
    clearTimeout(refreshTimer);
    saveProfile();
    refresh();
  });
  $("#search").addEventListener("input", (e) => {
    state.filters.q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refresh(), 150);
  });
  $("#command-input").addEventListener("input", (e) =>
    renderCommand(e.target.value),
  );
  let chartWidth = innerWidth,
    chartResize;
  window.addEventListener(
    "resize",
    () => {
      if (innerWidth === chartWidth) return;
      chartWidth = innerWidth;
      clearTimeout(chartResize);
      chartResize = setTimeout(() => renderAtlas(), 120);
    },
    { passive: true },
  );
  document.addEventListener("input", (e) => {
    if (e.target.id === "professional-search") {
      const q = e.target.value.trim().toLowerCase();
      $$("[data-professional]").forEach(
        (el) => (el.hidden = !el.dataset.professional.includes(q)),
      );
    }
    if (e.target.dataset.planNote) {
      const entry = state.saved.find((v) => v.id === e.target.dataset.planNote);
      if (entry) {
        entry.note = e.target.value;
        e.target.closest(".plan-note").dataset.printNote = e.target.value;
        clearTimeout(noteSaveTimer);
        noteSaveTimer = setTimeout(saveWorkbench, 250);
      }
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(noteSaveTimer);
    store.write("luodian.v3.workbench", state.saved);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommand();
    }
    if (
      e.key === "/" &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
      !$("dialog[open]")
    ) {
      e.preventDefault();
      if (state.route === "plan") navigate("explore");
      $("#search").focus();
      $("#search").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".star-dot")) {
      e.preventDefault();
      enterDetail("group", Number(e.target.dataset.group));
    }
    if (e.key === "ArrowDown" && $("#command-dialog").open) {
      e.preventDefault();
      const items = $$(".command-item"),
        at = items.indexOf(document.activeElement);
      items[Math.min(items.length - 1, at + 1)]?.focus();
    }
    if (e.key === "ArrowUp" && $("#command-dialog").open) {
      e.preventDefault();
      const items = $$(".command-item"),
        at = items.indexOf(document.activeElement);
      if (at <= 0) $("#command-input").focus();
      else items[at - 1].focus();
    }
  });
  $$("dialog").forEach((el) => {
    el.addEventListener("cancel", (e) => {
      e.preventDefault();
      hideDialog(el);
    });
    el.addEventListener("click", (e) => {
      if (e.target !== el) return;
      const r = el.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        hideDialog(el);
    });
  });
  window.addEventListener("popstate", () => {
    if (popupReturning) {
      popupReturning = false;
      if (history.state?.ldV3Popup && !popupLayer)
        history.replaceState({ ldV3Page: true }, "", url());
      if (pendingDetailHistory) {
        pendingDetailHistory = false;
        if (detailStack.length)
          try {
            history.pushState({ ldV3Dialog: true }, "", url());
            historyOwned = true;
          } catch {}
        else updateURL();
      } else updateURL();
      return;
    }
    if (popupLayer?.open) {
      const el = popupLayer;
      popupOwned = false;
      hideDialog(el, true);
      return;
    }
    if (detailStack.length) {
      historyOwned = false;
      if (detailStack.length > 1) {
        detailStack.pop();
        const top = detailStack.at(-1);
        enterDetail(top.type, top.id, true);
        try {
          history.pushState({ ldV3Dialog: true }, "", location.href);
          historyOwned = true;
        } catch {}
      } else hideDialog($("#detail-dialog"), true);
    } else {
      state.filters = defaults();
      restoreQuery(true);
      navigate(state.route, true);
    }
  });
  window.addEventListener("hashchange", () => {
    if (!detailStack.length) navigate(location.hash.slice(1), true);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "luodian.v3.workbench") {
      state.saved = C.normalizeSaved(store.read("luodian.v3.workbench", []), D);
      syncActions();
      if (state.route === "plan") renderPlan();
    }
  });
  const tooltip = (e) => {
    const star = e.target.closest(".star-dot");
    if (!star) {
      $("#atlas-tooltip").hidden = true;
      return;
    }
    const i = Number(star.dataset.group),
      g = D.groups[i],
      s = D.schools[g[0]],
      tip = $("#atlas-tooltip");
    tip.innerHTML = `${esc(s.n)} · ${esc(g[4])}<small>2025 ${positive(g[G.s25])} 分 · ${C.bands[band(i)].name}</small>`;
    tip.hidden = false;
    tip.style.left =
      Math.max(12, Math.min(innerWidth - 275, e.clientX + 12)) + "px";
    tip.style.top =
      Math.max(12, Math.min(innerHeight - 90, e.clientY + 14)) + "px";
  };
  $("#atlas").addEventListener("pointermove", tooltip, { passive: true });
  $("#atlas").addEventListener(
    "pointerleave",
    () => ($("#atlas-tooltip").hidden = true),
  );
  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderAtlas, 140);
    },
    { passive: true },
  );
  bindMobileGestures();
}
function bindMobileGestures() {
  const detail = $("#detail-dialog");
  let gesture = null;
  detail.addEventListener(
    "touchstart",
    (e) => {
      if (
        e.touches.length !== 1 ||
        e.target.closest("input,textarea,select,.compare-table-wrap")
      )
        return;
      const t = e.touches[0];
      gesture = { x: t.clientX, y: t.clientY, dx: 0, active: false };
    },
    { passive: true },
  );
  detail.addEventListener(
    "touchmove",
    (e) => {
      if (!gesture) return;
      const t = e.touches[0],
        dx = t.clientX - gesture.x,
        dy = t.clientY - gesture.y;
      if (!gesture.active && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (dx > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        gesture.active = true;
        gesture.dx = dx;
        if (e.cancelable) e.preventDefault();
        if (motion.active())
          detail.style.transform = `translateX(${Math.min(100, dx * 0.5)}px)`;
      }
    },
    { passive: false },
  );
  const finish = () => {
    if (!gesture) return;
    const back = gesture.active && gesture.dx > 90;
    gesture = null;
    detail.style.transform = "";
    if (back) detailBack();
  };
  detail.addEventListener("touchend", finish, { passive: true });
  detail.addEventListener(
    "touchcancel",
    () => {
      gesture = null;
      detail.style.transform = "";
    },
    { passive: true },
  );
  // Mobile keyboard and safe areas have their own layout lifecycle.
  if (window.visualViewport) {
    const keyboard = () => {
      const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
      document.body.classList.toggle(
        "keyboard-open",
        typing && innerHeight - visualViewport.height > 140,
      );
    };
    visualViewport.addEventListener("resize", keyboard, { passive: true });
    document.addEventListener("focusout", () => setTimeout(keyboard, 100));
  }
}
function restore() {
  const savedProfile = store.read("luodian.v3.profile", null);
  if (
    savedProfile &&
    [0, 1].includes(savedProfile.track) &&
    ["score", "rank"].includes(savedProfile.mode)
  ) {
    state.profile = {
      track: savedProfile.track,
      mode: savedProfile.mode,
      value: ["string", "number"].includes(typeof savedProfile.value)
        ? savedProfile.value
        : "",
      subjects: Array.isArray(savedProfile.subjects)
        ? [...new Set(savedProfile.subjects)]
            .filter((s) => ["化学", "生物", "政治", "地理"].includes(s))
            .slice(0, 2)
        : [],
      demo: savedProfile.demo === true,
    };
  }
  const savedRaw = store.read("luodian.v3.workbench", []);
  if (Array.isArray(savedRaw)) {
    const unmatched = savedRaw.filter(
      (v) => !D.byKey.has(typeof v === "string" ? v : v?.id),
    );
    if (unmatched.length) rememberUnmatched(unmatched);
  }
  state.saved = C.normalizeSaved(savedRaw, D);
  const prefs = store.read("luodian.v3.settings", {});
  if (["dark", "light"].includes(prefs.theme))
    state.settings.theme = prefs.theme;
  if (["auto", "full", "soft", "none"].includes(prefs.motion))
    state.settings.motion = prefs.motion;
  state.settings.stage = prefs.stage === true;
  state.layout =
    store.read("luodian.v3.layout", "list") === "cards" ? "cards" : "list";
  if (store.read("luodian.v3.interface", 0) < 1) {
    state.settings.theme = "light";
    state.settings.motion = "none";
    state.layout = "list";
    store.write("luodian.v3.interface", 1);
    store.write("luodian.v3.layout", "list");
  }
  restoreQuery();
}
function restoreQuery(clearMissing = false) {
  const p = new URLSearchParams(location.search);
  if (["0", "1"].includes(p.get("track")))
    state.profile.track = Number(p.get("track"));
  for (const mode of ["score", "rank"])
    if (p.has(mode)) {
      state.profile.mode = mode;
      state.profile.value = p.get(mode);
      state.profile.demo = p.get("demo") === "1";
    }
  if (p.has("subjects"))
    state.profile.subjects = [...new Set(p.get("subjects").split(","))]
      .filter((s) => ["化学", "生物", "政治", "地理"].includes(s))
      .slice(0, 2);
  else if (clearMissing) state.profile.subjects = [];
  for (const k of Object.keys(defaults()))
    if (p.has(k)) {
      if (["line", "subjectOnly"].includes(k))
        state.filters[k] = p.get(k) === "1";
      else state.filters[k] = p.get(k);
    }
  for (const [k, d] of [
    ["major", "major"],
    ["category", "cat"],
    ["class", "catc"],
  ])
    if (
      state.filters[k] !== "" &&
      (!/^\d+$/.test(state.filters[k]) || !D.dicts[d][Number(state.filters[k])])
    )
      state.filters[k] = "";
  if (state.filters.tier && !C.bands[state.filters.tier])
    state.filters.tier = "";
  if (!["close", "score", "fee", "plan", "school"].includes(state.filters.sort))
    state.filters.sort = "close";
  if (state.profile.subjects.length !== 2) state.filters.subjectOnly = false;
  if (p.has("stage")) state.settings.stage = p.get("stage") === "1";
  if (p.get("noanim") === "1") state.settings.motion = "none";
  if (["list", "cards"].includes(p.get("layout"))) state.layout = p.get("layout");
  else if (clearMissing) state.layout = "list";
  state.route = ["explore", "majors", "schools", "plan"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "explore";
}
async function init() {
  const direct = new URLSearchParams(location.search);
  try {
    D = C.prepare(await repository.init());
    restore();
    applySettings();
    $("#filters").innerHTML = filterMarkup();
    $("#search").value = state.filters.q;
    bind();
    navigate(state.route, true);
    const key = direct.get("group"),
      school = direct.get("school");
    if (key && D.byKey.has(key)) enterDetail("group", D.byKey.get(key));
    else if (school) {
      const i = D.schools.findIndex((s) => s.code === school);
      if (i >= 0) enterDetail("school", i);
    }
    window.LUODIAN_V3_READY = {
      schools: D.schools.length,
      groups: D.groups.length,
      offerings: D.counts.offerings,
      sourceVersion: D.sourceVersion,
    };
    console.info("[LUODIAN_V3_READY]", window.LUODIAN_V3_READY);
  } catch (e) {
    console.error(e);
    $("#results").setAttribute("aria-busy", "false");
    $("#results").innerHTML =
      `<div class="empty-state"><span>✧</span><h3>招生数据加载失败</h3><p>${esc(e.message)}</p><button class="button primary" onclick="location.reload()">重新加载</button><a class="button" href="../v2/">打开第二代</a></div>`;
    $("#results-count").textContent = "暂时无法读取数据";
    $("#atlas").innerHTML =
      '<div class="loading-orbit"><span>数据尚未就绪</span></div>';
    $("#position-note").textContent = "数据尚未就绪，请重试。";
  }
}
init();
