# Revenue Pulse｜广告收入经营分析技术方案

> 版本：v0.3  
> 日期：2026-07-27  
> 状态：已批准  
> 对应文档：`PRD_AD_REVENUE_V03_DRAFT.md`、`UI_SPEC_AD_REVENUE_V03_DRAFT.md`  
> 原则：沿用现有技术栈，增量改造，不重写已验证的部署、D1、Actions 和飞书基础设施  
> 明确排除：预算数据、预算指标、预算比较和预算结论

## 1. 方案结论

v0.3 在现有 Revenue Pulse 上进行兼容升级：

1. 保留 Next.js、React、Cloudflare Worker、D1、Python、GitHub Actions、飞书和 Sites；
2. 保留当前公开模拟看板，在 v0.3 验收前不破坏现有线上版本；
3. 新增粒度感知的数据合同，禁止跨粒度复制指标；
4. 同时建立流量变现和 GMV 变现两条确定性计算链路；
5. 使用顺序无关的贡献分解，确保各动因与收入变化勾稽；
6. 将广告主 ROI、留存以及用户体验护栏纳入统一结果合同；
7. 继续由程序计算所有数字，AI 只整理管理语言；
8. 从数据注册表、规则引擎、Skill、页面、飞书和测试中移除预算能力；
9. 用户上传的原始文件默认只在浏览器内解析，服务端只接收经过确认和聚合的数据；
10. 真实数据工作区必须受保护；公开链接只展示模拟数据，真实数据即使脱敏也不能进入公开看板。

## 2. 假设与边界

### 2.1 收入口径

系统支持以下口径，但每次分析只能指定一个主收入结果：

```ts
type RevenueBasis =
  | "operating_ad_revenue"
  | "advertiser_spend"
  | "billable_amount"
  | "financial_close_revenue"
  | "other"
  | "unconfirmed";
```

含义：

- `operating_ad_revenue`：业务侧日常监控的广告经营收入；
- `advertiser_spend`：广告主已经实际发生的投放消耗；
- `billable_amount`：计费事件形成的可计费金额；
- `financial_close_revenue`：财务关账后确认的收入；
- `other`：由用户补充定义；
- `unconfirmed`：口径未确认，禁止生成收入结论。

实际广告消耗可以用于广告主 ROI 分母，但只有经过口径确认时才能同时作为平台广告经营收入使用。

### 2.2 本轮不做

- 月底收入预测；
- 预算完成率；
- 预测与预算比较；
- 商家申报预算与预算利用率；
- 自动收入确认；
- 自动调整广告位、底价或竞价策略；
- 没有实验或策略事件时的因果推断；
- 把外部行业区间硬编码为健康阈值。

### 2.3 公开和私有边界

- 公开看板：只允许模拟数据，可匿名查看；
- 真实数据工作区：要求登录和允许名单；
- 原始 CSV / Excel：默认不离开浏览器；
- 服务端聚合结果：仍视为业务数据，必须鉴权、审计并按保留期删除；
- 真实数据及其分析结果不得转换为公开结果，即使已经脱敏；
- 如果运行环境无法可靠识别用户身份，真实数据保存和飞书推送功能保持关闭。

## 3. 当前系统基线与问题

### 3.1 已有能力

| 区域 | 当前实现 |
|---|---|
| 前端 | Next.js 16、React 19、TypeScript |
| 构建运行 | vinext、Vite、Cloudflare Worker |
| 数据库 | Cloudflare D1、Drizzle ORM |
| 数据管道 | Python，固定注册 24 个模拟 CSV |
| 分析 | Worker 规则引擎，可选 OpenAI 语言增强 |
| 自动化 | GitHub Actions 每日运行 |
| 推送 | 飞书个人私信或群机器人 |
| 托管 | OpenAI Sites |

### 3.2 与 v0.3 的主要差距

- 当前核心指标仍是实际、同比、预算和预测；
- 预算字段贯穿注册表、管道、Skill、页面、飞书和测试；
- 已计算曝光、CTR 和 eCPM，但缺少完整 Ad Load、请求、填充和 GMV 路径；
- 缺少 GMV、归因 GMV、用户行为和广告主留存数据；
- 收入与经营指标的事实表粒度不一致；
- 当前管道把“日期×商家”的曝光和点击关联到“日期×商家×产品×流量”的收入明细，存在指标被重复展开的风险；
- 当前同比使用的收入基准存在经营流水与财务净收入混用风险；
- Worker 的 `MetricValue` 只允许数字，不能正确表达不可用和口径待确认；
- 页面和飞书默认展示预算与预测，不符合 v0.3；
- 当前 D1 只保存分析结果，没有映射、所有权、审核和推送幂等审计。

## 4. 目标架构

