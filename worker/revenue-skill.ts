import fallbackDashboard from "../app/data/dashboard.json";
import skillInstructions from "../skills/analyze-ecommerce-ad-revenue/SKILL.md?raw";
import dataQualityRules from "../skills/analyze-ecommerce-ad-revenue/references/data-quality-and-guardrails.md?raw";
import driverRules from "../skills/analyze-ecommerce-ad-revenue/references/driver-analysis.md?raw";
import briefRules from "../skills/analyze-ecommerce-ad-revenue/references/management-brief-standard.md?raw";
import metricRules from "../skills/analyze-ecommerce-ad-revenue/references/metric-contracts.md?raw";

export interface RevenueSkillEnv {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

type QualityStatus = "pass" | "warn" | "fail";
type DecisionStatus = "no_action" | "watch" | "action";
type ClaimType = "fact" | "forecast" | "judgment" | "risk";
type Confidence = "low" | "medium" | "high";

interface MetricValue {
  value: number;
  unit: string;
  source_ids: string[];
}

interface AnalysisClaim {
  type: ClaimType;
  text: string;
  evidence_refs: string[];
  source_ids: string[];
  confidence: Confidence;
}

interface DriverItem {
  name: string;
  impact: number;
  evidence: string;
}

interface AnalysisAction {
  action: string;
  owner: string;
  due_date: string;
  trigger: string;
}

export interface RevenueSkillBrief {
  run_id: string;
  skill_name: "analyze-ecommerce-ad-revenue";
  skill_version: "1.0.0";
  as_of: string;
  generated_at: string;
  audience: "finance_leader";
  decision_status: DecisionStatus;
  engine: "openai" | "rules" | "rules_fallback";
  model: string | null;
  headline: string;
  summary: string;
  drivers_narrative: string;
  action_narrative: string;
  risk_note: string;
  data_quality: {
    status: QualityStatus;
    freshness_pct: number;
    completeness_pct: number;
    uniqueness_pct: number;
    join_success_pct: number;
    blockers: string[];
  };
  metrics: {
    actual_net_revenue: MetricValue;
    yoy_growth_pct: MetricValue;
    budget_attainment_pct: MetricValue;
    month_end_forecast: MetricValue;
    forecast_vs_budget_pct: MetricValue;
  };
  claims: AnalysisClaim[];
  drivers: {
    positive: DriverItem[];
    negative: DriverItem[];
    unexplained_residual: number;
  };
  forecast_assumptions: string[];
  actions: AnalysisAction[];
  known_gaps: string[];
  limitations: string[];
}

interface DashboardSnapshot {
  meta: {
    asOf: string;
    generatedAt?: string;
    demo?: boolean;
    sourceCount: number;
    onTimeSourceCount: number;
  };
  kpis: {
    mtdRevenue: number;
    yoy: number;
    budgetAttainment: number;
    forecast: number;
    forecastVsBudget: number;
    monthlyBudget: number;
  };
  healthSummary: {
    healthy: number;
    warning: number;
    blocked: number;
    averageScore: number;
    joinSuccess: number;
  };
  sourceHealth: Array<{
    id: string;
    displayName: string;
    owner: string;
    completeness: number;
    duplicateCount: number;
    joinRate: number;
    healthStatus: string;
    issue: string;
  }>;
  breakdowns: Record<
    "industry" | "product" | "traffic",
    Array<{
      name: string;
      revenue: number;
      change: number;
      changePct: number | null;
      share: number;
    }>
  >;
  evidenceChain: Array<{
    type: string;
    claim: string;
    confidence: number;
    metricId: string;
    logic: string;
    sourceIds: string[];
  }>;
  alertRules: Array<{
    name: string;
    metric: string;
    condition: string;
    actual: string;
    status: string;
    owner: string;
    action: string;
  }>;
  executiveSummary: {
    headline: string;
    facts: string[];
    judgement: string;
    toVerify: string;
  };
  pushPreview: {
    title: string;
    summary: string;
    drivers: string;
    action: string;
  };
  forecastMethod?: {
    formula?: string;
  };
}

interface LanguageLayer {
  headline: string;
  summary: string;
  drivers_narrative: string;
  action_narrative: string;
  risk_note: string;
}

const FALLBACK_SNAPSHOT = fallbackDashboard as DashboardSnapshot;
const DEFAULT_MODEL = "gpt-5.6-sol";

const SKILL_CONTEXT = [
  skillInstructions,
  metricRules,
  dataQualityRules,
  driverRules,
  briefRules,
].join("\n\n---\n\n");

const LANGUAGE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "一句中文管理结论，不新增输入中不存在的数字。",
    },
    summary: {
      type: "string",
      description: "两句以内的中文经营摘要，保持指标数字和口径不变。",
    },
    drivers_narrative: {
      type: "string",
      description: "中文动因摘要，区分正向、负向和待确认因素。",
    },
    action_narrative: {
      type: "string",
      description: "中文行动摘要，包含责任人和触发条件。",
    },
    risk_note: {
      type: "string",
      description: "中文数据风险说明；无重大风险时写数据质量通过。",
    },
  },
  required: [
    "headline",
    "summary",
    "drivers_narrative",
    "action_narrative",
    "risk_note",
  ],
  additionalProperties: false,
} as const;

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[], fallback = 100) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function confidenceLabel(value: number): Confidence {
  if (value >= 90) return "high";
  if (value >= 70) return "medium";
  return "low";
}

