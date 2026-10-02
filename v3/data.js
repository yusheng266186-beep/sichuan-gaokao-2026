/* Storage boundary: versioned, hash-verified release files; bounded shard cache. */
export class AdmissionsRepository {
  constructor() {
    this.catalog = null;
    this.manifest = null;
    this.metaPromise = null;
    this.cache = new Map();
    this.requests = new Map();
  }
  async verify(bytes, entry) {
    if (bytes.byteLength !== entry.bytes)
      throw Error("数据文件不完整，请刷新后重试。");
    if (globalThis.crypto?.subtle) {
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const hex = [...new Uint8Array(hash)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (hex !== entry.sha256)
        throw Error("数据版本已变化，请刷新后重新打开。");
    }
  }
  async init() {
    const [m, c] = await Promise.all([
      fetch("./data/manifest.json", { cache: "no-cache" }),
      fetch("./data/catalog.json", { cache: "no-cache" }),
    ]);
    if (!m.ok || !c.ok) throw Error("招生数据暂未加载成功，请检查网络后重试。");
    const manifest = await m.json(),
      bytes = await c.arrayBuffer();
    if (manifest.schemaVersion !== 3) throw Error("数据版本不匹配。");
    await this.verify(bytes, manifest.files["catalog.json"]);
    this.manifest = manifest;
    this.catalog = JSON.parse(new TextDecoder().decode(bytes));
    if (
      this.catalog.generated !== manifest.generated ||
      this.catalog.groups.length !== manifest.counts.groups ||
      this.catalog.schools.length !== manifest.counts.schools
    )
      throw Error("检索目录与数据清单不一致。");
    return this.catalog;
  }
  async file(path) {
    const entry = this.catalog.files[path];
    if (!entry) throw Error("这个数据包暂未提供。");
    const response = await fetch(
      "./data/" + path + "?v=" + entry.sha256.slice(0, 16),
      { cache: "force-cache" },
    );
    if (!response.ok) throw Error("详情数据读取失败，请重试。");
    const bytes = await response.arrayBuffer();
    await this.verify(bytes, entry);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async meta() {
    if (!this.metaPromise)
      this.metaPromise = this.file("meta.json")
        .then((m) => {
          if (
            m.gen !== this.catalog.generated ||
            m.v !== this.catalog.sourceVersion
          )
            throw Error("专业字典版本不一致。");
          return m;
        })
        .catch((e) => {
          this.metaPromise = null;
          throw e;
        });
    return this.metaPromise;
  }
  async school(index) {
    const path =
      "schools/" +
      String(Math.floor(index / this.catalog.shardSize)).padStart(2, "0") +
      ".json";
    if (this.cache.has(path)) {
      const value = this.cache.get(path);
      this.cache.delete(path);
      this.cache.set(path, value);
      return this.pick(value, index);
    }
    if (!this.requests.has(path))
      this.requests.set(
        path,
        this.file(path)
          .then((chunk) => {
            if (chunk.schemaVersion !== 3) throw Error("院校档案版本不一致。");
            const byGroup = new Map();
            for (const row of chunk.offerings) {
              const g = row[1];
              if (!byGroup.has(g)) byGroup.set(g, []);
              byGroup.get(g).push({ ordinal: row[0], row: row.slice(1) });
            }
            const value = {
              schools: new Map(
                chunk.schools.map(([i, school, archive]) => [
                  i,
                  { school, archive },
                ]),
              ),
              byGroup,
            };
            this.cache.set(path, value);
            if (this.cache.size > 8)
              this.cache.delete(this.cache.keys().next().value);
            return value;
          })
          .finally(() => this.requests.delete(path)),
      );
    return this.pick(await this.requests.get(path), index);
  }
  pick(chunk, index) {
    const record = chunk.schools.get(index);
    if (!record) throw Error("院校档案关联缺失。");
    return { ...record, byGroup: chunk.byGroup };
  }
}