```text
┌───────────────────────────────────────────────────────────────┐
│ 数据入口                                                      │
│                                                               │
│ A. GitHub Actions + 模拟数据                                  │
│ B. 受保护工作区中的 CSV / Excel                              │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ 数据准备层                                                    │
│                                                               │
│ 文件画像 → 数据源分类 → 字段映射 → 粒度识别 → 质量检查       │
│ → 本地关联 → 共同粒度聚合                                    │
│                                                               │
│ 原始文件不上传；只输出受控聚合合同                            │
└───────────────────────────┬───────────────────────────────────┘
                            │ RevenueAnalysisInput v3
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ 确定性分析层                                                  │
│                                                               │
│ 指标合同 → 两条收入路径 → Shapley 贡献分解 → 维度下钻        │
│ → 广告主健康 → 用户体验护栏 → 质量传播                       │
└───────────────────────────┬───────────────────────────────────┘
                            │ RevenueAnalysisResult v3
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ 输出层                                                        │
│                                                               │
│ D1 版本保存 → 看板 → 证据抽屉 → 管理简报 → 人工审核 → 飞书   │
│                             │                                 │
│                             └── AI 只优化文字，不修改指标     │
└───────────────────────────────────────────────────────────────┘
```

## 5. 粒度感知的数据模型

### 5.1 原则

每个数据源必须声明：

- 业务角色；
- 时间粒度；
- 维度粒度；
- 主键；
- 金额或数量单位；
- 币种；
- 时间范围；
- 可用维度；
- 数据来源。

系统不得：

- 把粗粒度指标复制到更细粒度；
- 把无法关联的维度静默归入“其他”；
- 用均分方式伪造产品、场景或广告主明细；
- 在不同业务范围、币种或期间之间直接计算比率；
- 将月度财务收入插值成日度实际收入。

### 5.2 共同粒度规则

假设：

- 收入：日期×广告主×广告形式×场景；
- 曝光：日期×广告主；
- GMV：日期×类目×场景。

则：

- 可以在“日期×广告主”上计算收入与曝光的 eCPM；
- 不能按广告形式展示 eCPM，因为曝光没有广告形式；
- 可以在“日期×场景”上计算收入与 GMV 的货币化率；
- 不能按广告主展示货币化率，因为 GMV 没有广告主维度；
- 页面只显示当前共同粒度支持的下钻项。

### 5.3 推荐事实表

| 数据角色 | 推荐粒度 | 关键指标 |
|---|---|---|
| 广告收入 | 日期×广告主×广告形式×场景×计费方式×类目 | 收入、实际消耗、可计费金额 |
| 广告交付 | 日期×广告主×广告形式×场景×类目 | 机会、请求、填充、曝光、点击、转化 |
| 竞价 | 日期×广告形式×场景×类目 | 参竞广告主、出价、成功竞价 |
| GMV | 日期×场景×类目 | GMV、订单 |
| 广告归因 | 日期×广告主×场景×类目 | 归因 GMV、归因订单 |
| 用户行为 | 日期×场景 | UV、PV、VV、DAU、停留、退出、自然转化 |
| 广告主状态 | 日期或月×广告主 | 活跃、分层、新增、留存、流失 |
| 财务确收 | 月×业务范围 | 财务收入、返点、退款、调整 |
| 策略事件 | 时间×场景或广告形式 | 事件类型、开始时间、结束时间 |

推荐粒度不是硬性要求。真实输入粒度不同的时候，系统按共同维度降级，而不是拒绝整份数据。

## 6. 数据源合同

### 6.1 基础枚举

```ts
type QualityStatus = "pass" | "warn" | "fail";

type MetricStatus =
  | "available"
  | "warning"
  | "unavailable"
  | "pending_confirmation"
  | "blocked";

type AnalysisPath =
  | "traffic_monetization"
  | "gmv_monetization"
  | "advertiser_health"
  | "experience_guardrails";

type SourceRole =
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

type DimensionId =
  | "advertiser"
  | "ad_format"
  | "traffic_scene"
  | "billing_method"
  | "category"
  | "advertiser_tier";
```

### 6.2 数据源画像

```ts
interface SourceProfileV3 {
  sourceId: string;
  displayLabel: string;
  fileFingerprint: string;
  format: "csv" | "xlsx";
  sheetName?: string;
  sourceRoles: SourceRole[];
  rowCount: number;
  columnCount: number;
  dateRange: { start: string; end: string } | null;
  timeGrain: "event" | "hour" | "day" | "week" | "month" | "unknown";
  dimensionGrain: DimensionId[];
  primaryKeyColumns: string[];
  currency: string | null;
  timezone: "Asia/Shanghai";
  columns: ColumnProfileV3[];
}

interface ColumnProfileV3 {
  sourceName: string;
  inferredType: "date" | "datetime" | "number" | "string" | "boolean" | "unknown";
  semanticGuess: SemanticFieldV3 | "ignored" | "ignored_budget_field" | "unknown";
  confidence: number;
}
```

样例值只在浏览器内显示，不进入持久化画像。

### 6.3 语义字段

```ts
type SemanticFieldV3 =
  | "date"
  | "datetime"
  | "revenue_amount"
  | "actual_ad_spend"
  | "billable_amount"
  | "financial_close_revenue"
  | "monetizable_vv"
  | "ad_opportunities"
  | "ad_requests"
  | "filled_ad_responses"
  | "ad_impressions"
  | "ad_clicks"
  | "ad_conversions"
  | "gmv"
  | "attributed_gmv"
  | "orders"
  | "uv"
  | "pv"
  | "vv"
  | "dau"
  | "avg_bid"
  | "eligible_bidders"
  | "winning_bids"
  | "advertiser_id"
  | "ad_format"
  | "traffic_scene"
  | "billing_method"
  | "category"
  | "advertiser_tier"
  | "active_status"
  | "session_duration"
  | "exit_count"
  | "natural_conversions"
  | "negative_feedback"
  | "strategy_event";
```

