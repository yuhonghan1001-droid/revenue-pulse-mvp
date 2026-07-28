import type {
  AggregateV3,
  ContributionBridgeV3,
  ContributionItemV3,
} from "./contracts.ts";
import { expandedTrafficFactors, trafficRevenue } from "./metrics.ts";

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

export function exactShapleyMultiplicative(
  previous: number[],
  current: number[],
): number[] {
  if (
    previous.length !== current.length ||
    previous.length === 0 ||
    previous.length > 6 ||
    [...previous, ...current].some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Shapley attribution requires 1–6 finite factor pairs.");
  }
  const count = previous.length;
  const allMask = (1 << count) - 1;
  const totalFactorial = factorial(count);
  const product = (mask: number) =>
    previous.reduce(
      (result, baseValue, index) =>
        result * (mask & (1 << index) ? current[index] : baseValue),
      1,
    );

  return previous.map((_, factorIndex) => {
    let contribution = 0;
    for (let mask = 0; mask <= allMask; mask += 1) {
      if (mask & (1 << factorIndex)) continue;
      const subsetSize = mask.toString(2).split("1").length - 1;
      const weight =
        (factorial(subsetSize) * factorial(count - subsetSize - 1)) /
        totalFactorial;
      contribution += weight * (product(mask | (1 << factorIndex)) - product(mask));
    }
    return contribution;
  });
}

function unavailableBridge(
  id: ContributionBridgeV3["id"],
  label: string,
  reason: string,
): ContributionBridgeV3 {
  return {
    id,
    label,
    status: "unavailable",
    comparisonRevenue: null,
    currentRevenue: null,
    change: null,
    contributions: [],
    residual: null,
    reason,
  };
}

function bridge(
  id: ContributionBridgeV3["id"],
  label: string,
  previousFactors: number[],
  currentFactors: number[],
  factorLabels: Array<[string, string]>,
): ContributionBridgeV3 {
  const previousRevenue = previousFactors.reduce((result, value) => result * value, 1);
  const currentRevenue = currentFactors.reduce((result, value) => result * value, 1);
  const values = exactShapleyMultiplicative(previousFactors, currentFactors);
  const contributions: ContributionItemV3[] = values.map((contribution, index) => ({
    factor: factorLabels[index][0],
    label: factorLabels[index][1],
    contribution,
  }));
  const change = currentRevenue - previousRevenue;
  const residual =
    change - contributions.reduce((sum, contribution) => sum + contribution.contribution, 0);
  return {
    id,
    label,
    status: "available",
    comparisonRevenue: previousRevenue,
    currentRevenue,
    change,
    contributions,
    residual,
  };
}

export function trafficBaseBridge(
  previous: AggregateV3,
  current: AggregateV3,
): ContributionBridgeV3 {
  const previousRevenue = trafficRevenue(previous);
  const currentRevenue = trafficRevenue(current);
  if (previousRevenue === null || currentRevenue === null) {
    return unavailableBridge(
      "traffic_base",
      "流量变现贡献",
      "需要可商业化 VV、Ad Load 和 eCPM",
    );
  }
  return bridge(
    "traffic_base",
    "流量变现贡献",
    [previous.monetizableVv!, previous.adLoad!, previous.eCpm! / 1000],
    [current.monetizableVv!, current.adLoad!, current.eCpm! / 1000],
    [
      ["monetizable_vv", "可商业化 VV"],
      ["ad_load", "Ad Load"],
      ["ecpm", "eCPM"],
    ],
  );
}

export function expandedTrafficBridge(
  previous: AggregateV3,
  current: AggregateV3,
): ContributionBridgeV3 {
  const previousFactors = expandedTrafficFactors(previous);
  const currentFactors = expandedTrafficFactors(current);
  if (!previousFactors || !currentFactors) {
    return unavailableBridge(
      "traffic_expanded",
      "流量变现链路贡献",
      "需要机会、请求、填充、曝光及 eCPM 的完整链路",
    );
  }
  return bridge(
    "traffic_expanded",
    "流量变现链路贡献",
    previousFactors,
    currentFactors,
    [
      ["monetizable_vv", "可商业化 VV"],
      ["opportunities_per_vv", "每 VV 广告机会"],
      ["request_rate", "请求率"],
      ["fill_rate", "填充率"],
      ["render_rate", "渲染率"],
      ["ecpm", "eCPM"],
    ],
  );
}

export function gmvMidpointBridge(
  previous: AggregateV3,
  current: AggregateV3,
): ContributionBridgeV3 {
  if (
    previous.gmv == null ||
    current.gmv == null ||
    previous.revenue == null ||
    current.revenue == null ||
    previous.gmv <= 0 ||
    current.gmv <= 0
  ) {
    return unavailableBridge("gmv", "GMV 变现贡献", "需要同范围 GMV 与广告收入");
  }
  const previousRate = previous.revenue / previous.gmv;
  const currentRate = current.revenue / current.gmv;
  const gmvContribution =
    (current.gmv - previous.gmv) * ((previousRate + currentRate) / 2);
  const rateContribution =
    (currentRate - previousRate) * ((previous.gmv + current.gmv) / 2);
  const change = current.revenue - previous.revenue;
  const residual = change - gmvContribution - rateContribution;
  return {
    id: "gmv",
    label: "GMV 变现贡献",
    status: "available",
    comparisonRevenue: previous.revenue,
    currentRevenue: current.revenue,
    change,
    contributions: [
      { factor: "gmv", label: "GMV", contribution: gmvContribution },
      {
        factor: "ad_take_rate",
        label: "广告货币化率",
        contribution: rateContribution,
      },
    ],
    residual,
  };
}
