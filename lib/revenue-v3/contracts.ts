export const REVENUE_CONTRACT_VERSION = "3.0" as const;

export const BANNED_BUDGET_FIELDS = new Set([
  "monthly_budget",
  "time_phased_budget",
  "budget_attainment",
  "forecast_vs_budget",
  "merchant_budget",
  "budget_utilization",
]);

export type RevenueBasis =
  | "operating_ad_revenue"
  | "advertiser_spend"
  | "billable_amount"
  | "financial_close_revenue"
  | "other"
  | "unconfirmed";

export type MetricStatus =
  | "available"
  | "warning"
  | "unavailable"
  | "pending_confirmation"
  | "blocked";

export type QualityStatus = "pass" | "warn" | "fail";
export type DataClassification = "demo" | "real";
export type DimensionId =
  | "advertiser"
  | "ad_format"
  | "traffic_scene"
  | "billing_method"
  | "category"
  | "advertiser_tier";

export type SourceRole =
  | "ad_revenue"
  | "ad_delivery"
  | "auction"
  | "commerce"
  | "ad_attribution"
  | "user_behavior"
  | "advertiser_status"
  | "financial_close"
  | "strategy_event"
  | "dimension"
  | "ignored";

export interface GovernedMetricV3 {
  id: string;
  label: string;
  value: number | null;
  unit: "CNY" | "count" | "ratio" | "percent" | "seconds";
  status: MetricStatus;
  reason?: string;
  evidence: string[];
}

export interface AggregateV3 {
  revenue?: number | null;
  monetizableVv?: number | null;
  adLoad?: number | null;
  eCpm?: number | null;
  opportunities?: number | null;
  requests?: number | null;
  filledRequests?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  actualAdSpend?: number | null;
  gmv?: number | null;
  attributedGmv?: number | null;
  dau?: number | null;
  activeAdvertisers?: number | null;
  priorActiveAdvertisers?: number | null;
  retainedAdvertisers?: number | null;
  bounceRate?: number | null;
  averageDwellSeconds?: number | null;
  organicConversionRate?: number | null;
}

export interface AnalysisPeriodV3 extends AggregateV3 {
  start: string;
  end: string;
  label: string;
}

export interface SourceProfileV3 {
  sourceId: string;
  displayLabel: string;
  format: "csv" | "xlsx" | "aggregate";
  sourceRoles: SourceRole[];
  rowCount: number;
  timeGrain: "event" | "hour" | "day" | "week" | "month" | "unknown";
  dimensionGrain: DimensionId[];
  primaryKeyColumns: string[];
  currency: string | null;
  timezone: "Asia/Shanghai";
}

export interface FieldMappingV3 {
  sourceId: string;
  sourceColumn: string;
  semanticField: string;
  confirmed: boolean;
}

export interface QualityCheckV3 {
  id: string;
  label: string;
  status: QualityStatus;
  path:
    | "all"
    | "traffic_monetization"
    | "gmv_monetization"
    | "advertiser_health"
    | "experience_guardrails";
  detail: string;
}

export interface BreakdownSliceV3 {
  dimension: DimensionId;
  member: string;
  current: AggregateV3;
  comparison: AggregateV3;
}

export interface StrategyEventV3 {
  eventId: string;
  label: string;
  start: string;
  end?: string;
  scope?: string;
}

export interface RevenueAnalysisInputV3 {
  contractVersion: typeof REVENUE_CONTRACT_VERSION;
  classification: DataClassification;
  basis: RevenueBasis;
  basisLabel?: string;
  current: AnalysisPeriodV3;
  comparison: AnalysisPeriodV3;
  profiles: SourceProfileV3[];
  mappings: FieldMappingV3[];
  quality: QualityCheckV3[];
  slices: BreakdownSliceV3[];
  strategyEvents: StrategyEventV3[];
}

export interface ContributionItemV3 {
  factor: string;
  label: string;
  contribution: number;
}

export interface ContributionBridgeV3 {
  id: "traffic_base" | "traffic_expanded" | "gmv";
  label: string;
  status: MetricStatus;
  comparisonRevenue: number | null;
  currentRevenue: number | null;
  change: number | null;
  contributions: ContributionItemV3[];
  residual: number | null;
  reason?: string;
}

export interface PathAvailabilityV3 {
  id:
    | "traffic_monetization"
    | "gmv_monetization"
    | "advertiser_health"
    | "experience_guardrails";
  label: string;
  status: MetricStatus;
  reason?: string;
}

