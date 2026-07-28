import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalAnalysisInput,
  inferSemanticField,
  parseLocalFile,
} from "../lib/revenue-v3/local-file.ts";

const csv = `date,revenue,monetizable_vv,impressions,gmv,monthly_budget
2026-07-01,100,10000,1000,5000,900
2026-07-02,120,11000,1100,5200,900
2026-07-03,140,12000,1200,5500,900
2026-07-04,160,13000,1300,5800,900`;

test("CSV stays local, maps known fields, and ignores excluded input fields", async () => {
  const file = {
    name: "ad-operations.csv",
    text: async () => csv,
    arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  };
  const parsed = await parseLocalFile(file);
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.warnings.length, 1);
  assert.equal(inferSemanticField("monthly_budget"), "ignored_budget_field");
  const input = buildLocalAnalysisInput([parsed], "operating_ad_revenue");
  assert.equal(input.classification, "real");
  assert.equal(input.comparison.revenue, 220);
  assert.equal(input.current.revenue, 300);
  assert.equal(input.mappings.find((item) => item.sourceColumn === "monthly_budget").confirmed, true);
});

test("unconfirmed revenue basis blocks the revenue conclusion", async () => {
  const file = {
    name: "ad-operations.csv",
    text: async () => csv,
    arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  };
  const parsed = await parseLocalFile(file);
  const input = buildLocalAnalysisInput([parsed], "unconfirmed");
  assert.equal(input.quality.find((check) => check.id === "basis").status, "fail");
});
