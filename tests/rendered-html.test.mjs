import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const v1Baseline = JSON.parse(
  await readFile(new URL("./fixtures/v1-baseline.json", import.meta.url), "utf8"),
);

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function workerEnv(overrides = {}) {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    ...overrides,
  };
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function render(overrides = {}) {
  const worker = await loadWorker();
  return worker.fetch(
    new Request("https://revenue-pulse.example/", {
      headers: { accept: "text/html", host: "revenue-pulse.example" },
    }),
    workerEnv(overrides),
    executionContext,
  );
}

test("server-renders the Revenue Pulse product", async () => {
  const response = await render({ ENABLE_AD_REVENUE_V3: "false" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  for (const heading of v1Baseline.page.headings) {
    assert.ok(html.includes(heading), `missing v1 page heading: ${heading}`);
  }
  assert.match(html, /revenue-pulse\.example\/og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("publishes governed dashboard data for every module", async () => {
  const dashboard = JSON.parse(
    await readFile(new URL("../app/data/dashboard.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(
    {
      asOf: dashboard.meta.asOf,
      sourceCount: dashboard.meta.sourceCount,
      factRowCount: dashboard.meta.factRowCount,
      demo: dashboard.meta.demo,
    },
    v1Baseline.dashboard.meta,
  );
  assert.deepEqual(
    {
      mtdRevenue: dashboard.kpis.mtdRevenue,
      yoy: dashboard.kpis.yoy,
      forecast: dashboard.kpis.forecast,
      dataHealth: dashboard.kpis.dataHealth,
    },
    v1Baseline.dashboard.kpis,
  );
  assert.deepEqual(dashboard.healthSummary, v1Baseline.dashboard.healthSummary);
  assert.deepEqual(
    {
      trend: dashboard.trend.length,
      industries: dashboard.breakdowns.industry.length,
      products: dashboard.breakdowns.product.length,
      traffic: dashboard.breakdowns.traffic.length,
      sourceHealth: dashboard.sourceHealth.length,
      metricCatalog: dashboard.metricCatalog.length,
      evidenceChain: dashboard.evidenceChain.length,
      alertRules: dashboard.alertRules.length,
      lenses: dashboard.revenueModel.lenses.length,
      knowledgeGaps: dashboard.revenueModel.knowledgeGaps.length,
    },
    v1Baseline.dashboard.moduleCounts,
  );
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
  assert.deepEqual(
    {
      audience: dashboard.pushPreview.audience,
      cadence: dashboard.pushPreview.cadence,
      channel: dashboard.pushPreview.channel,
      title: dashboard.pushPreview.title,
    },
    v1Baseline.feishuPreview,
  );

  for (const metric of dashboard.metricCatalog) {
    assert.ok(metric.id);
    assert.ok(metric.formula);
    assert.ok(metric.sourceIds.length > 0);
  }
});

test("serves one complete latest snapshot for every dashboard module", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request(`https://revenue-pulse.example${v1Baseline.api.latestPath}`),
    workerEnv({ ENABLE_AD_REVENUE_V3: "false" }),
    executionContext,
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

test("keeps v3 dark by default and exposes only the reviewed scaffold when enabled", async () => {
  const worker = await loadWorker();
  const request = () =>
    new Request(`https://revenue-pulse.example${v1Baseline.api.v3StatusPath}`);

  const defaultResponse = await worker.fetch(
    request(),
    workerEnv(),
    executionContext,
  );
  assert.equal(defaultResponse.status, 404);

  const disabledResponse = await worker.fetch(
    request(),
    workerEnv({ ENABLE_AD_REVENUE_V3: "false" }),
    executionContext,
  );
  assert.equal(disabledResponse.status, 404);

  const enabledResponse = await worker.fetch(
    request(),
    workerEnv({ ENABLE_AD_REVENUE_V3: "true" }),
    executionContext,
  );
  assert.equal(enabledResponse.status, 200);
  assert.deepEqual(await enabledResponse.json(), {
    ok: true,
    version: "v3",
    state: "scaffolded",
  });
});