预算语义字段不属于 v0.3 合同。识别到预算列时只标记为 `ignored_budget_field`，不传输其数值。

### 6.4 用户确认映射

```ts
interface ConfirmedSourceMappingV3 {
  sourceId: string;
  roles: SourceRole[];
  revenueBasis?: RevenueBasis;
  otherRevenueDefinition?: string;
  fieldMap: Partial<Record<SemanticFieldV3, string>>;
  primaryKeyColumns: string[];
  dimensionGrain: DimensionId[];
  timeGrain: SourceProfileV3["timeGrain"];
  currency: string | null;
  timezone: "Asia/Shanghai";
  confirmedAt: string;
}
```

主收入源必须确认 `revenueBasis`。选择 `financial_close_revenue` 时还需确认结账月份和业务范围。

## 7. 服务端聚合输入合同

### 7.1 指标切片

浏览器在本地完成逐行解析、标准化和关联，只上传聚合切片：

```ts
interface MetricSliceV3 {
  period: {
    start: string;
    end: string;
    grain: "day" | "week" | "month";
  };
  dimensions: Partial<Record<DimensionId, string>>;
  metrics: Partial<{
    revenueAmount: number;
    actualAdSpend: number;
    billableAmount: number;
    financialCloseRevenue: number;
    monetizableVv: number;
    adOpportunities: number;
    adRequests: number;
    filledAdResponses: number;
    adImpressions: number;
    adClicks: number;
    adConversions: number;
    gmv: number;
    attributedGmv: number;
    orders: number;
    uv: number;
    pv: number;
    vv: number;
    dau: number;
    bidAmountSum: number;
    bidCount: number;
    eligibleBidders: number;
    winningBids: number;
    activeAdvertisers: number;
    retainedAdvertisers: number;
    priorActiveAdvertisers: number;
    sessionDurationSeconds: number;
    sessionCount: number;
    exits: number;
    naturalConversions: number;
    naturalOpportunities: number;
    negativeFeedback: number;
  }>;
  sourceRefs: string[];
  qualityRefs: string[];
}
```

### 7.2 完整输入

```ts
interface RevenueAnalysisInputV3 {
  contractVersion: "3.0";
  analysisId: string;
  dataClassification: "demo" | "real";
  createdAt: string;
  asOf: string;
  timezone: "Asia/Shanghai";
  currency: string;
  revenueBasis: RevenueBasis;
  otherRevenueDefinition?: string;
  currentPeriod: { start: string; end: string };
  comparison: {
    type: "previous_period" | "previous_year";
    start: string;
    end: string;
  } | null;
  sourceProfiles: SourceProfileV3[];
  mappings: ConfirmedSourceMappingV3[];
  quality: QualityReportV3;
  slices: MetricSliceV3[];
  strategyEvents: StrategyEventV3[];
}
```

服务端必须再次检查合同版本、请求体积、枚举、日期、币种、数值、数组长度、维度组合和预算禁用规则。

## 8. 输出合同

### 8.1 受治理指标

```ts
interface GovernedMetricV3 {
  id: string;
  label: string;
  status: MetricStatus;
  value: number | null;
  unit: string;
  definition: string;
  formula: string | null;
  period: { start: string; end: string };
  comparisonValue: number | null;
  delta: number | null;
  deltaPct: number | null;
  scope: {
    currency: string | null;
    dimensions: Partial<Record<DimensionId, string>>;
  };
  sourceRefs: string[];
  qualityRefs: string[];
  unavailableReason: string | null;
  limitations: string[];
}
```

### 8.2 路径状态

```ts
interface PathAvailabilityV3 {
  path: AnalysisPath;
  status: "available" | "partial" | "unavailable" | "blocked";
  availableMetricIds: string[];
  missingMetricIds: string[];
  blockerCodes: string[];
  commonDimensions: DimensionId[];
}
```

### 8.3 贡献结果

```ts
interface ContributionBridgeV3 {
  path: "traffic_monetization" | "gmv_monetization";
  method: "shapley_exact" | "two_factor_midpoint";
  comparisonType: "previous_period" | "previous_year";
  startValue: number;
  endValue: number;
  totalDelta: number;
  items: Array<{
    factorId: string;
    label: string;
    contribution: number;
    contributionPct: number | null;
    direction: "positive" | "negative" | "neutral";
    evidenceRefs: string[];
  }>;
  unexplainedResidual: number;
}
```

### 8.4 下钻、健康、护栏和结论

