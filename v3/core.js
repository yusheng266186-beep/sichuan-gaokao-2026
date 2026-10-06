/* V3 deterministic admissions rules. No network, DOM or admission probabilities. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LuodianV3 = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const G = {
    school: 0,
    track: 1,
    batch: 2,
    type: 3,
    code: 4,
    compound: 5,
    n: 6,
    plan: 7,
    r25: 8,
    s25: 9,
    r24: 10,
    s24: 11,
    r23: 12,
    s23: 13,
    source: 14,
    req: 15,
    feeMin: 16,
    feeMax: 17,
    newCount: 18,
    conflict: 19,
    admit25: 20,
    admit24: 21,
  };
  const O = {
    group: 0,
    code: 1,
    major: 2,
    note: 3,
    category: 4,
    class: 5,
    plan: 6,
    feeText: 7,
    feeAmount: 8,
    s25: 9,
    r25: 10,
    s24: 11,
    r24: 12,
    s23: 13,
    r23: 14,
    newFlag: 15,
    feeScope: 16,
    officialMin: 17,
    officialMax: 18,
    feeExcerpt: 19,
    feeURL: 20,
    level: 21,
    rating: 22,
    ranking: 23,
    assessment: 24,
    specialty: 25,
    master: 26,
    doctor: 27,
    publisher: 28,
    kind: 29,
  };
  const tracks = ["PHYSICS", "HISTORY"];
  const bands = {
    chong: {
      name: "冲一冲",
      short: "冲",
      color: "#bd5b3b",
      description: "往年组线位次更靠前",
    },
    wen: {
      name: "稳一稳",
      short: "稳",
      color: "#356bb3",
      description: "与你的位次接近",
    },
    bao: {
      name: "保一保",
      short: "保",
      color: "#258065",
      description: "往年组线位次更靠后",
    },
    risk: {
      name: "差距较大",
      short: "远",
      color: "#7c62a2",
      description: "往年组线明显靠前",
    },
    far: {
      name: "更多余量",
      short: "余",
      color: "#738093",
      description: "往年组线明显靠后",
    },
    none: {
      name: "待了解",
      short: "待",
      color: "#738093",
      description: "暂无有效位次对照",
    },
  };
  function tier(rank, line) {
    if (!(rank > 0) || !(line > 0)) return "none";
    const r = line / rank;
    return r >= 1.67
      ? "far"
      : r >= 1.18
        ? "bao"
        : r >= 0.95
          ? "wen"
          : r >= 0.77
            ? "chong"
            : "risk";
  }
  function scoreAtRank(dist, rank) {
    if (
      !dist?.rows?.length ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > dist.rows.at(-1)[2]
    )
      return null;
    const rows = dist.rows;
    let lo = 0,
      hi = rows.length - 1,
      found = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (rows[m][2] >= rank) {
        found = m;
        hi = m - 1;
      } else lo = m + 1;
    }
    return {
      score: rows[found][0],
      edge: found === 0 && rank < rows[0][3],
      lo: rows[found][3],
      hi: rows[found][4],
    };
  }
  function position(data, track, mode, value) {
    const d = data.dist["2026|" + tracks[track]],
      old = data.dist["2025|" + tracks[track]];
    if (value === "" || value == null)
      return { rank: null, error: "输入你的分数或位次，重新定位。" };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1)
      return { rank: null, error: "请输入有效的正整数。" };
    if (!d?.rows?.length)
      return { rank: null, error: "这个科类的一分一段表暂未提供。" };
    let rank,
      score,
      lo,
      hi,
      edge = false;
    if (mode === "rank") {
      const point = scoreAtRank(d, n);
      if (!point)
        return {
          rank: null,
          error: `位次应在 1–${d.rows.at(-1)[2].toLocaleString("zh-CN")} 之间。`,
        };
      rank = n;
      score = point.score;
      lo = point.lo;
      hi = point.hi;
      edge = point.edge;
    } else {
      const row = d.rows.find((r) => r[0] === n);
      if (!row)
        return {
          rank: null,
          error: `当前表收录 ${d.rows.at(-1)[0]}–${d.rows[0][0]} 分；未收录分数请改用准确位次。`,
        };
      score = n;
      rank = row[2];
      lo = row[3];
      hi = row[4];
    }
    return {
      rank,
      score,
      lo,
      hi,
      edge,
      equivalent: scoreAtRank(old, rank),
      error: null,
    };
  }
  function subjectStatus(raw, subjects) {
    if (!raw) return "unknown";
    if (raw === "不限") return "ok";
    const needs = raw.split("和").map((x) => x.trim());
    if (needs.some((s) => !["化学", "生物", "政治", "地理"].includes(s)))
      return "unknown";
    if (subjects.length !== 2) return "unset";
    return needs.every((s) => subjects.includes(s)) ? "ok" : "mismatch";
  }
  function groupKey(s, g) {
    return [s.code, g[1], g[2], g[3], g[4]].join("|");
  }
  function prepare(data) {
    if (data.schemaVersion !== 3) throw Error("数据结构版本与界面不匹配。");
    data.keys = [];
    data.byKey = new Map();
    data.schoolGroups = data.schools.map(() => []);
    data.majorGroups = data.dicts.major.map(() => []);
    data.search = data.groups.map((g, i) => {
      const s = data.schools[g[0]],
        key = groupKey(s, g);
      if (data.byKey.has(key)) throw Error("专业组标识重复。");
      data.keys.push(key);
      data.byKey.set(key, i);
      data.schoolGroups[g[0]].push(i);
      for (const m of new Set(data.links[i].map((l) => l[0])))
        data.majorGroups[m].push(i);
      return [
        s.n,
        s.code,
        s.city,
        s.prov,
        s.reg,
        s.aff,
        s.typ,
        ...(s.tag || []),
        g[4],
        g[5],
        ...data.links[i].map((l) => data.dicts.major[l[0]]),
      ]
        .join(" ")
        .toLowerCase();
    });
    return data;
  }
  function query(data, f, p) {
    const q = (f.q || "").trim().toLowerCase().split(/\s+/).filter(Boolean),
      rows = [];
    for (let i = 0; i < data.groups.length; i++) {
      const g = data.groups[i],
        s = data.schools[g[0]];
      if (g[1] !== p.track) continue;
      if (f.schoolCode && s.code !== f.schoolCode) continue;
      if (
        (f.batch && g[2] !== f.batch) ||
        (f.province && s.prov !== f.province) ||
        (f.region && s.reg !== f.region) ||
        (f.own && s.own !== f.own) ||
        (f.level && s.lvl !== f.level) ||
        (f.type && s.typ !== f.type)
      )
        continue;
      if (f.tag && !(s.tag || []).includes(f.tag)) continue;
      if (f.fee && !(g[G.feeMax] >= 0 && g[G.feeMax] <= Number(f.fee)))
        continue;
      if (f.line && !(g[G.r25] > 0)) continue;
      if (f.subjectOnly && subjectStatus(g[G.req], p.subjects) !== "ok")
        continue;
      if (q.some((word) => !data.search[i].includes(word))) continue;
      if (
        f.scoreFrom !== "" &&
        f.scoreFrom != null &&
        (!(g[G.s25] > 0) || g[G.s25] < Number(f.scoreFrom))
      )
        continue;
      if (
        f.scoreTo !== "" &&
        f.scoreTo != null &&
        (!(g[G.s25] > 0) || g[G.s25] >= Number(f.scoreTo))
      )
        continue;
      if (
        ((f.major !== "" && f.major != null) ||
          (f.category !== "" && f.category != null) ||
          (f.class !== "" && f.class != null)) &&
        !data.links[i].some(
          (l) =>
            (f.major === "" || f.major == null || l[0] === Number(f.major)) &&
            (f.category === "" ||
              f.category == null ||
              l[1] === Number(f.category)) &&
            (f.class === "" || f.class == null || l[2] === Number(f.class)),
        )
      )
        continue;
      if (f.tier && tier(p.rank, g[G.r25]) !== f.tier) continue;
      rows.push(i);
    }
    const close = (g) =>
      p.rank > 0 && g[G.r25] > 0
        ? Math.abs(Math.log(g[G.r25] / p.rank))
        : Infinity;
    const schoolRank = (i) => {
      const n = data.schools[data.groups[i][0]].rk;
      return n > 0 ? n : 99999;
    };
    const tie = (a, b) => schoolRank(a) - schoolRank(b) || a - b;
    rows.sort((a, b) => {
      const x = data.groups[a],
        y = data.groups[b];
      if (f.sort === "score")
        return (
          (y[G.s25] > 0 ? y[G.s25] : -1) - (x[G.s25] > 0 ? x[G.s25] : -1) ||
          tie(a, b)
        );
      if (f.sort === "fee")
        return (
          (x[G.feeMax] >= 0 ? x[G.feeMax] : Infinity) -
            (y[G.feeMax] >= 0 ? y[G.feeMax] : Infinity) || tie(a, b)
        );
      if (f.sort === "plan") return y[G.plan] - x[G.plan] || tie(a, b);
      if (f.sort === "school") return tie(a, b);
      return close(x) - close(y) || tie(a, b);
    });
    return rows;
  }
  function scopedPlan(data, saved, p, batch) {
    return saved
      .map((x) => data.byKey.get(x.id))
      .filter(
        (i) =>
          i !== undefined &&
          data.groups[i][1] === p.track &&
          (!batch || data.groups[i][2] === batch),
      );
  }
  function diagnose(data, saved, p, batch) {
    const ids = scopedPlan(data, saved, p, batch),
      counts = Object.fromEntries(Object.keys(bands).map((k) => [k, 0]));
    const mismatch = [],
      unknown = [];
    for (const i of ids) {
      const g = data.groups[i];
      counts[tier(p.rank, g[G.r25])]++;
      const status = subjectStatus(g[G.req], p.subjects);
      if (status === "mismatch") mismatch.push(i);
      if (status === "unknown") unknown.push(i);
    }
    return {
      ids,
      counts,
      mismatch,
      unknown,
      // 四川省教育考试院 2026 年招生规定，普通类本科 B 段及高职批。
      capacity: ["本科批B段", "高职(专科)批"].includes(batch) ? 45 : null,
    };
  }
  function normalizeSaved(values, data) {
    if (!Array.isArray(values)) return [];
    const seen = new Set(),
      out = [];
    for (const value of values) {
      const id = typeof value === "string" ? value : value?.id;
      if (!data.byKey.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        note: typeof value?.note === "string" ? value.note.slice(0, 2000) : "",
        majors: Array.isArray(value?.majors)
          ? [...new Set(value.majors)].filter(
              (x) =>
                Number.isInteger(x) &&
                data.links[data.byKey.get(id)].some((l) => l[0] === x),
            )
          : [],
      });
    }
    return out;
  }
  return {
    G,
    O,
    tracks,
    bands,
    tier,
    scoreAtRank,
    position,
    subjectStatus,
    groupKey,
    prepare,
    query,
    scopedPlan,
    diagnose,
    normalizeSaved,
  };
});
