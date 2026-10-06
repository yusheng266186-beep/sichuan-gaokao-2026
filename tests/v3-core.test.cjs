const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../v3/core.js");
const release = C.prepare(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../v3/data/catalog.json"))),
);

test("2026 分数先换算位次，再对照 2025 等效分", () => {
  const p = C.position(release, 0, "score", 550);
  assert.equal(p.rank, 69422);
  assert.equal(p.lo, 68280);
  assert.equal(p.equivalent.score, 546);
  assert.equal(C.position(release, 1, "score", 600).rank, 4394);
  assert.equal(C.position(release, 0, "rank", 68280).score, 550);
});

test("无效分数和位次不被夹成合法值，未收录高分区间明确标注", () => {
  for (const value of ["", null, 0, -1, 600.5, "abc", 750]) {
    assert.equal(C.position(release, 0, "score", value).rank, null);
  }
  assert.equal(C.position(release, 0, "rank", 292427).rank, null);
  assert.equal(C.position(release, 0, "rank", 1).edge, true);
  assert.equal(C.position(release, 0, "score", 600).equivalent.edge, false);
});

test("冲稳保临界值与无有效组线分别处理", () => {
  for (const [line, expected] of [
    [769, "risk"],
    [770, "chong"],
    [949, "chong"],
    [950, "wen"],
    [1179, "wen"],
    [1180, "bao"],
    [1669, "bao"],
    [1670, "far"],
  ]) {
    assert.equal(C.tier(1000, line), expected);
  }
  assert.equal(C.tier(0, 1000), "none");
  assert.equal(C.tier(1000, -1), "none");
});

test("空选科要求保持未知，组合要求须全部满足", () => {
  assert.equal(C.subjectStatus("", ["化学", "生物"]), "unknown");
  assert.equal(C.subjectStatus("未知条件", ["化学", "生物"]), "unknown");
  assert.equal(C.subjectStatus("化学", []), "unset");
  assert.equal(C.subjectStatus("不限", []), "ok");
  assert.equal(C.subjectStatus("化学和生物", ["化学", "生物"]), "ok");
  assert.equal(C.subjectStatus("化学和生物", ["化学", "政治"]), "mismatch");
});

function fixture() {
  const g = (school, track, batch, code, maxFee) => [
    school,
    track,
    batch,
    "普通",
    code,
    code,
    2,
    10,
    1000,
    600,
    -1,
    -1,
    -1,
    -1,
    0,
    "不限",
    maxFee,
    maxFee,
    0,
    0,
    10,
    -1,
  ];
  return C.prepare({
    schemaVersion: 3,
    schools: [
      { code: "01", n: "甲大学", rk: 1, tag: [] },
      { code: "02", n: "乙大学", rk: -1, tag: [] },
    ],
    groups: [
      g(0, 0, "本科批B段", "001", 0),
      g(1, 0, "本科批B段", "002", -1),
      g(0, 1, "本科批B段", "003", 5000),
      g(0, 0, "提前批", "004", 5000),
    ],
    links: [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
      [[0, 0, 0]],
      [[0, 0, 0]],
      [[1, 1, 1]],
    ],
    dicts: { major: ["数学", "历史"] },
  });
}

test("专业门类、专业类和专业必须落在同一招生记录", () => {
  const d = fixture(),
    p = { track: 0, rank: 1000, subjects: [] };
  assert.deepEqual(C.query(d, { major: 0, category: 1 }, p), []);
  assert.deepEqual(
    C.query(d, { major: 1, category: 1, class: 1, batch: "本科批B段" }, p),
    [0],
  );
});

test("院校精确筛选按独立招生代码匹配，不混入字符串相近的代码", () => {
  const d = fixture(),
    p = { track: 0, rank: 1000, subjects: [] };
  assert.deepEqual(C.query(d, { schoolCode: "01" }, p), [0, 3]);
  assert.deepEqual(C.query(d, { schoolCode: "1" }, p), []);
});

test("0 元与未知学费分开筛选；未提供的院校排名排在已知排名之后", () => {
  const d = fixture(),
    p = { track: 0, rank: 1000, subjects: [] };
  assert.deepEqual(C.query(d, { fee: "5000", batch: "本科批B段" }, p), [0]);
  assert.deepEqual(
    C.query(d, { sort: "school", batch: "本科批B段" }, p),
    [0, 1],
  );
});

test("稳定专业组标识、备注和专业偏好按科类及批次保留", () => {
  const d = fixture(),
    saved = d.keys.map((id, i) => ({ id, note: "备注 " + i, majors: [] }));
  assert.equal(new Set(d.keys).size, d.groups.length);
  assert.deepEqual(C.scopedPlan(d, saved, { track: 0 }, "本科批B段"), [0, 1]);
  assert.deepEqual(C.scopedPlan(d, saved, { track: 1 }, "本科批B段"), [2]);
  assert.equal(
    C.diagnose(d, saved, { track: 0, rank: 1000, subjects: [] }, "提前批")
      .capacity,
    null,
  );
  assert.equal(
    C.diagnose(d, saved, { track: 0, rank: 1000, subjects: [] }, "本科批B段")
      .capacity,
    45,
  );
  assert.equal(saved.length, 4);
  const normalized = C.normalizeSaved(
    [
      { id: d.keys[0], note: "原始备注", majors: [0, 0, 1, 999] },
      d.keys[0],
      { id: "absent" },
    ],
    d,
  );
  assert.deepEqual(normalized, [
    { id: d.keys[0], note: "原始备注", majors: [0, 1] },
  ]);
});

test("完整目录关系闭合，全部招生专业与学校档案按原序号保留", () => {
  const dir = path.join(__dirname, "../v3/data"),
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
  const offeringOrdinals = new Set(),
    schoolOrdinals = new Set(),
    groupCounts = Array(release.groups.length).fill(0);
  for (const filename of Object.keys(manifest.files).filter((f) =>
    f.startsWith("schools/"),
  )) {
    const chunk = JSON.parse(fs.readFileSync(path.join(dir, filename)));
    for (const [ordinal, s, archive] of chunk.schools) {
      assert.equal(s.code, release.schools[ordinal].code);
      assert.equal(typeof archive, "string");
      assert.equal(schoolOrdinals.has(ordinal), false);
      schoolOrdinals.add(ordinal);
    }
    for (const [ordinal, ...o] of chunk.offerings) {
      assert.equal(o.length, 30);
      assert.equal(offeringOrdinals.has(ordinal), false);
      offeringOrdinals.add(ordinal);
      groupCounts[o[0]]++;
    }
  }
  assert.equal(offeringOrdinals.size, 51878);
  assert.equal(schoolOrdinals.size, 2308);
  release.groups.forEach((g, i) =>
    assert.equal(groupCounts[i], g[C.G.n], "专业组条目数 " + i),
  );
  assert.equal(release.byKey.size, 12275);
});