function claimType(value: string): ClaimType {
  const map: Record<string, ClaimType> = {
    事实: "fact",
    预测: "forecast",
    判断: "judgment",
    风险: "risk",
  };
  return map[value] ?? "judgment";
}

function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardSnapshot>;
  return Boolean(
    candidate.meta?.asOf &&
      candidate.kpis &&
      typeof candidate.kpis.mtdRevenue === "number" &&
      candidate.healthSummary &&
      Array.isArray(candidate.sourceHealth) &&
      candidate.breakdowns &&
      Array.isArray(candidate.evidenceChain) &&
      Array.isArray(candidate.alertRules),
  );
}

export function resolveDashboardSnapshot(value: unknown): DashboardSnapshot {
  return isDashboardSnapshot(value) ? value : FALLBACK_SNAPSHOT;
}

function compactSnapshot(snapshot: DashboardSnapshot) {
  return {
    meta: snapshot.meta,
    kpis: snapshot.kpis,
    healthSummary: snapshot.healthSummary,
    sourceIssues: snapshot.sourceHealth
      .filter((source) => source.healthStatus !== "健康")
      .map((source) => ({
        id: source.id,
        name: source.displayName,
        owner: source.owner,
        issue: source.issue,
      })),
    topDrivers: Object.entries(snapshot.breakdowns).flatMap(([dimension, items]) =>
      items.map((item) => ({
        dimension,
        name: item.name,
        change: item.change,
        changePct: item.changePct,
      })),
    ),
    evidenceChain: snapshot.evidenceChain,
    alertRules: snapshot.alertRules,
  };
}