```ts
interface BreakdownRowV3 {
  dimension: DimensionId;
  key: string;
  label: string;
  revenue: GovernedMetricV3;
  comparisonDelta: number | null;
  contribution: number | null;
  metricRefs: string[];
  evidenceRefs: string[];
}

interface AdvertiserHealthResultV3 {
  status: "available" | "partial" | "unavailable" | "blocked";
  activeAdvertisers: GovernedMetricV3;
  newAdvertisers: GovernedMetricV3;
  retainedAdvertisers: GovernedMetricV3;
  churnedAdvertisers: GovernedMetricV3;
  retentionRate: GovernedMetricV3;
  roiP25: GovernedMetricV3;
  roiMedian: GovernedMetricV3;
  roiP75: GovernedMetricV3;
  topAdvertiserContribution: GovernedMetricV3;
}

interface GuardrailResultV3 {
  metric: GovernedMetricV3;
  relationship:
    | "improving"
    | "stable"
    | "deteriorating"
    | "not_comparable";
  wordingConstraint: "descriptive_only" | "experiment_supported";
  evidenceRefs: string[];
}

interface AnalysisClaimV3 {
  id: string;
  type: "fact" | "judgment" | "risk" | "to_verify";
  text: string;
  metricRefs: string[];
  evidenceRefs: string[];
  confidence: "low" | "medium" | "high";
}

interface ManagementBriefV3 {
  headline: string;
  revenuePerformance: string;
  trafficDrivers: string;
  gmvDrivers: string;
  advertiserHealth: string;
  guardrailRisks: string;
  limitations: string[];
  recommendedChecks: string[];
}

interface StrategyEventV3 {
  id: string;
  eventType: string;
  startAt: string;
  endAt: string | null;
  dimensions: Partial<Record<DimensionId, string>>;
  description: string;
  sourceRef: string;
}
```

### 8.5 完整结果

```ts
interface RevenueAnalysisResultV3 {
  contractVersion: "3.0";
  analysisId: string;
  generatedAt: string;
  context: {
    dataClassification: "demo" | "real";
    revenueBasis: RevenueBasis;
    asOf: string;
    currentPeriod: { start: string; end: string };
    comparison: RevenueAnalysisInputV3["comparison"];
    currency: string;
    qualityStatus: QualityStatus;
  };
  pathAvailability: PathAvailabilityV3[];
  metrics: Record<string, GovernedMetricV3>;
  contributionBridges: ContributionBridgeV3[];
  breakdowns: Partial<Record<DimensionId, BreakdownRowV3[]>>;
  advertiserHealth: AdvertiserHealthResultV3;
  guardrails: GuardrailResultV3[];
  claims: AnalysisClaimV3[];
  brief: ManagementBriefV3;
  knownGaps: string[];
  limitations: string[];
}
```

## 9. 指标计算规则

所有除法都必须处理分母为零、负数、缺失和口径不一致。条件不满足时返回不可用，不返回无穷、`NaN` 或补零结果。

### 9.1 广告收入

```text
广告收入 = 当前收入源中、当前期间和当前筛选范围内的有效金额之和
```

要求：

- 收入口径已经确认；
- 币种一致；
- 当前期与比较期使用相同收入定义；
- 负数调整保留，并在限制中说明；
- 月结财务收入只有月度粒度时，只按月展示。

### 9.2 流量变现基础路径

```text
Ad Load = 广告曝光量 ÷ 可商业化 VV
eCPM = 广告收入 ÷ 广告曝光量 × 1,000
广告收入 = 可商业化 VV × Ad Load × eCPM ÷ 1,000
```

这里的 Ad Load 是已经实现的曝光占比，内部已经包含请求、填充和渲染结果，因此不能再额外乘一次填充率。

### 9.3 流量变现展开路径

数据足够时使用：

```text
单位流量广告机会 = 广告机会数 ÷ 可商业化 VV
广告请求率 = 广告请求数 ÷ 广告机会数
填充率 = 成功填充响应数 ÷ 广告请求数
渲染率 = 广告曝光量 ÷ 成功填充响应数

广告收入
= 可商业化 VV
× 单位流量广告机会
× 广告请求率
× 填充率
× 渲染率
× eCPM
÷ 1,000
```

如果数据源没有区分成功填充和曝光，系统只展示基础路径，不根据曝光反推填充率。

### 9.4 竞价效率

```text
CTR = 广告点击量 ÷ 广告曝光量
实际 CPC = 实际广告消耗 ÷ 点击量
CPM = CPM 计费切片的实际广告消耗 ÷ 曝光量 × 1,000
平均出价 = 出价金额总和 ÷ 出价次数
竞价成功率 = 成功竞价次数 ÷ 有效竞价次数
```

约束：

- CPC 只在 CPC 计费切片或明确可比较的实际消耗口径下展示；
- 混合计费大盘使用 eCPM，不将总收入除以点击量后称为 CPC；
- 有效竞价广告主数按广告主 ID 去重，不能将每日去重数直接跨日相加。

### 9.5 GMV 变现路径

```text
广告货币化率 = 广告收入 ÷ GMV
广告收入 = GMV × 广告货币化率
```

要求：

- 收入与 GMV 的期间、币种和业务范围一致；
- 只能在共同维度上计算；
- 广告归因 GMV 不得代替大盘 GMV；
- 未经可靠来源支持，不对货币化率自动判定“高”或“低”。

### 9.6 广告 ARPU

```text
广告 ARPU = 广告收入 ÷ 活跃用户数
```

默认活跃用户使用 DAU。若使用其他活跃口径，指标名称和定义必须随之变化，不能仍标记为 DAU ARPU。

### 9.7 广告主 ROI

```text
广告主 ROI = 归因 GMV ÷ 实际广告消耗
```

要求：

