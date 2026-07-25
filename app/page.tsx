"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackDashboard from "./data/dashboard.json";

type DimensionKey = "industry" | "product" | "traffic";
type HealthFilter = "全部" | "健康" | "需关注";
type DashboardData = typeof fallbackDashboard;
type BreakdownItem = {
  name: string;
  revenue: number;
  change: number;
  changePct: number | null;
  share: number;
};
type RuntimeBrief = {
  as_of: string;
  generated_at: string;
  engine: "openai" | "rules" | "rules_fallback";
  skill_version: string;
  headline: string;
  summary: string;
  drivers_narrative: string;
  action_narrative: string;
  risk_note: string;
  data_quality: {
    status: "pass" | "warn" | "fail";
  };
  metrics: {
    actual_net_revenue: { value: number };
    yoy_growth_pct: { value: number };
    budget_attainment_pct: { value: number };
    month_end_forecast: { value: number };
    forecast_vs_budget_pct: { value: number };
  };
  actions: Array<{
    action: string;
    owner: string;
    due_date: string;
    trigger: string;
  }>;
};
type RuntimeResponse = {
  ok: boolean;
  persisted: boolean;
  aiConfigured: boolean;
  storageConfigured: boolean;
  brief: RuntimeBrief;
  snapshot: DashboardData;
};

const dimensionLabels: Record<DimensionKey, string> = {
  industry: "行业",
  product: "广告产品",
  traffic: "流量场景",
};

const icon = {
  overview: "◫",
  pulse: "⌁",
  driver: "⌘",
  quality: "◇",
  source: "⊞",
  metric: "≡",
  brief: "✦",
  model: "⌬",
  arrow: "↗",
};

