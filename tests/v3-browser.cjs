/* Run with Playwright installed. Starts its own local server; no deployment needed. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const shots = process.env.V3_SCREENSHOT_DIR;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const server = http.createServer((req, res) => {
  let filename = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!filename.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    if (fs.statSync(filename).isDirectory())
      filename = path.join(filename, "index.html");
    res.setHeader(
      "Content-Type",
      mime[path.extname(filename)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(filename));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const errors = [];
async function shot(page, name) {
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(shots, name + ".png") });
  }
}
async function closeDialog(page, id = "#detail-dialog") {
  await page
    .locator(id + " [data-close]")
    .first()
    .click();
  await page.waitForFunction((id) => !document.querySelector(id).open, id);
}
async function ready(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.LUODIAN_V3_READY);
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    doc: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.doc <= size.width + 1,
    label + " 页面横向溢出 " + JSON.stringify(size),
  );
}
async function launch() {
  const args = ["--no-sandbox"];
  if (process.env.V3_BROWSER_SINGLE_PROCESS === "1")
    args.push("--single-process", "--no-zygote", "--disable-gpu");
  return chromium.launch({
    headless: true,
    executablePath: process.env.V3_BROWSER_EXECUTABLE || undefined,
    args,
  });
}

async function workflow(width, base) {
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width, height: width === 390 ? 844 : 1000 },
    isMobile: width === 390,
    hasTouch: width === 390,
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const fetched = [];
  page.on("request", (r) => fetched.push(r.url()));
  try {
    await ready(page, base + "/v3/");
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#list-body tr").count(), 24);
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    assert.equal(await page.locator("#distribution-panel").evaluate((el) => el.open), false);
    assert.equal(
      fetched.some((u) => /data\/schools\//.test(u)),
      false,
      "首页不读取专业档案",
    );
    await noOverflow(page, width + " 首页");
    await shot(page, width + "-home");
    console.log(
      "ready",
      width,
      await page.evaluate(() => window.LUODIAN_V3_READY),
    );
    await page.locator("#position-value").fill("550");
    await page.waitForFunction(
      () => document.querySelector("#rank-value").textContent === "69,422",
    );
    assert.equal(
      await page.locator("#equivalent-value").textContent(),
      "546 分",
    );
    await page.locator("#position-value").fill("");
    await page.waitForFunction(
      () => document.querySelector("#rank-value").textContent === "—",
    );
    assert.equal(await page.locator("#equivalent-value").textContent(), "—");
    await page.locator("#position-value").fill("600");
    await page.waitForFunction(
      () => document.querySelector("#rank-value").textContent === "22,303",
    );
    await page.locator("[data-action=subjects]").click();
    await page.locator('[data-subject="化学"]').click();
    await page.locator('[data-subject="生物"]').click();
    await page.locator("#subject-only-draft").check();
    await page.locator("[data-action=subject-apply]").click();
    await page.waitForFunction(
      () => !document.querySelector("#modal-dialog").open,
    );
    assert.equal(
      await page.locator("#subject-label").textContent(),
      "化学 + 生物",
    );
    if (width === 390) {
      await page.locator("[data-action=filters]").click();
      await page
        .locator("#modal-dialog [data-filter=province]")
        .selectOption("四川");
      await shot(page, width + "-filters");
      await closeDialog(page, "#modal-dialog");
    } else
      await page
        .locator("#filters [data-filter=province]")
        .selectOption("四川");
    await page.locator("#workspace").scrollIntoViewIfNeeded();
    await noOverflow(page, width + " 查询");
    await shot(page, width + "-results");
    const selected = [];
    for (let n = 0; n < 3; n++) {
      const b = page.locator("#results [data-save]").nth(n);
      selected.push(await b.getAttribute("data-save"));
      await b.click();
    }
    assert.equal(await page.locator("#saved-count").textContent(), "3");
    for (let n = 0; n < 2; n++)
      await page.locator("#results [data-compare]").nth(n).click();
    await page.locator("[data-action=compare-open]").click();
    assert.equal(await page.locator(".compare-table thead th").count(), 3);
    await noOverflow(page, width + " 对比");
    await shot(page, width + "-compare");
    await closeDialog(page);
    await page.locator("#results .actions-cell [data-group]").first().click();
    await page.waitForSelector("#professional-content .major-detail");
    const title = await page.locator("#detail-title").textContent();
    await page.locator(".major-detail summary").first().click();
    assert.ok(await page.locator(".major-body").first().textContent());
    await page.locator("#detail-content [data-school]").last().click();
    await page.waitForSelector("#school-archive .archive-section");
    assert.equal(
      await page.locator("#school-archive .archive-section").count(),
      10,
    );
    await shot(page, width + "-school");
    await page.locator("[data-action=detail-back]").click();
    await page.waitForSelector("#professional-content .major-detail");
    assert.equal(await page.locator("#detail-title").textContent(), title);
    if (width === 390) {
      await page.evaluate(() => {
        const el = document.querySelector("#detail-dialog"),
          touch = (x) =>
            new Touch({ identifier: 1, target: el, clientX: x, clientY: 260 });
        el.dispatchEvent(
          new TouchEvent("touchstart", { touches: [touch(40)], bubbles: true }),
        );
        el.dispatchEvent(
          new TouchEvent("touchmove", {
            touches: [touch(220)],
            bubbles: true,
            cancelable: true,
          }),
        );
        el.dispatchEvent(
          new TouchEvent("touchend", {
            changedTouches: [touch(220)],
            bubbles: true,
          }),
        );
      });
      await page.waitForFunction(
        () => !document.querySelector("#detail-dialog").open,
      );
    } else {
      await page.goBack();
      await page.waitForFunction(
        () => !document.querySelector("#detail-dialog").open,
      );
    }
    await page.locator("[data-route=majors]").click();
    assert.ok(await page.locator("#results .major-card").count());
    await page.locator("[data-route=schools]").click();
    assert.ok(await page.locator("#results .school-card").count());
    await page.locator("[data-route=plan]").click();
    assert.equal(await page.locator(".plan-row").count(), 3);
    const first = await page
      .locator(".plan-row")
      .first()
      .getAttribute("data-plan-key");
    const note = "喜欢校园与数学专业 <保留原文>";
    await page.locator("[data-plan-note]").first().fill(note);
    await page.locator("[data-plan-note]").first().blur();
    await page.locator("[data-prefer-major]").first().click();
    await page.locator('[data-plan-move][data-direction="1"]').first().click();
    assert.equal(
      await page.locator(".plan-row").nth(1).getAttribute("data-plan-key"),
      first,
    );
    assert.equal(
      await page.locator("[data-plan-note]").nth(1).inputValue(),
      note,
    );
    await page.locator("[data-action=compare-clear]").click();
    const draggedKey = await page
      .locator(".plan-row")
      .first()
      .getAttribute("data-plan-key");
    await page
      .locator(".plan-row")
      .first()
      .evaluate((el) =>
        window.scrollTo({
          top: el.getBoundingClientRect().top + scrollY - 100,
          behavior: "instant",
        }),
      );
    const handle = await page.locator("[data-handle]").first().boundingBox(),
      target = await page.locator(".plan-row").nth(1).boundingBox();
    const x = handle.x + handle.width / 2,
      startY = handle.y + handle.height / 2,
      endY = target.y + target.height * 0.72;
    if (width === 390) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: startY }],
      });
      for (let n = 1; n <= 8; n++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: startY + ((endY - startY) * n) / 8 }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await page.mouse.move(x, startY);
      await page.mouse.down();
      await page.mouse.move(x, endY, { steps: 8 });
      await page.mouse.up();
    }
    assert.equal(
      await page.locator(".plan-row").nth(1).getAttribute("data-plan-key"),
      draggedKey,
      "手柄排序须生效",
    );
    const expectedOrder = await page
      .locator(".plan-row")
      .evaluateAll((els) => els.map((el) => el.dataset.planKey));
    await noOverflow(page, width + " 工作台");
    await shot(page, width + "-plan");
    await page.locator("[data-action=export]").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-export-format=json]").click();
    const backup = JSON.parse(
      fs.readFileSync(await (await downloadPromise).path(), "utf8"),
    );
    assert.equal(backup.saved.length, 3);
    assert.equal(backup.saved.find((v) => v.id === first).note, note);
    assert.ok(backup.saved.find((v) => v.id === first).majors.length);
    await closeDialog(page, "#modal-dialog");
    const importPayload = {
      ...backup,
      saved: [
        ...backup.saved,
        { id: "unknown|0|批次|类型|00", note: "未匹配也保留" },
      ],
    };
    await page.locator("#import-file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importPayload)),
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#modal-kicker").textContent ===
        "IMPORT / 导入结果",
    );
    assert.ok(
      (await page.locator("#modal-content").textContent()).includes("1 条记录"),
    );
    assert.ok(
      (
        await page.evaluate(() => localStorage.getItem("luodian.v3.unmatched"))
      ).includes("未匹配也保留"),
    );
    await closeDialog(page, "#modal-dialog");
    await page.reload();
    await page.waitForFunction(() => window.LUODIAN_V3_READY);
    assert.equal(await page.locator(".plan-row").count(), 3);
    assert.deepEqual(
      await page
        .locator(".plan-row")
        .evaluateAll((els) => els.map((el) => el.dataset.planKey)),
      expectedOrder,
    );
    assert.ok(
      (
        await page
          .locator("[data-plan-note]")
          .evaluateAll((els) => els.map((el) => el.value))
      ).includes(note),
    );
    await page.locator("[data-action=settings]").click();
    await page.locator("[data-setting=theme]").selectOption("dark");
    await page.locator("[data-setting=motion]").selectOption("none");
    await closeDialog(page, "#modal-dialog");
    await shot(page, width + "-dark");
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "dark",
    );
    await page.locator("[data-route=explore]").click();
    await page.locator("#distribution-panel summary").click();
    await page.waitForSelector("#atlas .star-dot");
    await noOverflow(page, width + " 分布图");
    await page.locator("#distribution-panel summary").click();
    await page.locator("#results .actions-cell [data-group]").first().click();
    await page.waitForSelector("#professional-content .major-detail");
    await closeDialog(page);
    await page.locator("[data-action=settings]").click();
    await page.locator("[data-setting=motion]").selectOption("full");
    await closeDialog(page, "#modal-dialog");
    await page.locator("[data-action=command]").click();
    await page.locator("#command-input").fill("北京大学");
    await page.locator("[data-command-school]").first().click();
    await page.waitForSelector("#school-archive .archive-section");
    await closeDialog(page);
    console.log(
      "PASS",
      width,
      "定位、筛选、专业/院校档案、对比、保存、排序、备注、偏好、导出导入、返回、主题",
    );
  } finally {
    await browser.close();
  }
}

async function viewportAndFailure(base) {
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await ready(page, base + "/v3/?noanim=1");
    for (const width of [320, 360, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page, width + " 初始布局");
      await page.locator("#results .actions-cell [data-group]").first().click();
      await page.waitForSelector("#professional-content .major-detail");
      await noOverflow(page, width + " 详情");
      await closeDialog(page);
      const regionAction = page.locator("[data-action=destinations]");
      if (await regionAction.isVisible()) await regionAction.click();
      else await page.locator("[data-action=filters]").click();
      await noOverflow(page, width + " 地区");
      await closeDialog(page, "#modal-dialog");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-action=filters]").click();
    await page.goBack();
    await page.waitForFunction(
      () => !document.querySelector("#modal-dialog").open,
    );
    await page.locator("#results .actions-cell [data-group]").first().click();
    await page.waitForSelector("#professional-content .major-detail");
    await page.locator("#detail-content [data-tag-info]").first().click();
    await page.goBack();
    await page.waitForFunction(
      () => !document.querySelector("#modal-dialog").open,
    );
    assert.equal(
      await page.locator("#detail-dialog").evaluate((el) => el.open),
      true,
      "标签的系统返回应保留底层档案",
    );
    await page.goBack();
    await page.waitForFunction(
      () => !document.querySelector("#detail-dialog").open,
    );
    await ready(page, base + "/v3/?noanim=1&school=5101");
    await page.waitForSelector("#school-archive .archive-section");
    await page.locator("[data-school-filter]").click();
    await page.waitForFunction(
      () => !document.querySelector("#detail-dialog").open,
    );
    assert.ok(
      (await page.locator("#results-count").textContent()).startsWith("39 "),
    );
    await page.locator("[data-layout=cards]").click();
    await page.locator("[data-action=more]").click();
    const cardIds = await page
      .locator("#results [data-card]")
      .evaluateAll((els) => els.map((el) => el.dataset.card));
    assert.equal(cardIds.length, 39);
    assert.equal(new Set(cardIds).size, 39, "最后一页不重复");
    await page.locator("[data-layout=list]").click();
    assert.equal(await page.locator("#list-body tr").count(), 39);
    const release = JSON.parse(
        fs.readFileSync(path.join(root, "v3/data/catalog.json")),
      ),
      g = release.groups.find((g) => g[7] === 0);
    const key = [release.schools[g[0]].code, g[1], g[2], g[3], g[4]].join("|");
    await ready(page, base + "/v3/?noanim=1&group=" + encodeURIComponent(key));
    await page.waitForSelector("#professional-content .major-detail");
    assert.equal(
      await page.locator(".detail-stat strong").nth(1).textContent(),
      "0",
      "源表 0 计划明确展示",
    );
    await closeDialog(page);
    await ready(page, base + "/v3/?noanim=1");
    await page.reload();
    await page.waitForFunction(() => window.LUODIAN_V3_READY);
    let fail = true;
    await page.route("**/data/schools/*.json*", (r) =>
      fail ? r.abort() : r.continue(),
    );
    await page.locator("#results .actions-cell [data-group]").first().click();
    await page.waitForSelector("[data-retry-group]");
    fail = false;
    await page.locator("[data-retry-group]").click();
    await page.waitForSelector("#professional-content .major-detail");
    await closeDialog(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator("#ambient").count(), 0);
    const orphan = {
      id: "unknown|0|批次|类型|00",
      note: "原始备注必须保留",
      majors: [999],
    };
    await page.addInitScript((record) => {
      localStorage.setItem("luodian.v3.workbench", JSON.stringify([record]));
      localStorage.removeItem("luodian.v3.unmatched");
    }, orphan);
    await ready(page, base + "/v3/?noanim=1#plan");
    await page.locator("[data-action=export]").click();
    const orphanDownload = page.waitForEvent("download");
    await page.locator("[data-export-format=json]").click();
    const orphanBackup = JSON.parse(
      fs.readFileSync(await (await orphanDownload).path(), "utf8"),
    );
    assert.deepEqual(orphanBackup.saved, []);
    assert.ok(
      orphanBackup.unmatched.some((record) =>
        JSON.stringify(record).includes(orphan.note),
      ),
      "只剩未匹配记录时仍能完整备份",
    );
    console.log(
      "PASS 320–1440px，无横向溢出；详情网络失败可重试；遵循减少动态效果",
    );
  } finally {
    await browser.close();
  }
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  if (process.env.V3_BROWSER_ONLY_EDGES !== "1") {
    await workflow(1440, base);
    await workflow(390, base);
  }
  await viewportAndFailure(base);
  assert.deepEqual(errors, [], "浏览器运行错误");
  console.log("V3 browser verification passed.");
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => server.close());