- 分子是经批准归因规则形成的 GMV；
- 分母是实际发生的广告消耗，不是预算；
- 分子分母采用同一广告主、归因窗口、期间和币种；
- 同时输出 P25、中位数和 P75；
- 平均值不作为唯一健康结论。

### 9.8 广告主留存

```text
活跃广告主留存率
= 本期和比较期都活跃的广告主数
÷ 比较期活跃广告主数
```

两个期间必须等长且使用相同“活跃”定义。没有广告主 ID 时不能用聚合数量反推留存。

### 9.9 用户体验护栏

```text
退出率 = 退出次数 ÷ 有效访问次数
自然转化率 = 自然转化次数 ÷ 自然转化机会数
平均停留时长 = 总停留秒数 ÷ 有效会话数
```

本期和比较期同时发生变化只能表述为相关变化。存在实验分组、策略事件和明确时间顺序后，才允许生成更强的因果判断。

## 10. 收入变化贡献算法

### 10.1 为什么不用固定顺序拆解

乘法公式如果按固定顺序依次替换因子，结果会受替换顺序影响。v0.3 使用顺序无关的分解方法。

### 10.2 流量路径

基础三因子：

```text
f(V, A, E) = V × A × E ÷ 1,000
```

使用精确 Shapley 分解：

1. 枚举三个因子的全部六种替换顺序；
2. 计算每个因子在每种顺序下带来的边际收入变化；
3. 对同一因子的边际变化取平均；
4. 三项贡献相加必须等于总收入变化。

展开路径最多六个因子，最多 720 种顺序，在聚合级计算可接受。若未来因子继续增加，必须先重新评估算法复杂度，不自动扩展。

### 10.3 GMV 路径

两因子使用对称中点分解：

```text
GMV 贡献
= (GMV₁ - GMV₀) × (货币化率₀ + 货币化率₁) ÷ 2

货币化率贡献
= (货币化率₁ - 货币化率₀) × (GMV₀ + GMV₁) ÷ 2
```

两项相加应严格等于广告收入变化。

### 10.4 勾稽规则

- 金额层残差绝对值不超过币种最小展示单位；
- 比例层允许显示四舍五入差异；
- 超过阈值时贡献桥状态为 `blocked`；
- 总收入与因子公式不能勾稽时，不输出“主要原因”；
- 维度贡献只在单一维度内部相加，不跨维度重复累计。

## 11. 数据质量与路径阻断

### 11.1 质量报告

```ts
interface QualityCheckV3 {
  id: string;
  status: QualityStatus;
  sourceRefs: string[];
  metricIds: string[];
  message: string;
  affectedPaths: AnalysisPath[];
  recoveryAction: string;
}

interface QualityReportV3 {
  overall: QualityStatus;
  checks: QualityCheckV3[];
  generatedAt: string;
  rulesVersion: string;
}
```

### 11.2 必查项目

- 文件解析；
- 空文件和有效行；
- 日期与时间范围；
- 收入口径确认；
- 币种和单位；
- 主键唯一性；
- 必填字段完整性；
- 负数和极端值；
- 源表粒度与映射声明一致性；
- 跨源关联成功率；
- 共同维度；
- 当前期与比较期可比性；
- 收入与 GMV 范围一致性；
- Ad Load 与填充率重复计算风险；
- 去重广告主的跨日累计风险；
- 财务确收、返点和退款的期间一致性；
- 数据及时性。

### 11.3 阻断传播

```text
源数据 fail
→ 依赖该数据源的指标 blocked
→ 对应分析路径 blocked 或 partial
→ 相关事实结论不生成
→ 管理简报只保留可用路径和质量限制
```

局部路径阻断不应让整个产品失效。例如缺少 GMV 时，流量变现仍可分析；缺少广告请求时，使用基础 Ad Load 路径，不展示填充率。

### 11.4 禁用预算合同

输入验证器拒绝以下业务键进入 v0.3 分析：

```text
monthly_budget
time_phased_budget
budget_attainment
forecast_vs_budget
merchant_budget
budget_utilization
```

上传阶段可以识别这些字段，但只能在浏览器中标记为忽略，其数值不得进入聚合请求、D1、管理简报或飞书。

## 12. API 设计

### 12.1 新接口

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| `GET` | `/api/v3/public/latest` | 读取最新公开脱敏结果 | 匿名只读 |
| `POST` | `/api/v3/analyses` | 创建并运行广告收入分析 | 已登录且获准 |
| `GET` | `/api/v3/analyses/:id` | 读取单次结果 | 所有者或管理员 |
| `GET` | `/api/v3/analyses/latest` | 读取当前用户最近结果 | 已登录 |
| `POST` | `/api/v3/analyses/:id/approve` | 记录人工审核 | 所有者或管理员 |
| `POST` | `/api/v3/analyses/:id/feishu` | 推送已审核简报 | 已审核且允许推送 |

现有：

- `POST /api/analysis/run`
- `GET /api/analysis/latest`

在 v0.3 验收前保留，用于旧线上版本和 GitHub Actions。新页面不得读取旧结果后再与 v0.3 指标混合展示。

### 12.2 创建分析

请求体是 `RevenueAnalysisInputV3`。

响应：