function createRuleBrief(snapshot: DashboardSnapshot): RevenueSkillBrief {
  const warnings = snapshot.sourceHealth.filter(
    (source) => source.healthStatus !== "健康",
  );
  const qualityStatus: QualityStatus =
    snapshot.healthSummary.blocked > 0
      ? "fail"
      : snapshot.healthSummary.warning > 0
        ? "warn"
        : "pass";
  const decisionStatus: DecisionStatus =
    qualityStatus === "fail"
      ? "watch"
      : snapshot.kpis.forecastVsBudget <= -3
        ? "action"
        : snapshot.alertRules.length
          ? "watch"
          : "no_action";
  const dimensions: Array<keyof DashboardSnapshot["breakdowns"]> = [
    "industry",
    "product",
    "traffic",
  ];
  const driverCandidates = dimensions.flatMap((dimension) =>
    snapshot.breakdowns[dimension].map((item) => ({
      name: `${dimension === "industry" ? "行业" : dimension === "product" ? "产品" : "流量"}｜${item.name}`,
      impact: item.change,
      evidence: `${item.name}收入变化 ${item.change > 0 ? "+" : ""}${item.change.toFixed(2)} 亿`,
    })),
  );
  const positive = driverCandidates
    .filter((item) => item.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);
  const negative = driverCandidates
    .filter((item) => item.impact < 0)
    .sort((a, b) => a.impact - b.impact)
    .slice(0, 3);

  return {
    run_id: crypto.randomUUID(),
    skill_name: "analyze-ecommerce-ad-revenue",
    skill_version: "1.0.0",
    as_of: `${snapshot.meta.asOf}T09:31:00+08:00`,
    generated_at: new Date().toISOString(),
    audience: "finance_leader",
    decision_status: decisionStatus,
    engine: "rules",
    model: null,
    headline: snapshot.executiveSummary.headline,
    summary: snapshot.pushPreview.summary,
    drivers_narrative: snapshot.pushPreview.drivers,
    action_narrative: snapshot.pushPreview.action,
    risk_note:
      qualityStatus === "pass"
        ? "关键数据源均通过质量检查。"
        : warnings.map((source) => `${source.displayName}：${source.issue}`).join("；"),
    data_quality: {
      status: qualityStatus,
      freshness_pct: round(
        (snapshot.meta.onTimeSourceCount / Math.max(snapshot.meta.sourceCount, 1)) *
          100,
      ),
      completeness_pct: round(
        average(snapshot.sourceHealth.map((source) => source.completeness)),
      ),
      uniqueness_pct: round(
        average(
          snapshot.sourceHealth.map((source) =>
            source.duplicateCount === 0 ? 100 : 0,
          ),
        ),
      ),
      join_success_pct: round(snapshot.healthSummary.joinSuccess),
      blockers:
        qualityStatus === "fail"
          ? warnings.map((source) => `${source.id}: ${source.issue}`)
          : [],
    },
    metrics: {
      actual_net_revenue: {
        value: snapshot.kpis.mtdRevenue,
        unit: "亿元",
        source_ids: [
          "billing_confirmations_daily",
          "rebates_daily",
          "refunds_daily",
        ],
      },
      yoy_growth_pct: {
        value: snapshot.kpis.yoy,
        unit: "%",
        source_ids: [
          "billing_confirmations_daily",
          "rebates_daily",
          "refunds_daily",
          "calendar",
        ],
      },
      budget_attainment_pct: {
        value: snapshot.kpis.budgetAttainment,
        unit: "%",
        source_ids: ["billing_confirmations_daily", "market_target_monthly"],
      },
      month_end_forecast: {
        value: snapshot.kpis.forecast,
        unit: "亿元",
        source_ids: [
          "billing_confirmations_daily",
          "forecast_baseline_daily",
          "strategy_events",
        ],
      },
      forecast_vs_budget_pct: {
        value: snapshot.kpis.forecastVsBudget,
        unit: "%",
        source_ids: ["forecast_baseline_daily", "market_target_monthly"],
      },
    },
    claims: snapshot.evidenceChain.map((item) => ({
      type: claimType(item.type),
      text: item.claim,
      evidence_refs: [
        `metric:${item.metricId}`,
        `logic:${item.logic}`,
      ],
      source_ids: item.sourceIds,
      confidence: confidenceLabel(item.confidence),
    })),
    drivers: {
      positive,
      negative,
      unexplained_residual: 0,
    },
    forecast_assumptions: [
      snapshot.forecastMethod?.formula ??
        "使用截至当前实际收入、近期运行速度、剩余日期和已知策略事件推演。",
    ],
    actions: snapshot.alertRules.map((rule) => ({
      action: rule.action,
      owner: rule.owner,
      due_date: addDays(snapshot.meta.asOf, 1),
      trigger: `${rule.metric}：${rule.condition}；当前 ${rule.actual}`,
    })),
    known_gaps: warnings.map(
      (source) => `${source.displayName}（${source.owner}）：${source.issue}`,
    ),
    limitations:
      qualityStatus === "pass"
        ? []
        : warnings.map(
            (source) => `${source.displayName}未达到质量要求，相关归因需待确认。`,
          ),
  };
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return null;
}

