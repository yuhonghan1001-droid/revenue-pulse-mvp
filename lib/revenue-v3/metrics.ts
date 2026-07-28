import type {
  AggregateV3,
  GovernedMetricV3,
  MetricStatus,
  RevenueBasis,
} from "./contracts.ts";

type Unit = GovernedMetricV3["unit"];

function metric(
  id: string,
  label: string,
  value: number | null,
  unit: Unit,
  evidence: string[],
  status: MetricStatus = "available",
  reason?: string,
): GovernedMetricV3 {
  return { id, label, value, unit, status, evidence, ...(reason ? { reason } : {}) };
}

function unavailable(id: string, label: string, unit: Unit, reason: string) {
  return metric(id, label, null, unit, [], "unavailable", reason);
}

function validNonNegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function safeRatioMetric(
  id: string,
  label: string,
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  unit: Unit,
  evidence: string[],
): GovernedMetricV3 {
  if (!validNonNegative(numerator)) {
    return unavailable(id, label, unit, "分子缺失或不是有效非负数");
  }
  if (!validNonNegative(denominator) || denominator === 0) {
    return unavailable(id, label, unit, "分母缺失或为零，不能计算");
  }
  return metric(id, label, numerator / denominator, unit, evidence);
}

export function revenueMetric(
  aggregate: AggregateV3,
  basis: RevenueBasis,
): GovernedMetricV3 {
  if (basis === "unconfirmed") {
    return metric(
      "revenue",
      "广告收入",
      null,
      "CNY",
      [],
      "pending_confirmation",
      "请先确认收入是经营收入、实际消耗、可计费金额还是月结收入",
    );
  }
  if (!validNonNegative(aggregate.revenue)) {
    return unavailable("revenue", "广告收入", "CNY", "收入字段缺失或无效");
  }
  return metric("revenue", "广告收入", aggregate.revenue, "CNY", ["ad_revenue"]);
}