```ts
interface CreateAnalysisResponseV3 {
  ok: true;
  analysisId: string;
  inputDigest: string;
  qualityStatus: QualityStatus;
  result: RevenueAnalysisResultV3;
}
```

服务端：

1. 鉴权；
2. 校验合同和预算禁用规则；
3. 重新计算受治理指标；
4. 生成质量传播和贡献桥；
5. 保存输入摘要与结果；
6. 尝试 AI 语言增强；
7. AI 失败时返回规则简报。

浏览器计算只用于即时预览，服务端保存或推送前必须重新计算，不能信任客户端数字。

### 12.3 审核和飞书

审核请求携带：

- `analysisId`；
- `inputDigest`；
- `confirmed=true`；
- 确认文案版本。

飞书请求携带：

- 已审核分析 ID；
- 已审核 digest；
- 幂等键。

服务端必须再次确认：

- 质量不是 `fail`；
- digest 未变化；
- 当前用户有权限；
- 同一幂等键没有成功发送记录。

## 13. D1 数据模型

保留当前 `analysis_runs`，不删除、不改名。新增：

### 13.1 `revenue_mapping_profiles_v3`

| 字段 | 说明 |
|---|---|
| `id` | UUID |
| `actor_key` | 用户标识的服务端 HMAC |
| `source_fingerprint` | 原文件指纹 |
| `contract_version` | `3.0` |
| `profile_json` | 不含样例值的数据源画像 |
| `mapping_json` | 用户确认映射 |
| `created_at` / `updated_at` | 时间 |

### 13.2 `revenue_analysis_runs_v3`

| 字段 | 说明 |
|---|---|
| `id` | UUID |
| `actor_key` | 所有者 |
| `revenue_basis` | 收入口径 |
| `quality_status` | `pass` / `warn` / `fail` |
| `as_of` | 截止日期 |
| `input_digest` | 聚合输入摘要 |
| `input_json` | 受控聚合输入 |
| `result_json` | 受治理结果 |
| `brief_json` | 管理简报 |
| `engine` / `model` | 生成引擎 |
| `visibility` | `private` / `demo_public` |
| `created_at` / `approved_at` | 时间 |

### 13.3 `feishu_delivery_attempts`

| 字段 | 说明 |
|---|---|
| `id` | UUID |
| `analysis_id` | 分析 ID |
| `actor_key` | 操作人 |
| `input_digest` | 被批准版本 |
| `idempotency_key` | 防重复发送 |
| `channel` | 个人私信或群机器人 |
| `status` | `pending` / `sent` / `failed` |
| `error_category` | 脱敏后的错误分类 |
| `requested_at` / `completed_at` | 时间 |

D1 不保存原始文件、逐行明细、字段样例、密钥或第三方 access token。

只有 `dataClassification="demo"` 的分析可以写入 `demo_public`。真实数据分析始终为 `private`，服务端不提供把真实分析修改为公开的接口。

## 14. 前端模块

不引入新的全局状态库。沿用 React 状态和服务端接口，按业务区域拆分现有大页面。

建议结构：

```text
app/
  page.tsx                       公开看板入口
  workspace/
    page.tsx                     受保护数据工作区

components/revenue-v3/
  AnalysisContextBar.tsx
  MetricCard.tsx
  PathAvailability.tsx
  TrafficMonetizationView.tsx
  GmvMonetizationView.tsx
  ContributionBridge.tsx
  BreakdownTable.tsx
  AdvertiserHealth.tsx
  GuardrailTable.tsx
  EvidenceDrawer.tsx
  BriefReview.tsx

lib/revenue-v3/
  contracts.ts
  profile-source.ts
  mapping.ts
  normalize.ts
  aggregate.ts
  quality.ts
  metrics.ts
  attribution.ts
  format.ts
```

职责：

- 文件解析和逐行映射放在 Web Worker；
- `lib/revenue-v3` 使用纯函数，浏览器预览和测试共用；
- 页面组件不直接实现指标公式；
- 图表消费受治理结果，不从 UI 临时重算；
- 筛选状态写入 URL；
- 不可用状态使用统一组件，不在各页面自行拼接。

图表优先使用现有 CSS 和 SVG 能力。只有在可访问性、键盘操作或性能无法满足时，才评估新增图表依赖。

## 15. Python 模拟数据管道

### 15.1 兼容策略

新增：

```text
data_pipeline/config/source_registry_v3.json
data_pipeline/run_pipeline_v3.py
app/data/dashboard-v3.json
```

在 v0.3 验收前不直接改坏 v1 的 24 源链路。

### 15.2 v0.3 演示数据

v3 注册表不包含：

- 商家预算日表；
- 月度经营目标；
- 预算相关字段。

不再需要预测基线作为 v0.3 核心输入。

新增或调整模拟源：

- 广告请求与填充；
- 与收入同粒度的曝光和点击；
- 大盘 GMV；
- 广告归因 GMV；
- 用户行为；
- 广告主日或月活跃状态。

### 15.3 防止重复展开

模拟数据优先生成到共同事实粒度：

```text
日期×广告主×广告形式×流量场景×计费方式×类目
```

真实数据无法达到该粒度时，使用第 5 节的共同粒度规则。任何指标在加入关联前后都执行总量守恒检查。