async function generateLanguageLayer(
  env: RevenueSkillEnv,
  brief: RevenueSkillBrief,
  snapshot: DashboardSnapshot,
): Promise<LanguageLayer> {
  const model = env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            `${SKILL_CONTEXT}\n\n` +
            "你只负责组织管理层语言，不得修改受治理指标，不得增加输入中没有的数字，不得把判断写成事实。",
        },
        {
          role: "user",
          content: JSON.stringify({
            governedBrief: brief,
            latestSnapshot: compactSnapshot(snapshot),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "revenue_bp_language_layer",
          strict: true,
          schema: LANGUAGE_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error
        ? String(payload.error.message)
        : `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI response did not contain structured text.");
  return JSON.parse(text) as LanguageLayer;
}

async function ensureAnalysisStorage(db: D1Database) {
  await db.batch([
    db
      .prepare(
        `CREATE TABLE IF NOT EXISTS analysis_runs (
          id TEXT PRIMARY KEY,
          as_of TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          engine TEXT NOT NULL,
          model TEXT,
          quality_status TEXT NOT NULL,
          input_json TEXT NOT NULL,
          result_json TEXT NOT NULL
        )`,
      ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS analysis_runs_generated_at_idx ON analysis_runs(generated_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS analysis_runs_as_of_idx ON analysis_runs(as_of)",
    ),
  ]);
}

async function persistRun(
  env: RevenueSkillEnv,
  snapshot: DashboardSnapshot,
  brief: RevenueSkillBrief,
) {
  if (!env.DB) return;
  await ensureAnalysisStorage(env.DB);
  await env.DB
    .prepare(
      `INSERT INTO analysis_runs
        (id, as_of, generated_at, engine, model, quality_status, input_json, result_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      brief.run_id,
      brief.as_of,
      brief.generated_at,
      brief.engine,
      brief.model,
      brief.data_quality.status,
      JSON.stringify(compactSnapshot(snapshot)),
      JSON.stringify(brief),
    )
    .run();
}

export async function runRevenueSkill(
  env: RevenueSkillEnv,
  input?: unknown,
): Promise<RevenueSkillBrief> {
  const snapshot = resolveDashboardSnapshot(input);
  const brief = createRuleBrief(snapshot);

  if (env.OPENAI_API_KEY) {
    try {
      const language = await generateLanguageLayer(env, brief, snapshot);
      brief.engine = "openai";
      brief.model = env.OPENAI_MODEL ?? DEFAULT_MODEL;
      brief.headline = language.headline;
      brief.summary = language.summary;
      brief.drivers_narrative = language.drivers_narrative;
      brief.action_narrative = language.action_narrative;
      brief.risk_note = language.risk_note;
    } catch {
      brief.engine = "rules_fallback";
      brief.model = env.OPENAI_MODEL ?? DEFAULT_MODEL;
      brief.limitations.push(
        "AI 语言增强本次不可用，已使用可审计规则引擎生成简报；指标与质量门槛不受影响。",
      );
    }
  } else {
    brief.limitations.push(
      "当前未配置模型密钥，使用可审计规则引擎生成简报。",
    );
  }

  await persistRun(env, snapshot, brief);
  return brief;
}

export async function getLatestRevenueSkillRun(
  env: RevenueSkillEnv,
): Promise<RevenueSkillBrief | null> {
  if (!env.DB) return null;
  await ensureAnalysisStorage(env.DB);
  const row = await env.DB
    .prepare(
      "SELECT result_json FROM analysis_runs ORDER BY generated_at DESC LIMIT 1",
    )
    .first<{ result_json: string }>();
  if (!row?.result_json) return null;
  try {
    return JSON.parse(row.result_json) as RevenueSkillBrief;
  } catch {
    return null;
  }
}

export function createRevenueSkillPreview() {
  return createRuleBrief(FALLBACK_SNAPSHOT);
}