export function calculateMetrics(
  aggregate: AggregateV3,
  basis: RevenueBasis,
): Record<string, GovernedMetricV3> {
  const revenue = revenueMetric(aggregate, basis);
  const adLoad = validNonNegative(aggregate.adLoad)
    ? metric("ad_load", "Ad Load", aggregate.adLoad, "ratio", ["ad_delivery"])
    : safeRatioMetric(
        "ad_load",
        "Ad Load",
        aggregate.impressions,
        aggregate.monetizableVv,
        "ratio",
        ["ad_delivery", "user_behavior"],
      );
  const eCpm = validNonNegative(aggregate.eCpm)
    ? metric("ecpm", "eCPM", aggregate.eCpm, "CNY", ["ad_revenue", "ad_delivery"])
    : safeRatioMetric(
        "ecpm",
        "eCPM",
        validNonNegative(aggregate.revenue) ? aggregate.revenue * 1000 : null,
        aggregate.impressions,
        "CNY",
        ["ad_revenue", "ad_delivery"],
      );
  const requestRate = safeRatioMetric(
    "request_rate",
    "广告请求率",
    aggregate.requests,
    aggregate.opportunities,
    "ratio",
    ["ad_delivery"],
  );
  const fillRate = safeRatioMetric(
    "fill_rate",
    "填充率",
    aggregate.filledRequests,
    aggregate.requests,
    "ratio",
    ["ad_delivery"],
  );
  const renderRate = safeRatioMetric(
    "render_rate",
    "渲染率",
    aggregate.impressions,
    aggregate.filledRequests,
    "ratio",
    ["ad_delivery"],
  );
  const ctr = safeRatioMetric(
    "ctr",
    "CTR",
    aggregate.clicks,
    aggregate.impressions,
    "ratio",
    ["ad_delivery"],
  );
  const cpc = safeRatioMetric(
    "cpc",
    "CPC",
    aggregate.actualAdSpend,
    aggregate.clicks,
    "CNY",
    ["ad_revenue", "ad_delivery"],
  );
  const cpm = safeRatioMetric(
    "cpm",
    "CPM",
    validNonNegative(aggregate.actualAdSpend) ? aggregate.actualAdSpend * 1000 : null,
    aggregate.impressions,
    "CNY",
    ["ad_revenue", "ad_delivery"],
  );
  const monetizationRate = safeRatioMetric(
    "ad_take_rate",
    "广告货币化率",
    aggregate.revenue,
    aggregate.gmv,
    "ratio",
    ["ad_revenue", "commerce"],
  );
  const arpu = safeRatioMetric(
    "ad_arpu",
    "广告 ARPU",
    aggregate.revenue,
    aggregate.dau,
    "CNY",
    ["ad_revenue", "user_behavior"],
  );
  const advertiserRoi = safeRatioMetric(
    "advertiser_roi",
    "广告主 ROI",
    aggregate.attributedGmv,
    aggregate.actualAdSpend,
    "ratio",
    ["ad_attribution", "ad_revenue"],
  );
  const advertiserRetention = safeRatioMetric(
    "advertiser_retention",
    "活跃广告主留存率",
    aggregate.retainedAdvertisers,
    aggregate.priorActiveAdvertisers,
    "ratio",
    ["advertiser_status"],
  );

  return {
    revenue,
    monetizable_vv: validNonNegative(aggregate.monetizableVv)
      ? metric(
          "monetizable_vv",
          "可商业化 VV",
          aggregate.monetizableVv,
          "count",
          ["user_behavior"],
        )
      : unavailable("monetizable_vv", "可商业化 VV", "count", "缺少可商业化 VV"),
    ad_load: adLoad,
    ecpm: eCpm,
    request_rate: requestRate,
    fill_rate: fillRate,
    render_rate: renderRate,
    ctr,
    cpc,
    cpm,
    gmv: validNonNegative(aggregate.gmv)
      ? metric("gmv", "GMV", aggregate.gmv, "CNY", ["commerce"])
      : unavailable("gmv", "GMV", "CNY", "缺少同期间、同业务范围的 GMV"),
    ad_take_rate: monetizationRate,
    ad_arpu: arpu,
    advertiser_roi: advertiserRoi,
    advertiser_retention: advertiserRetention,
    active_advertisers: validNonNegative(aggregate.activeAdvertisers)
      ? metric(
          "active_advertisers",
          "活跃广告主",
          aggregate.activeAdvertisers,
          "count",
          ["advertiser_status"],
        )
      : unavailable("active_advertisers", "活跃广告主", "count", "缺少广告主状态"),
    bounce_rate: validNonNegative(aggregate.bounceRate)
      ? metric("bounce_rate", "退出率", aggregate.bounceRate, "ratio", ["user_behavior"])
      : unavailable("bounce_rate", "退出率", "ratio", "缺少用户行为数据"),
    average_dwell_seconds: validNonNegative(aggregate.averageDwellSeconds)
      ? metric(
          "average_dwell_seconds",
          "平均停留时长",
          aggregate.averageDwellSeconds,
          "seconds",
          ["user_behavior"],
        )
      : unavailable("average_dwell_seconds", "平均停留时长", "seconds", "缺少停留时长"),
    organic_conversion_rate: validNonNegative(aggregate.organicConversionRate)
      ? metric(
          "organic_conversion_rate",
          "自然转化率",
          aggregate.organicConversionRate,
          "ratio",
          ["user_behavior", "commerce"],
        )
      : unavailable(
          "organic_conversion_rate",
          "自然转化率",
          "ratio",
          "缺少自然交易口径",
        ),
  };
}

export function trafficRevenue(aggregate: AggregateV3): number | null {
  const { monetizableVv, adLoad, eCpm } = aggregate;
  if (![monetizableVv, adLoad, eCpm].every(validNonNegative)) return null;
  return (monetizableVv! * adLoad! * eCpm!) / 1000;
}

export function expandedTrafficFactors(aggregate: AggregateV3) {
  const opportunitiesPerVv =
    validNonNegative(aggregate.opportunities) &&
    validNonNegative(aggregate.monetizableVv) &&
    aggregate.monetizableVv !== 0
      ? aggregate.opportunities / aggregate.monetizableVv
      : null;
  const requestRate =
    validNonNegative(aggregate.requests) &&
    validNonNegative(aggregate.opportunities) &&
    aggregate.opportunities !== 0
      ? aggregate.requests / aggregate.opportunities
      : null;
  const fillRate =
    validNonNegative(aggregate.filledRequests) &&
    validNonNegative(aggregate.requests) &&
    aggregate.requests !== 0
      ? aggregate.filledRequests / aggregate.requests
      : null;
  const renderRate =
    validNonNegative(aggregate.impressions) &&
    validNonNegative(aggregate.filledRequests) &&
    aggregate.filledRequests !== 0
      ? aggregate.impressions / aggregate.filledRequests
      : null;
  const eCpm = validNonNegative(aggregate.eCpm)
    ? aggregate.eCpm / 1000
    : validNonNegative(aggregate.revenue) &&
        validNonNegative(aggregate.impressions) &&
        aggregate.impressions !== 0
      ? aggregate.revenue / aggregate.impressions
      : null;
  const values = [
    aggregate.monetizableVv,
    opportunitiesPerVv,
    requestRate,
    fillRate,
    renderRate,
    eCpm,
  ];
  return values.every(validNonNegative) ? (values as number[]) : null;
}
