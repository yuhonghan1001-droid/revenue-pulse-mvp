import assert from "node:assert/strict";
import test from "node:test";
import {
  REVENUE_CONTRACT_VERSION,
  supportsRequestedGrain,
  validateRevenueAnalysisInputV3,
} from "../lib/revenue-v3/contracts.ts";
import {
  exactShapleyMultiplicative,
  gmvMidpointBridge,
  trafficBaseBridge,
} from "../lib/revenue-v3/attribution.ts";
import { calculateMetrics, trafficRevenue } from "../lib/revenue-v3/metrics.ts";
import { runRevenueAnalysisV3 } from "../lib/revenue-v3/engine.ts";

const current = {
  start: "2026-07-01",
  end: "2026-07-27",
  label: "本期",
  revenue: 12600000,
  monetizableVv: 700000000,
  adLoad: 0.12,
  eCpm: 150,
  opportunities: 840000000,
  requests: 756000000,
  filledRequests: 680400000,
  impressions: 84000000,
  clicks: 1260000,
  actualAdSpend: 12600000,
  gmv: 630000000,
  attributedGmv: 75600000,
  dau: 19000000,
  activeAdvertisers: 8200,
  priorActiveAdvertisers: 8000,
  retainedAdvertisers: 6800,
  bounceRate: 0.224,
  averageDwellSeconds: 418,
  organicConversionRate: 0.037,
};

const comparison = {
  ...current,
  label: "上期",
  revenue: 10500000,
  monetizableVv: 650000000,
  adLoad: 0.11,
  eCpm: 146.85314685314685,
  opportunities: 780000000,
  requests: 694200000,
  filledRequests: 611000000,
  impressions: 71500000,
  clicks: 1001000,
  actualAdSpend: 10500000,
  gmv: 560000000,
  attributedGmv: 60900000,
  activeAdvertisers: 8000,
  priorActiveAdvertisers: 7600,
  retainedAdvertisers: 6384,
  bounceRate: 0.231,
  averageDwellSeconds: 401,
  organicConversionRate: 0.035,
};

const input = {
  contractVersion: REVENUE_CONTRACT_VERSION,
  classification: "demo",
  basis: "operating_ad_revenue",
  current,
  comparison,
  profiles: [],
  mappings: [],
  quality: [
    { id: "freshness", label: "及时性", status: "pass", path: "all", detail: "T+1" },
  ],
  slices: [],
  strategyEvents: [],
};

test("base traffic formula uses Ad Load once", () => {
  assert.equal(trafficRevenue(current), current.revenue);
  assert.equal(calculateMetrics(current, "operating_ad_revenue").fill_rate.value, 0.9);
});

test("missing and zero denominators are unavailable, never zero or NaN", () => {
  const metrics = calculateMetrics({ revenue: 12, gmv: 0 }, "operating_ad_revenue");
  assert.equal(metrics.ad_take_rate.status, "unavailable");
  assert.equal(metrics.ad_take_rate.value, null);
  assert.match(metrics.ad_take_rate.reason, /分母/);
});

test("negative input and banned fields fail validation", () => {
  const negative = structuredClone(input);
  negative.current.revenue = -1;
  assert.equal(validateRevenueAnalysisInputV3(negative).valid, false);
  assert.equal(
    validateRevenueAnalysisInputV3({ ...input, monthly_budget: 1 }).valid,
    false,
  );
});

test("Shapley and midpoint bridges reconcile exactly", () => {
  const shapley = exactShapleyMultiplicative([2, 3, 4], [3, 5, 2]);
  assert.ok(Math.abs(shapley.reduce((sum, value) => sum + value, 0) - 6) < 1e-9);
  assert.ok(Math.abs(trafficBaseBridge(comparison, current).residual) < 1e-8);
  assert.ok(Math.abs(gmvMidpointBridge(comparison, current).residual) < 1e-8);
});

test("coarse metrics cannot be requested at a finer dimension", () => {
  const result = supportsRequestedGrain(
    [
      {
        sourceId: "revenue",
        displayLabel: "收入",
        format: "aggregate",
        sourceRoles: ["ad_revenue"],
        rowCount: 1,
        timeGrain: "day",
        dimensionGrain: ["advertiser", "ad_format"],
        primaryKeyColumns: ["date", "advertiser", "ad_format"],
        currency: "CNY",
        timezone: "Asia/Shanghai",
      },
      {
        sourceId: "delivery",
        displayLabel: "交付",
        format: "aggregate",
        sourceRoles: ["ad_delivery"],
        rowCount: 1,
        timeGrain: "day",
        dimensionGrain: ["advertiser"],
        primaryKeyColumns: ["date", "advertiser"],
        currency: null,
        timezone: "Asia/Shanghai",
      },
    ],
    ["ad_revenue", "ad_delivery"],
    ["ad_format"],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /finer/);
});

test("quality failures block only their path", () => {
  const withGmvFailure = structuredClone(input);
  withGmvFailure.quality.push({
    id: "gmv_scope",
    label: "GMV 范围",
    status: "fail",
    path: "gmv_monetization",
    detail: "范围不一致",
  });
  const result = runRevenueAnalysisV3(withGmvFailure, {
    now: "2026-07-28T01:00:00.000Z",
  });
  assert.equal(
    result.pathAvailability.find((item) => item.id === "gmv_monetization").status,
    "blocked",
  );
  assert.equal(
    result.pathAvailability.find((item) => item.id === "traffic_monetization").status,
    "available",
  );
  assert.match(result.brief.summary, /不声明因果/);
});
