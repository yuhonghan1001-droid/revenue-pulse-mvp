import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render() {
  const worker = await loadWorker();
  return worker.fetch(
    new Request("https://revenue-pulse.example/", {
      headers: { accept: "text/html", host: "revenue-pulse.example" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Revenue Pulse product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /广告收入经营罗盘/);
  assert.match(html, /财务 BP 收入分析框架/);
  assert.match(html, /个数据源健康中心/);
  assert.match(html, /指标口径中心/);
  assert.match(html, /经营结论证据链/);
  assert.match(html, /自动推送预览/);
  assert.match(html, /revenue-pulse\.example\/og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("publishes governed dashboard data for every module", async () => {
  const dashboard = JSON.parse(
    await readFile(new URL("../app/data/dashboard.json", import.meta.url), "utf8"),
  );

  assert.equal(dashboard.meta.sourceCount, 24);
  assert.equal(dashboard.sourceHealth.length, 24);
  assert.equal(dashboard.healthSummary.healthy, 23);
  assert.equal(dashboard.healthSummary.warning, 1);
  assert.equal(dashboard.metricCatalog.length, 8);
  assert.equal(dashboard.evidenceChain.length, 4);
  assert.equal(dashboard.alertRules.length, 3);
  assert.equal(dashboard.revenueModel.lenses.length, 3);
  assert.equal(dashboard.revenueModel.knowledgeGaps.length, 3);
  assert.equal(
    dashboard.meta.timeProgressPct,
    Number(
      (
        (Number(dashboard.meta.asOf.slice(-2)) / dashboard.trend.length) *
        100
      ).toFixed(1),
    ),
  );
  assert.match(dashboard.pushPreview.title, new RegExp(dashboard.meta.asOfLabel));
  assert.equal(dashboard.meta.factRowCount, 27_408);

  for (const metric of dashboard.metricCatalog) {
    assert.ok(metric.id);
    assert.ok(metric.formula);
    assert.ok(metric.sourceIds.length > 0);
  }
});

test("serves one complete latest snapshot for every dashboard module", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://revenue-pulse.example/api/analysis/latest"),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.snapshot.meta.asOf, payload.brief.as_of.slice(0, 10));
  assert.ok(payload.snapshot.trend.length > 0);
  assert.ok(payload.snapshot.breakdowns.industry.length > 0);
  assert.equal(
    payload.snapshot.sourceHealth.length,
    payload.snapshot.meta.sourceCount,
  );
  assert.ok(payload.snapshot.metricCatalog.length > 0);
  assert.ok(payload.snapshot.evidenceChain.length > 0);
});