## 16. Revenue Skill 与规则引擎

继续使用现有 Skill 名称：

```text
analyze-ecommerce-ad-revenue
```

将版本升级为 `2.0.0`，不新建含义相近的重复 Skill。

需要修改：

- `SKILL.md`：改为双路径收入分析；
- `metric-contracts.md`：加入 Ad Load、填充、eCPM、货币化率、ARPU、ROI 和留存；
- `driver-analysis.md`：加入 Shapley 贡献分解和共同粒度规则；
- `data-quality-and-guardrails.md`：加入粒度、范围和双重计算护栏；
- `management-brief-standard.md`：移除预算和预测结构；
- `evaluation-and-iteration.md`：加入两条路径、缺失数据和收入可持续性案例；
- `validate_brief.py`：替换必填指标并拒绝预算字段；
- `agents/openai.yaml`：更新默认提示。

规则引擎必须先生成完整 `RevenueAnalysisResultV3`。AI 只接收：

- 已治理指标；
- 贡献桥；
- 质量状态；
- 已知事件；
- 可用证据。

AI 不得：

- 修改数值；
- 补造缺失指标；
- 把相关关系写成因果；
- 引入未提供的行业区间；
- 生成预算结论。

## 17. 飞书卡片

v0.3 卡片展示：

- 收入口径和数据截止时间；
- 广告收入及环比或同比；
- 最大收入贡献因素；
- Ad Load 和 eCPM；
- 广告货币化率，数据可用时；
- 广告主 ROI 或留存风险，数据可用时；
- 数据质量和已知缺口；
- 看板链接。

不展示：

- 月底预测；
- 预算完成率；
- 预测较预算；
- 预算风险。

推送卡片使用服务端生成的受治理结果，不能由浏览器自由传入金额或结论。

## 18. GitHub Actions

保留北京时间 09:45 的计划任务，用于：

1. 生成 v3 模拟快照；
2. 运行公式、合同和质量测试；
3. 调用受保护分析接口；
4. 保存公开脱敏结果；
5. 在明确开启时推送飞书。

必须记录：

- `scheduled_at`；
- `started_at`；
- `pipeline_finished_at`；
- `analysis_finished_at`；
- `feishu_sent_at`；
- `completed_at`。

这样可以区分 GitHub 调度延迟、任务执行时间、接口处理时间和飞书发送时间。

用户上传的真实数据不进入 GitHub Actions，也不写入仓库。

## 19. 安全与数据生命周期

### 19.1 请求安全

- 所有写接口验证身份、权限、`Origin` 和 Content-Type；
- 限制文件、行数、聚合切片数和请求体大小；
- 严格校验日期、金额、币种、枚举和字符串长度；
- 导出 CSV 防止公式注入；
- Excel 不执行宏、公式、外部链接和嵌入对象；
- 错误日志不包含原始行、样例值、密钥或授权头；
- 飞书和分析写接口分别限流；
- 分析 ID 不作为权限证明。

### 19.2 数据生命周期

- 原始文件和样例值：浏览器会话内；
- 字段映射：默认保存 90 天；
- 聚合分析和简报：默认保存 90 天；
- 推送审计：默认保存 180 天；
- 公开模拟结果：随版本保留；
- 实际保留期在接入企业真实数据前由数据负责人批准。

## 20. 测试方案

### 20.1 公式单元测试

- Ad Load；
- 请求率、填充率、渲染率；
- eCPM；
- CTR、CPC、CPM；
- 广告货币化率；
- ARPU；
- 广告主 ROI；
- 广告主留存；
- 退出率和自然转化率；
- 分母为零、缺失、负数和极端值。

### 20.2 粒度和守恒测试

- 粗粒度曝光不能下钻到产品；
- 关联前后收入、曝光、GMV 总量不变；
- 跨日广告主去重不能简单相加；
- 月度财务收入不能被复制到每天；
- 不同币种和业务范围阻断比率；
- 共同维度识别正确；
- 不兼容维度显示不可用。

### 20.3 贡献算法测试

- 三因子 Shapley 与总收入变化严格勾稽；
- 展开路径最多六因子仍勾稽；
- GMV 中点分解严格勾稽；
- 因子无变化时贡献为零；
- 收入下降、零基期和负调整场景；
- 维度贡献残差明确展示。

### 20.4 合同测试

- 合法 `3.0` 输入可运行；
- 未知合同版本被拒绝；
- 非法日期、单位、枚举和超大数组被拒绝；
- 不可用指标必须有原因；
- `unconfirmed` 收入口径不能生成收入结论；
- 预算字段不能进入输入、结果、简报和飞书；
- AI 不能覆盖受治理指标；
- 公开结果不能包含原始文件信息或广告主明细；
- 公开接口只能返回 `dataClassification="demo"` 的结果；
- 真实数据即使脱敏也不能写入 `demo_public`；

### 20.5 Worker 集成测试

- 匿名用户只能读取公开结果；
- 未登录用户不能创建、保存、审核或推送真实分析；
- 用户不能读取其他用户结果；
- `fail` 结果不能审核或推送；
- digest 变化后旧审核失效；
- 同一幂等键不会重复发送；
- OpenAI 失败后规则结果仍成功；
- D1 失败不得假报成功。

