import type {
  ClaimV3,
  GovernedMetricV3,
  PathAvailabilityV3,
  QualityStatus,
  RevenueAnalysisInputV3,
  RevenueAnalysisResultV3,
  RevenueBasis,
} from "./contracts.ts";
import {
  REVENUE_CONTRACT_VERSION,
  validateRevenueAnalysisInputV3,
} from "./contracts.ts";
import {
  expandedTrafficBridge,
  gmvMidpointBridge,
  trafficBaseBridge,
} from "./attribution.ts";
import { calculateMetrics } from "./metrics.ts";

const BASIS_LABELS: Record<RevenueBasis, string> = {
  operating_ad_revenue: "广告经营收入",
  advertiser_spend: "广告实际消耗",
  billable_amount: "可计费金额",
  financial_close_revenue: "月结实际收入",
  other: "其他收入口径",
  unconfirmed: "口径待确认",
};

function metricAvailable(metric: GovernedMetricV3) {
  return metric.status === "available" || metric.status === "warning";
}

function qualityForPath(
  input: RevenueAnalysisInputV3,
  id: PathAvailabilityV3["id"],
) {
  return input.quality.filter((check) => check.path === "all" || check.path === id);
}

function path(
  input: RevenueAnalysisInputV3,
  id: PathAvailabilityV3["id"],
  label: string,
  requiredMetrics: GovernedMetricV3[],
): PathAvailabilityV3 {
  const checks = qualityForPath(input, id);
  const failed = checks.find((check) => check.status === "fail");
  if (failed) return { id, label, status: "blocked", reason: failed.detail };
  const unavailable = requiredMetrics.find((metric) => !metricAvailable(metric));
  if (unavailable) {
    return { id, label, status: "unavailable", reason: unavailable.reason };
  }
  const warning = checks.find((check) => check.status === "warn");
  return warning
    ? { id, label, status: "warning", reason: warning.detail }
    : { id, label, status: "available" };
}

function overallQuality(input: RevenueAnalysisInputV3): QualityStatus {
  if (input.quality.some((check) => check.status === "fail")) return "fail";
  if (input.quality.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function cny(value: number) {
  return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value)}`;
}

function buildClaims(
  input: RevenueAnalysisInputV3,
  current: Record<string, GovernedMetricV3>,
  comparison: Record<string, GovernedMetricV3>,
): ClaimV3[] {
  const claims: ClaimV3[] = [];
  const revenue = current.revenue;
  const previousRevenue = comparison.revenue;
  if (metricAvailable(revenue) && metricAvailable(previousRevenue)) {
    const change = (revenue.value! - previousRevenue.value!) / previousRevenue.value!;
    claims.push({
      id: "revenue_change",
      text: `${input.current.label}${BASIS_LABELS[input.basis]}为${cny(revenue.value!)}，较${input.comparison.label}${pct(change)}。`,
      status: "fact",
      metricIds: ["revenue"],
      sourceIds: revenue.evidence,
    });
  }
  for (const metricId of ["ad_load", "ecpm", "ad_take_rate", "advertiser_roi"]) {
    const currentMetric = current[metricId];
    const previousMetric = comparison[metricId];
    if (!metricAvailable(currentMetric) || !metricAvailable(previousMetric)) continue;
    const denominator = previousMetric.value!;
    if (denominator === 0) continue;
    claims.push({
      id: `${metricId}_change`,
      text: `${currentMetric.label}较${input.comparison.label}${pct((currentMetric.value! - denominator) / denominator)}。`,
      status: "observation",
      metricIds: [metricId],
      sourceIds: [...new Set([...currentMetric.evidence, ...previousMetric.evidence])],
    });
  }
  if (input.basis === "unconfirmed") {
    claims.push({
      id: "basis_pending",
      text: "收入口径尚未确认，不能形成收入结论。",
      status: "pending_confirmation",
      metricIds: ["revenue"],
      sourceIds: [],
    });
  }
  return claims;
}

export function runRevenueAnalysisV3(
  input: RevenueAnalysisInputV3,
  options: { now?: string; analysisId?: string } = {},
): RevenueAnalysisResultV3 {
  const validation = validateRevenueAnalysisInputV3(input);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const metrics = calculateMetrics(input.current, input.basis);
  const comparisonMetrics = calculateMetrics(input.comparison, input.basis);
  const traffic = path(input, "traffic_monetization", "流量变现", [
    metrics.revenue,
    metrics.monetizable_vv,
    metrics.ad_load,
    metrics.ecpm,
  ]);
  const gmv = path(input, "gmv_monetization", "GMV 变现", [
    metrics.revenue,
    metrics.gmv,
    metrics.ad_take_rate,
  ]);
  const advertiser = path(input, "advertiser_health", "广告主健康", [
    metrics.advertiser_roi,
    metrics.advertiser_retention,
  ]);
  const guardrail = path(input, "experience_guardrails", "体验护栏", [
    metrics.bounce_rate,
    metrics.average_dwell_seconds,
    metrics.organic_conversion_rate,
  ]);
  const claims = buildClaims(input, metrics, comparisonMetrics);
  const headline =
    claims.find((claim) => claim.id === "revenue_change")?.text ??
    "收入结论暂不可用，请先补齐数据或确认口径。";
  const knownGaps = [
    ...new Set(
      Object.values(metrics)
        .filter((metric) => !metricAvailable(metric) && metric.reason)
        .map((metric) => `${metric.label}：${metric.reason}`),
    ),
  ];
  const qualityStatus = overallQuality(input);
  const warningText =
    qualityStatus === "pass"
      ? "数据质量检查通过。"
      : qualityStatus === "warn"
        ? "部分指标存在质量提醒，请结合证据链解读。"
        : "存在质量阻断，受影响路径不生成结论。";

  return {
    contractVersion: REVENUE_CONTRACT_VERSION,
    analysisId: options.analysisId ?? `rv3-${input.current.end.replaceAll("-", "")}-demo`,
    classification: input.classification,
    basis: input.basis,
    basisLabel: input.basisLabel?.trim() || BASIS_LABELS[input.basis],
    generatedAt: options.now ?? new Date().toISOString(),
    asOf: input.current.end,
    comparisonLabel: input.comparison.label,
    qualityStatus,
    metrics,
    pathAvailability: [traffic, gmv, advertiser, guardrail],
    contributionBridges: [
      trafficBaseBridge(input.comparison, input.current),
      expandedTrafficBridge(input.comparison, input.current),
      gmvMidpointBridge(input.comparison, input.current),
    ],
    breakdowns: input.slices,
    advertiserHealth: [
      metrics.active_advertisers,
      metrics.advertiser_roi,
      metrics.advertiser_retention,
    ],
    guardrails: [
      metrics.bounce_rate,
      metrics.average_dwell_seconds,
      metrics.organic_conversion_rate,
    ],
    qualityChecks: input.quality,
    claims,
    brief: {
      headline,
      summary: `${headline}${warningText} 变化仅作归因观察；没有策略事件或实验时不声明因果。`,
      reviewStatus: "draft",
    },
    knownGaps,
    limitations: [
      "本结果不包含收入预测。",
      "行业基准未硬编码为健康阈值。",
      "AI 只能优化语言，不能修改受治理指标。",
      "没有实验或明确策略事件时，只描述相关变化，不声称因果。",
    ],
  };
}