function formatChange(value: number, suffix = "亿") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${suffix}`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function TrendChart({ dashboard }: { dashboard: DashboardData }) {
  const width = 760;
  const height = 260;
  const pad = { left: 44, right: 16, top: 18, bottom: 32 };
  const allValues = dashboard.trend.flatMap((d) =>
    [d.actual, d.forecast, d.budget].filter((v): v is number => v !== null),
  );
  const max = Math.max(...allValues) * 1.08;
  const x = (day: number) =>
    pad.left +
    ((day - 1) / Math.max(dashboard.trend.length - 1, 1)) *
      (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - value / max) * (height - pad.top - pad.bottom);

  const line = (key: "actual" | "forecast" | "budget") => {
    const points = dashboard.trend
      .filter((d) => d[key] !== null)
      .map((d) => `${x(d.day)},${y(d[key] as number)}`);
    return points.join(" ");
  };

  const actualPoints = dashboard.trend.filter((d) => d.actual !== null);
  const currentDay = actualPoints.at(-1)?.day ?? 1;
  const tickDays = Array.from(
    new Set([1, 5, 10, 15, 20, 25, dashboard.trend.length]),
  ).filter((day) => day <= dashboard.trend.length);
  const areaPoints = [
    `${x(actualPoints[0].day)},${height - pad.bottom}`,
    ...actualPoints.map((d) => `${x(d.day)},${y(d.actual as number)}`),
    `${x(actualPoints.at(-1)!.day)},${height - pad.bottom}`,
  ].join(" ");

  return (
    <div className="chart-wrap" aria-label="本月收入累计趋势图">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="areaFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2667ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2667ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = max * ratio;
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(value)}
                y2={y(value)}
                className="grid-line"
              />
              <text x={pad.left - 10} y={y(value) + 4} className="axis-label" textAnchor="end">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        {tickDays.map((day) => (
          <text key={day} x={x(day)} y={height - 8} className="axis-label" textAnchor="middle">
            {day}日
          </text>
        ))}
        <polygon points={areaPoints} fill="url(#areaFade)" />
        <polyline points={line("budget")} className="budget-line" />
        <polyline points={line("forecast")} className="forecast-line" />
        <polyline points={line("actual")} className="actual-line" />
        <line
          x1={x(currentDay)}
          x2={x(currentDay)}
          y1={pad.top}
          y2={height - pad.bottom}
          className="today-line"
        />
        <circle cx={x(currentDay)} cy={y(dashboard.kpis.mtdRevenue)} r="5" className="actual-dot" />
        <text x={x(currentDay) - 7} y={pad.top + 2} className="today-label" textAnchor="end">
          今天
        </text>
      </svg>
    </div>
  );
}

function DataPanel({
  dashboard,
  onClose,
}: {
  dashboard: DashboardData;
  onClose: () => void;
}) {
  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside
        className="data-panel"
        role="dialog"
        aria-modal="true"
        aria-label="数据链路"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-head">
          <div>
            <span className="eyebrow">DATA LINEAGE</span>
            <h2>{dashboard.meta.sourceCount} 个数据源，全部可追溯</h2>
            <p>每个数字都保留来源、更新状态、数据粒度和关联键。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭数据链路">
            ×
          </button>
        </div>

        <section className="quality-summary">
          {dashboard.qualityChecks.map((check) => (
            <div className="quality-item" key={check.name}>
              <span className={`quality-dot ${check.status}`} />
              <div>
                <strong>{check.name}</strong>
                <small>{check.detail}</small>
              </div>
            </div>
          ))}
        </section>

        <div className="lineage-flow" aria-label="数据处理流程">
          <div><strong>{dashboard.meta.sourceCount}</strong><span>源数据集</span></div>
          <b>→</b>
          <div><strong>5</strong><span>质量检查</span></div>
          <b>→</b>
          <div><strong>{dashboard.meta.factRowCount.toLocaleString("zh-CN")}</strong><span>关联明细</span></div>
          <b>→</b>
          <div><strong>1</strong><span>经营事实表</span></div>
        </div>

        <div className="source-list">
          <div className="source-list-head">
            <span>数据源</span><span>质量与关联</span><span>得分</span>
          </div>
          {dashboard.sourceHealth.map((source, index) => (
            <div className="source-row" key={source.id}>
              <div>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><strong>{source.displayName}</strong><small>{source.owner} · {source.lastUpdated.slice(5).replace("T", " ")}</small></span>
              </div>
              <div>
                <strong>完整 {source.completeness}% · 关联 {source.joinRate}%</strong>
                <small>{source.rowCount.toLocaleString("zh-CN")} 行 · {source.coverage}</small>
              </div>
              <span className={`status-pill ${source.healthStatus === "健康" ? "ok" : "late"}`}>
                {source.score}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default function Home() {
  const [dimension, setDimension] = useState<DimensionKey>("industry");
  const [selectedName, setSelectedName] = useState(
    fallbackDashboard.breakdowns.industry[0].name,
  );
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("全部");
  const [selectedMetricId, setSelectedMetricId] = useState(
    fallbackDashboard.metricCatalog[0].id,
  );
  const [selectedLensId, setSelectedLensId] = useState(
    fallbackDashboard.revenueModel.lenses[0].id,
  );
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const dashboard = runtime?.snapshot ?? fallbackDashboard;

  const refreshRuntime = async () => {
    setRuntimeLoading(true);
    try {
      const response = await fetch("/api/analysis/latest", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取最新分析");
      setRuntime((await response.json()) as RuntimeResponse);
    } catch {
      setRuntime(null);
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    void refreshRuntime();
  }, []);

  const currentBreakdown = dashboard.breakdowns[dimension] as BreakdownItem[];
  const selected =
    currentBreakdown.find((item) => item.name === selectedName) ??
    currentBreakdown[0];
  const maxAbsChange = Math.max(
    ...currentBreakdown.map((item) => Math.abs(item.change)),
  );
  const liveBrief = runtime?.brief;
  const liveMtdRevenue =
    liveBrief?.metrics.actual_net_revenue.value ?? dashboard.kpis.mtdRevenue;
  const liveYoy =
    liveBrief?.metrics.yoy_growth_pct.value ?? dashboard.kpis.yoy;
  const liveBudgetAttainment =
    liveBrief?.metrics.budget_attainment_pct.value ??
    dashboard.kpis.budgetAttainment;
  const liveForecast =
    liveBrief?.metrics.month_end_forecast.value ?? dashboard.kpis.forecast;
  const liveForecastGap =
    liveBrief?.metrics.forecast_vs_budget_pct.value ??
    dashboard.kpis.forecastVsBudget;
  const forecastAhead = liveForecastGap >= 0;
  const dataAsOf = dashboard.meta.asOf;
  const latestRunLabel = liveBrief
    ? new Date(liveBrief.generated_at).toLocaleString("zh-CN", {
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "等待首次运行";
  const generatedAtLabel = new Date(dashboard.meta.generatedAt).toLocaleString(
    "zh-CN",
    {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
  const filteredSources = dashboard.sourceHealth.filter(
    (source) => healthFilter === "全部" || source.healthStatus === healthFilter,
  );
  const selectedMetric =
    dashboard.metricCatalog.find((metric) => metric.id === selectedMetricId) ??
    dashboard.metricCatalog[0];
  const selectedLens =
    dashboard.revenueModel.lenses.find((lens) => lens.id === selectedLensId) ??
    dashboard.revenueModel.lenses[0];

  const summaryText = useMemo(
    () =>
      liveBrief
        ? [
            liveBrief.headline,
            liveBrief.summary,
            `经营判断：${liveBrief.drivers_narrative}`,
            `行动：${liveBrief.action_narrative}`,
            `数据风险：${liveBrief.risk_note}`,
          ].join("\n")
        : [
            dashboard.executiveSummary.headline,
            ...dashboard.executiveSummary.facts,
            `经营判断：${dashboard.executiveSummary.judgement}`,
            `待确认：${dashboard.executiveSummary.toVerify}`,
          ].join("\n"),
    [dashboard, liveBrief],
  );

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const changeDimension = (key: DimensionKey) => {
    setDimension(key);
    setSelectedName(dashboard.breakdowns[key][0].name);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div><strong>Revenue Pulse</strong><small>经营罗盘</small></div>
        </div>
        <nav aria-label="主导航">
          <a className="active" href="#overview"><span>{icon.overview}</span>经营总览</a>
          <a href="#revenue-model"><span>{icon.model}</span>收入模型</a>
          <a href="#trend"><span>{icon.pulse}</span>趋势预测</a>
          <a href="#drivers"><span>{icon.driver}</span>动因拆解</a>
          <a href="#data-health"><span>{icon.quality}</span>数据健康</a>
          <a href="#metrics"><span>{icon.metric}</span>指标口径</a>
          <a href="#briefing"><span>{icon.brief}</span>自动简报</a>
        </nav>
        <div className="sidebar-foot">
          <div className="health-ring">{dashboard.healthSummary.averageScore}<small>分</small></div>
          <div><strong>数据健康</strong><span>{dashboard.healthSummary.healthy} 健康 · {dashboard.healthSummary.warning} 关注</span></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="title-row">
              <h1>广告收入经营监控</h1>
              <span className="demo-badge">
                {dashboard.meta.demo ? "模拟数据 · MVP" : "实时数据"}
              </span>
            </div>
            <p>中国电商广告业务 · 数据截至 {formatDateLabel(dataAsOf)}</p>
          </div>
          <div className="header-actions">
            <button className="ghost-button" onClick={() => setShowDataPanel(true)}>
              <span>{icon.source}</span> 查看数据链路
            </button>
            <button className="primary-button" onClick={copySummary}>
              {copied ? "已复制摘要" : "复制管理层摘要"} <span>{copied ? "✓" : icon.arrow}</span>
            </button>
          </div>
        </header>

        <div className="attention-strip">
          <div>
            <span className="attention-icon">!</span>
            <p>
              <strong>今日需关注：</strong>
              {liveBrief?.actions[0]?.action ??
                dashboard.alertRules[0]?.action ??
                "本期关键指标未触发行动阈值，继续监控。"}
            </p>
          </div>
          <button onClick={() => document.getElementById("alerts")?.scrollIntoView({ behavior: "smooth" })}>
            查看 {dashboard.anomalies.length} 项异常 →
          </button>
        </div>

        <section className="kpi-grid" id="overview">
          <article className="kpi-card featured">
            <div className="kpi-head"><span>本月累计收入</span><i>经营净收入</i></div>
            <strong>{liveMtdRevenue.toFixed(2)}<small>亿</small></strong>
            <div className="kpi-foot positive">
              <span>同比 {liveYoy > 0 ? "+" : ""}{liveYoy}%</span>
              <em>截至 {formatDateLabel(dataAsOf)}</em>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>预算完成率</span><i>时间进度 {dashboard.meta.timeProgressPct}%</i></div>
            <strong>{liveBudgetAttainment.toFixed(1)}<small>%</small></strong>
            <div className="progress"><span style={{ width: `${Math.min(liveBudgetAttainment, 100)}%` }} /></div>
            <div className="kpi-foot"><em>月度预算 {dashboard.kpis.monthlyBudget.toFixed(2)} 亿</em></div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>月底预测</span><i>近 7 日 Run-rate</i></div>
            <strong>{liveForecast.toFixed(2)}<small>亿</small></strong>
            <div className={`kpi-foot ${forecastAhead ? "positive" : "negative"}`}>
              <span>较预算 {liveForecastGap > 0 ? "+" : ""}{liveForecastGap}%</span>
              <em>可信度 {dashboard.revenueModel.forecastMethod.confidence}</em>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>数据健康度</span><i>{dashboard.meta.sourceCount} 个数据源</i></div>
            <strong>{dashboard.healthSummary.averageScore}<small>分</small></strong>
            <div className="mini-status">
              <span className="ok">{dashboard.healthSummary.healthy} 健康</span>
              <span className="late">{dashboard.healthSummary.warning} 需关注</span>
            </div>
            <div className="kpi-foot"><em>关联成功率 {dashboard.healthSummary.joinSuccess}%</em></div>
          </article>
        </section>

        <section className="module-section" id="revenue-model">
          <article className="card revenue-model-card">
            <div className="module-head">
              <div>
                <span className="eyebrow">BP REVENUE MODEL</span>
                <h2>财务 BP 收入分析框架</h2>
                <p>先确认结果，再解释驱动，最后落到预测、策略判断和业务行动。</p>
              </div>
              <span className="model-badge">Actual · Budget · Forecast · Drivers</span>
            </div>

            <div className="comparison-frame">
              {dashboard.revenueModel.comparisonFrame.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.note}</small>
                </div>
              ))}
            </div>

            <div className="revenue-model-layout">
              <div className="lens-workbench">
                <div className="lens-tabs" aria-label="切换收入分析视角">
                  {dashboard.revenueModel.lenses.map((lens) => (
                    <button
                      key={lens.id}
                      className={selectedLens.id === lens.id ? "active" : ""}
                      onClick={() => setSelectedLensId(lens.id)}
                    >
                      {lens.name}
                    </button>
                  ))}
                </div>
                <div className="lens-title">
                  <div><span>要回答的问题</span><strong>{selectedLens.question}</strong></div>
                  <code>{selectedLens.formula}</code>
                </div>
                <div className="driver-chain">
                  {selectedLens.nodes.map((node, index) => (
                    <div className="driver-node-wrap" key={node.name}>
                      <div className={`driver-node ${node.value === "待接入" ? "missing" : ""}`}>
                        <span>{node.name}</span>
                        <strong>{node.value}</strong>
                        <small className={node.change.startsWith("+") ? "up" : node.change.startsWith("-") ? "down" : ""}>
                          {node.change}
                        </small>
                      </div>
                      {index < selectedLens.nodes.length - 1 && <i>×</i>}
                    </div>
                  ))}
                </div>
                <div className="model-source-line">
                  <span>证据数据</span>
                  {selectedLens.sourceIds.map((sourceId) => (
                    <button key={sourceId} onClick={() => setShowDataPanel(true)}>
                      {dashboard.sourceHealth.find((source) => source.id === sourceId)?.displayName ?? sourceId}
                    </button>
                  ))}
                </div>
              </div>

              <aside className="forecast-method">
                <span className="eyebrow">LATEST ESTIMATE</span>
                <h3>月底最新预测</h3>
                <strong>{dashboard.revenueModel.forecastMethod.output}</strong>
                <p>{dashboard.revenueModel.forecastMethod.formula}</p>
                <div className="forecast-bridge">
                  <span><small>已实现</small>{dashboard.revenueModel.forecastMethod.actual}</span>
                  <i>+</i>
                  <span><small>剩余基线</small>{dashboard.revenueModel.forecastMethod.baseline}</span>
                </div>
                <div className="forecast-note">
                  <span>假设</span>{dashboard.revenueModel.forecastMethod.adjustment}
                </div>
                <div className="forecast-confidence">
                  <span>预测可信度</span><strong>{dashboard.revenueModel.forecastMethod.confidence}</strong>
                </div>
              </aside>
            </div>

            <div className="knowledge-gaps">
              <div>
                <span className="eyebrow">KNOWN GAPS</span>
                <strong>要进入真实业务，还需补齐</strong>
              </div>
              {dashboard.revenueModel.knowledgeGaps.map((gap) => (
                <div key={gap.name}>
                  <span>{gap.priority}</span>
                  <strong>{gap.name}</strong>
                  <p>{gap.impact}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="main-grid">
          <article className="card trend-card" id="trend">
            <div className="card-head">
              <div>
                <span className="eyebrow">REVENUE TREND</span>
                <h2>本月收入趋势与月底预测</h2>
              </div>
              <div className="legend">
                <span><i className="actual" />实际</span>
                <span><i className="forecast" />预测</span>
                <span><i className="budget" />预算</span>
              </div>
            </div>
            <TrendChart dashboard={dashboard} />
            <div className="chart-caption">
              <span>单位：亿元</span>
              <p>预测基于近 7 日收入 Run-rate，并纳入周末效应与已知策略事件。</p>
            </div>
          </article>

          <article className="card summary-card">
            <div className="summary-accent" />
            <div className="card-head">
              <div>
                <span className="eyebrow">BP BRIEF</span>
                <h2>管理层一句话</h2>
              </div>
              <span className="confidence">可信度 87%</span>
            </div>
            <h3>{dashboard.executiveSummary.headline}</h3>
            <div className="summary-block fact">
              <span>事实</span>
              <p>{dashboard.executiveSummary.facts[0]} {dashboard.executiveSummary.facts[1]}</p>
            </div>
            <div className="summary-block judgement">
              <span>判断</span>
              <p>{dashboard.executiveSummary.judgement}</p>
            </div>
            <div className="summary-block verify">
              <span>待确认</span>
              <p>{dashboard.executiveSummary.toVerify}</p>
            </div>
            <button className="summary-copy" onClick={copySummary}>
              {copied ? "摘要已复制，可直接发送" : "复制完整摘要"}
            </button>
          </article>
        </section>

        <section className="lower-grid" id="drivers">
          <article className="card driver-card">
            <div className="card-head driver-head">
              <div>
                <span className="eyebrow">DRIVER ANALYSIS</span>
                <h2>变化发生在哪里？</h2>
              </div>
              <div className="segment-control" aria-label="切换分析维度">
                {(Object.keys(dimensionLabels) as DimensionKey[]).map((key) => (
                  <button
                    key={key}
                    className={dimension === key ? "active" : ""}
                    onClick={() => changeDimension(key)}
                  >
                    {dimensionLabels[key]}
                  </button>
                ))}
              </div>
            </div>
            <div className="driver-layout">
              <div className="breakdown-list">
                {currentBreakdown.slice(0, 6).map((item) => (
                  <button
                    key={item.name}
                    className={selected.name === item.name ? "selected" : ""}
                    onClick={() => setSelectedName(item.name)}
                  >
                    <span className="breakdown-name">
                      <strong>{item.name}</strong>
                      <small>收入 {item.revenue.toFixed(2)} 亿 · 占比 {item.share}%</small>
                    </span>
                    <span className="bar-track">
                      <i
                        className={item.change >= 0 ? "up" : "down"}
                        style={{ width: `${Math.max(14, Math.abs(item.change) / maxAbsChange * 100)}%` }}
                      />
                    </span>
                    <em className={item.change >= 0 ? "up" : "down"}>
                      {formatChange(item.change)}
                    </em>
                  </button>
                ))}
              </div>
              <aside className="driver-insight">
                <span className="insight-label">已选 {dimensionLabels[dimension]}</span>
                <h3>{selected.name}</h3>
                <strong className={selected.change >= 0 ? "up" : "down"}>
                  {formatChange(selected.change)}
                </strong>
                <p>
                  同比{selected.changePct !== null && selected.changePct >= 0 ? "增长" : "下降"}{" "}
                  {Math.abs(selected.changePct ?? 0)}%，
                  {selected.change >= 0
                    ? "主要由投放商家数和人均消耗共同拉动。"
                    : "主要受到活跃商家数及预算利用率下降影响。"}
                </p>
                <div className="evidence-row">
                  <span><small>收入贡献</small><strong>{selected.share}%</strong></span>
                  <span><small>同比变化</small><strong>{selected.changePct}%</strong></span>
                </div>
                <button>查看明细证据 →</button>
              </aside>
            </div>
          </article>

          <article className="card alert-card" id="alerts">
            <div className="card-head">
              <div>
                <span className="eyebrow">WATCHLIST</span>
                <h2>异常与机会</h2>
              </div>
              <span className="alert-count">{dashboard.anomalies.length} 项</span>
            </div>
            <div className="alert-list">
              {dashboard.anomalies.map((item) => (
                <div className="alert-row" key={item.title}>
                  <span className={`level ${item.level === "高" ? "high" : item.level === "机会" ? "opportunity" : "medium"}`}>
                    {item.level}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.evidence}</p>
                    <small>{item.status}</small>
                  </div>
                  <em className={item.impact.startsWith("+") ? "up" : "down"}>{item.impact}</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="module-section" id="data-health">
          <article className="card health-center">
            <div className="module-head">
              <div>
                <span className="eyebrow">DATA HEALTH CENTER</span>
                <h2>{dashboard.meta.sourceCount} 个数据源健康中心</h2>
                <p>不是只看任务有没有跑完，而是同时检查及时性、完整性、唯一性和关联成功率。</p>
              </div>
              <button className="ghost-button" onClick={() => setShowDataPanel(true)}>
                查看完整数据链路 <span>{icon.arrow}</span>
              </button>
            </div>

            <div className="health-overview">
              <div className="health-score-card">
                <div className="large-health-ring">{dashboard.healthSummary.averageScore}<small>/100</small></div>
                <div>
                  <span>综合健康得分</span>
                  <strong>
                    {dashboard.healthSummary.blocked > 0
                      ? "存在阻断数据，暂不发布结论"
                      : "整体可用于经营分析"}
                  </strong>
                  <small>
                    {dashboard.healthSummary.warning > 0
                      ? `${dashboard.healthSummary.warning} 个数据源需在归因前复核`
                      : "关键数据源均通过质量检查"}
                  </small>
                </div>
              </div>
              <div className="health-stat"><span>健康数据源</span><strong>{dashboard.healthSummary.healthy}<small>/{dashboard.meta.sourceCount}</small></strong><em className="up">关键事实表已完成检查</em></div>
              <div className="health-stat"><span>本次处理数据</span><strong>{dashboard.healthSummary.totalRows.toLocaleString("zh-CN")}<small>行</small></strong><em>含 {dashboard.meta.factRowCount.toLocaleString("zh-CN")} 行经营事实</em></div>
              <div className="health-stat"><span>关联成功率</span><strong>{dashboard.healthSummary.joinSuccess}<small>%</small></strong><em>主键与维表均可追溯</em></div>
            </div>

            <div className="health-toolbar">
              <div className="filter-tabs" aria-label="筛选数据源健康状态">
                {(["全部", "健康", "需关注"] as HealthFilter[]).map((filter) => (
                  <button
                    key={filter}
                    className={healthFilter === filter ? "active" : ""}
                    onClick={() => setHealthFilter(filter)}
                  >
                    {filter}
                    <span>
                      {filter === "全部"
                        ? dashboard.sourceHealth.length
                        : dashboard.sourceHealth.filter((source) => source.healthStatus === filter).length}
                    </span>
                  </button>
                ))}
              </div>
              <p><span className="live-dot" /> 最近检查：{generatedAtLabel}</p>
            </div>

            <div className="health-table" role="table" aria-label="数据源健康明细">
              <div className="health-table-row health-table-head" role="row">
                <span>数据源 / 负责人</span>
                <span>数据量</span>
                <span>完整性</span>
                <span>关联率</span>
                <span>最后更新</span>
                <span>状态</span>
              </div>
              {filteredSources.map((source) => (
                <div className="health-table-row" role="row" key={source.id}>
                  <div className="source-identity">
                    <i>{source.category.slice(0, 2)}</i>
                    <span><strong>{source.displayName}</strong><small>{source.owner} · {source.sla}</small></span>
                  </div>
                  <span>{source.rowCount.toLocaleString("zh-CN")} 行<small>{source.coverage}</small></span>
                  <span>{source.completeness}%<small>{source.duplicateCount} 条重复</small></span>
                  <span>{source.joinRate}%<small>Key: {source.join_key}</small></span>
                  <span>{source.lastUpdated.slice(5).replace("T", " ")}<small>{source.status}</small></span>
                  <span className={`health-status ${source.healthStatus === "健康" ? "healthy" : "warning"}`}>
                    <b>{source.score}</b>{source.healthStatus}
                  </span>
                  {source.issue !== "无异常" && <p className="source-issue">{source.issue}</p>}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="metric-section" id="metrics">
          <article className="card metric-catalog">
            <div className="module-head">
              <div>
                <span className="eyebrow">METRIC CONTRACTS</span>
                <h2>指标口径中心</h2>
                <p>一套口径同时服务看板、Excel、管理层推送和 AI Agent。</p>
              </div>
              <span className="certified-badge">{dashboard.metricCatalog.length} 个治理指标</span>
            </div>
            <div className="metric-layout">
              <div className="metric-list">
                {dashboard.metricCatalog.map((metric) => (
                  <button
                    key={metric.id}
                    className={selectedMetric.id === metric.id ? "selected" : ""}
                    onClick={() => setSelectedMetricId(metric.id)}
                  >
                    <span><strong>{metric.name}</strong><small>{metric.owner} · {metric.status}</small></span>
                    <em>{metric.value}</em>
                    <i>›</i>
                  </button>
                ))}
              </div>
              <aside className="metric-detail">
                <div className="metric-detail-head">
                  <span>{selectedMetric.status}</span>
                  <small>Metric ID · {selectedMetric.id}</small>
                </div>
                <h3>{selectedMetric.name}</h3>
                <strong>{selectedMetric.value}</strong>
                <p>{selectedMetric.definition}</p>
                <dl>
                  <div><dt>统一公式</dt><dd>{selectedMetric.formula}</dd></div>
                  <div><dt>统计粒度</dt><dd>{selectedMetric.grain}</dd></div>
                  <div><dt>更新频率</dt><dd>{selectedMetric.refresh}</dd></div>
                  <div><dt>对账说明</dt><dd>{selectedMetric.reconciliation}</dd></div>
                </dl>
                <div className="source-chips">
                  <span>依赖数据</span>
                  <div>
                    {selectedMetric.sourceIds.map((sourceId) => (
                      <button
                        key={sourceId}
                        onClick={() => setShowDataPanel(true)}
                        title="查看数据链路"
                      >
                        {dashboard.sourceHealth.find((source) => source.id === sourceId)?.displayName ?? sourceId}
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </article>
        </section>

        <section className="briefing-grid" id="briefing">
          <article className="card evidence-card">
            <div className="module-head">
              <div>
                <span className="eyebrow">EXPLAINABLE BRIEF</span>
                <h2>经营结论证据链</h2>
                <p>AI 只负责组织语言；事实、预测和判断均由已认证指标生成。</p>
              </div>
              <span className="trace-badge">100% 可回溯</span>
            </div>
            <div className="evidence-timeline">
              {dashboard.evidenceChain.map((item, index) => (
                <div className="evidence-step" key={item.claim}>
                  <span className={`evidence-type type-${index}`}>{item.type}</span>
                  <div>
                    <strong>{item.claim}</strong>
                    <p>{item.logic}</p>
                    <div className="evidence-meta">
                      <span>可信度 {item.confidence}%</span>
                      <span>指标 {dashboard.metricCatalog.find((metric) => metric.id === item.metricId)?.name}</span>
                      <span>{item.sourceIds.length} 个数据源</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    setSelectedMetricId(item.metricId);
                    document.getElementById("metrics")?.scrollIntoView({ behavior: "smooth" });
                  }}>
                    查证据
                  </button>
                </div>
              ))}
            </div>
          </article>

          <aside className="card push-card">
            <div className="push-window">
              <div className="push-window-head">
                <span className="push-logo">R</span>
                <div><strong>{dashboard.pushPreview.title}</strong><small>{dashboard.pushPreview.channel} · {dashboard.pushPreview.cadence}</small></div>
                <i>•••</i>
              </div>
              <p>{liveBrief?.summary ?? dashboard.pushPreview.summary}</p>
              <div className="push-line"><span>动因</span>{liveBrief?.drivers_narrative ?? dashboard.pushPreview.drivers}</div>
              <div className="push-line action"><span>行动</span>{liveBrief?.action_narrative ?? dashboard.pushPreview.action}</div>
              <button onClick={copySummary}>{copied ? "已复制" : "复制并发送"}</button>
            </div>
            <div className="push-settings">
              <span className="eyebrow">PUSH PREVIEW</span>
              <h2>自动推送预览</h2>
              <dl>
                <div><dt>接收人</dt><dd>{dashboard.pushPreview.audience}</dd></div>
                <div><dt>触发方式</dt><dd>每日定时 + 异常即时</dd></div>
                <div><dt>数据保护</dt><dd>延迟数据自动标记“待确认”</dd></div>
                <div><dt>接入状态</dt><dd><span className="connected-dot" /> 飞书个人私信已连接</dd></div>
                <div><dt>收入 Skill</dt><dd><span className="connected-dot" /> 已接入 · v{liveBrief?.skill_version ?? "1.0.0"}</dd></div>
                <div>
                  <dt>执行引擎</dt>
                  <dd>
                    {runtimeLoading
                      ? "正在读取"
                      : liveBrief?.engine === "openai"
                        ? "OpenAI 增强"
                        : "可审计规则引擎"}
                  </dd>
                </div>
                <div><dt>最近运行</dt><dd>{latestRunLabel}</dd></div>
                <div><dt>版本存档</dt><dd>{runtime?.persisted ? "已保存数据快照与分析结果" : "等待首次定时运行"}</dd></div>
              </dl>
              <button
                className="skill-runtime-button"
                onClick={() => void refreshRuntime()}
                disabled={runtimeLoading}
              >
                {runtimeLoading ? "正在加载…" : "读取最新 Skill 结果"}
              </button>
            </div>
          </aside>
        </section>

        <section className="module-section">
          <article className="card rules-card">
            <div className="module-head">
              <div>
                <span className="eyebrow">ALERT AUTOMATION</span>
                <h2>本期已触发的监控规则</h2>
              </div>
              <span className="alert-count">{dashboard.alertRules.length} 条已触发</span>
            </div>
            <div className="rule-grid">
              {dashboard.alertRules.map((rule, index) => (
                <div className="rule-item" key={rule.name}>
                  <span className={`rule-number rule-${index}`}>0{index + 1}</span>
                  <div>
                    <strong>{rule.name}</strong>
                    <p>{rule.metric} · {rule.condition}</p>
                    <small>当前：{rule.actual}</small>
                  </div>
                  <div className="rule-action">
                    <span>{rule.owner}</span>
                    <p>{rule.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <footer>
          <div><span className="live-dot" /> 数据管道最近运行：{latestRunLabel} · {dashboard.healthSummary.totalRows.toLocaleString("zh-CN")} 行已校验</div>
          <p>
            {dashboard.meta.demo
              ? "本页面使用模拟业务数据，仅用于能力展示与方案验证。"
              : "本页面展示最近一次已保存的业务数据快照。"}
          </p>
        </footer>
      </section>

      {showDataPanel && (
        <DataPanel
          dashboard={dashboard}
          onClose={() => setShowDataPanel(false)}
        />
      )}
    </main>
  );
}