### 20.6 UI 与可访问性测试

- 收入口径确认；
- 两条路径可用性；
- 局部阻断；
- 筛选和下钻；
- 图表数据表替代；
- 键盘和焦点管理；
- 375、768、1024、1440px；
- 缺失数据不显示为零；
- 页面、图例和简报没有预算内容。

### 20.7 匿名验收夹具

至少维护：

1. 仅收入；
2. 收入 + 曝光 + VV；
3. 收入 + 完整请求/填充链路；
4. 收入 + GMV；
5. 收入 + GMV + 广告交付；
6. 加广告主实际消耗和归因 GMV；
7. 加用户体验护栏；
8. 月结财务收入只有月度粒度；
9. 粒度不一致但可以降级；
10. 粒度不一致且必须阻断；
11. 包含疑似预算字段；
12. 收入口径未确认。

每个夹具包含预期质量、可用路径、指标和贡献结果。

## 21. 发布与回滚

### 21.1 功能开关

```text
ENABLE_AD_REVENUE_V3=false
ALLOW_REAL_DATA_PERSISTENCE=false
ALLOW_MANUAL_FEISHU_PUSH=false
ALLOW_AUTOMATED_FEISHU_PUSH=false
```

发布顺序：

1. 本地匿名夹具；
2. 规则、合同和 UI 测试；
3. v3 模拟数据预览；
4. 测试用户工作区；
5. 人工审核飞书；
6. 公开看板切换到 v3；
7. 最后决定是否恢复自动飞书。

### 21.2 D1 迁移

- 只新增表和索引；
- 不删除现有 `analysis_runs`；
- 迁移脚本进入 Git；
- 先在预览环境验证；
- 旧线上版本不依赖新表。

### 21.3 回滚

出现问题时：

1. 关闭 `ENABLE_AD_REVENUE_V3`；
2. 停止 v3 飞书；
3. 切回上一个已保存的 Sites 版本；
4. 保留新增表用于审计，不执行破坏性回滚；
5. 继续提供旧只读模拟看板；
6. 根据分析 ID、digest 和时间记录定位问题。

## 22. 预计改动范围

| 区域 | v0.3 处理 |
|---|---|
| `app/page.tsx` | 改为消费 v3 结果，逐步拆分组件 |
| `app/globals.css` | 增加双路径、贡献桥、状态和响应式样式 |
| `app/data/` | 新增迁移期 v3 快照 |
| `data_pipeline/` | 新增 v3 注册表、模拟源和粒度安全管道 |
| `worker/revenue-skill.ts` | 升级合同和规则，移除预算输出 |
| `worker/index.ts` | 增加 v3 路由，更新飞书卡片 |
| `db/schema.ts` | 新增 v3 分析、映射和推送审计表 |
| `skills/analyze-ecommerce-ad-revenue/` | 升级至 2.0.0 |
| `.github/workflows/` | 运行 v3 管道、测试和时间审计 |
| `tests/` | 增加公式、粒度、合同、集成和 UI 测试 |

旧预算源文件在迁移阶段先保留但不读取，避免未经确认删除历史文件。v3 验收后再单独决定是否清理。

## 23. 技术验收标准

- [ ] 所有 v0.3 数字由确定性程序计算；
- [ ] 收入口径未确认时不生成收入结论；
- [ ] 流量和 GMV 两条路径可以独立可用、降级或阻断；
- [ ] Ad Load 与填充率不会重复计算；
- [ ] eCPM 公式包含 `× 1,000`，收入回算包含 `÷ 1,000`；
- [ ] 粗粒度指标不会被复制到更细粒度；
- [ ] 关联前后收入、曝光和 GMV 总量守恒；
- [ ] Shapley 和 GMV 中点分解与收入变化勾稽；
- [ ] ROI 使用归因 GMV和实际广告消耗，不使用预算；
- [ ] 页面、API、D1、Skill、简报、飞书和测试均无预算业务输出；
- [ ] 缺失数据返回状态和原因，不补零；
- [ ] AI 不能修改数字或补造原因；
- [ ] 公开看板只读取模拟数据，真实上传数据及其分析结果不能公开；
- [ ] 飞书推送有审核、digest 和幂等保护；
- [ ] GitHub Actions 记录计划、开始、分析和发送时间；
- [ ] 旧线上版本可通过功能开关和 Sites 上一版本恢复；
- [ ] 生产构建、单元测试、合同测试、集成测试和 UI 测试通过。

## 24. 待批准的技术决策

1. 沿用现有技术栈，不重写项目；
2. 使用粒度感知合同，禁止跨粒度复制指标；
3. 流量路径使用精确 Shapley 分解；
4. GMV 路径使用对称中点分解；
5. 浏览器解析原始文件，服务端只接收受控聚合；
6. 只有公开模拟看板匿名可见，真实数据及其分析结果始终受保护；
7. 新增 v3 数据表，不破坏旧 `analysis_runs`；
8. 现有 Revenue Skill 升级到 2.0.0，不创建重复 Skill；
9. 迁移期使用独立 v3 注册表、管道和快照；
10. 旧预算文件暂不删除，但 v3 完全不读取；
11. v0.3 不做月底预测；
12. 验收后再恢复自动飞书。