export interface ClaimV3 {
  id: string;
  text: string;
  status: "fact" | "observation" | "pending_confirmation";
  metricIds: string[];
  sourceIds: string[];
}

export interface RevenueAnalysisResultV3 {
  contractVersion: typeof REVENUE_CONTRACT_VERSION;
  analysisId: string;
  classification: DataClassification;
  basis: RevenueBasis;
  basisLabel: string;
  generatedAt: string;
  asOf: string;
  comparisonLabel: string;
  qualityStatus: QualityStatus;
  metrics: Record<string, GovernedMetricV3>;
  pathAvailability: PathAvailabilityV3[];
  contributionBridges: ContributionBridgeV3[];
  breakdowns: BreakdownSliceV3[];
  advertiserHealth: GovernedMetricV3[];
  guardrails: GovernedMetricV3[];
  qualityChecks: QualityCheckV3[];
  claims: ClaimV3[];
  brief: {
    headline: string;
    summary: string;
    reviewStatus: "draft" | "approved";
  };
  knownGaps: string[];
  limitations: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function visitForBannedFields(value: unknown, path: string, errors: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitForBannedFields(item, `${path}[${index}]`, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED_BUDGET_FIELDS.has(key.toLowerCase())) {
      errors.push(`${path}.${key}: v3 does not accept this field`);
    }
    visitForBannedFields(child, `${path}.${key}`, errors);
  }
}

function hasInvalidNumber(value: unknown) {
  return typeof value === "number" && !Number.isFinite(value);
}

export function validateRevenueAnalysisInputV3(value: unknown): ValidationResult {
  const errors: string[] = [];
  visitForBannedFields(value, "$", errors);
  if (!value || typeof value !== "object") {
    return { valid: false, errors: [...errors, "$: expected an object"] };
  }
  const input = value as Partial<RevenueAnalysisInputV3>;
  if (input.contractVersion !== REVENUE_CONTRACT_VERSION) {
    errors.push(`$.contractVersion: expected ${REVENUE_CONTRACT_VERSION}`);
  }
  if (input.classification !== "demo" && input.classification !== "real") {
    errors.push("$.classification: expected demo or real");
  }
  if (!input.basis) errors.push("$.basis: required");
  if (input.basis === "other" && !input.basisLabel?.trim()) {
    errors.push("$.basisLabel: required when basis is other");
  }
  for (const periodName of ["current", "comparison"] as const) {
    const period = input[periodName];
    if (!period || typeof period !== "object") {
      errors.push(`$.${periodName}: required`);
      continue;
    }
    if (!period.start || !period.end || !period.label) {
      errors.push(`$.${periodName}: start, end and label are required`);
    }
    for (const [key, child] of Object.entries(period)) {
      if (hasInvalidNumber(child)) errors.push(`$.${periodName}.${key}: must be finite`);
      if (typeof child === "number" && child < 0) {
        errors.push(`$.${periodName}.${key}: must not be negative`);
      }
    }
  }
  for (const listName of ["profiles", "mappings", "quality", "slices", "strategyEvents"] as const) {
    if (!Array.isArray(input[listName])) errors.push(`$.${listName}: expected an array`);
  }
  return { valid: errors.length === 0, errors };
}

export function commonDimensions(
  left: SourceProfileV3,
  right: SourceProfileV3,
): DimensionId[] {
  return left.dimensionGrain.filter((dimension) => right.dimensionGrain.includes(dimension));
}

export function supportsRequestedGrain(
  profiles: SourceProfileV3[],
  sourceRoles: SourceRole[],
  requested: DimensionId[],
): ValidationResult {
  const relevant = profiles.filter((profile) =>
    profile.sourceRoles.some((role) => sourceRoles.includes(role)),
  );
  if (relevant.length === 0) {
    return { valid: false, errors: ["No source profile is available for the requested metric."] };
  }
  const shared = relevant
    .map((profile) => new Set(profile.dimensionGrain))
    .reduce((accumulator, dimensions) =>
      new Set([...accumulator].filter((dimension) => dimensions.has(dimension))),
    );
  const unsupported = requested.filter((dimension) => !shared.has(dimension));
  return unsupported.length
    ? {
        valid: false,
        errors: [
          `Requested grain is finer than the common source grain: ${unsupported.join(", ")}`,
        ],
      }
    : { valid: true, errors: [] };
}
