"use client";

import { useMemo, useState } from "react";
import dashboard from "./data/dashboard.json";

type DimensionKey = "industry" | "product" | "traffic";
type BreakdownItem = {
  name: string;
  revenue: number;
  change: number;
  changePct: number | null;
  share: number;
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
  arrow: "↗",
};

function formatChange(value: number, suffix = "亿") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${suffix}`;
}

function TrendChart() {
  const width = 760;
  const height = 260;
  const pad = { left: 44, right: 16, top: 18, bottom: 32 };
  const allValues = dashboard.trend.flatMap((d) =>
    [d.actual, d.forecast, d.budget].filter((v): v is number => v !== null),
  );
  const max = Math.max(...allValues) * 1.08;
  const x = (day: number) =>
    pad.left + ((day - 1) / 30) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - value / max) * (height - pad.top - pad.bottom);

  const line = (key: "actual" | "forecast" | "budget") => {
    const points = dashboard.trend
      .filter((d) => d[key] !== null)
      .map((d) => `${x(d.day)},${y(d[key] as number)}`);
    return points.join(" ");
  };

  const actualPoints = dashboard.trend.filter((d) => d.actual !== null);
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
        {[1, 5, 10, 15, 20, 25, 31].map((day) => (
          <text key={day} x={x(day)} y={height - 8} className="axis-label" textAnchor="middle">
            {day}日
          </text>
        ))}
        <polygon points={areaPoints} fill="url(#areaFade)" />
        <polyline points={line("budget")} className="budget-line" />
        <polyline points={line("forecast")} className="forecast-line" />
        <polyline points={line("actual")} className="actual-line" />
        <line
          x1={x(25)}
          x2={x(25)}
          y1={pad.top}
          y2={height - pad.bottom}
          className="today-line"
        />
        <circle cx={x(25)} cy={y(dashboard.kpis.mtdRevenue)} r="5" className="actual-dot" />
        <text x={x(25) - 7} y={pad.top + 2} className="today-label" textAnchor="end">
          今天
        </text>
      </svg>
    </div>
  );
}

function DataPanel({ onClose }: { onClose: () => void }) {
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
            <h2>24 个数据源，全部可追溯</h2>
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
          <div><strong>24</strong><span>源数据集</span></div>
          <b>→</b>
          <div><strong>5</strong><span>质量检查</span></div>
          <b>→</b>
          <div><strong>27,408</strong><span>关联明细</span></div>
          <b>→</b>
          <div><strong>1</strong><span>经营事实表</span></div>
        </div>

        <div className="source-list">
          <div className="source-list-head">
            <span>数据源</span><span>粒度 / 关联键</span><span>状态</span>
          </div>
          {dashboard.sources.map((source, index) => (
            <div className="source-row" key={source.id}>
              <div>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><strong>{source.id}</strong><small>{source.owner}</small></span>
              </div>
              <div>
                <strong>{source.grain}</strong>
                <small>Key: {source.join_key}</small>
              </div>
              <span className={`status-pill ${source.status === "按时" ? "ok" : "late"}`}>
                {source.status}
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
    dashboard.breakdowns.industry[0].name,
  );
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentBreakdown = dashboard.breakdowns[dimension] as BreakdownItem[];
  const selected =
    currentBreakdown.find((item) => item.name === selectedName) ??
    currentBreakdown[0];
  const maxAbsChange = Math.max(
    ...currentBreakdown.map((item) => Math.abs(item.change)),
  );
  const forecastAhead = dashboard.kpis.forecastVsBudget >= 0;

  const summaryText = useMemo(
    () =>
      [
        dashboard.executiveSummary.headline,
        ...dashboard.executiveSummary.facts,
        `经营判断：${dashboard.executiveSummary.judgement}`,
        `待确认：${dashboard.executiveSummary.toVerify}`,
      ].join("\n"),
    [],
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
          <a href="#trend"><span>{icon.pulse}</span>趋势预测</a>
          <a href="#drivers"><span>{icon.driver}</span>动因拆解</a>
          <button onClick={() => setShowDataPanel(true)}><span>{icon.quality}</span>数据质量</button>
        </nav>
        <div className="sidebar-foot">
          <div className="health-ring">96<small>%</small></div>
          <div><strong>数据健康</strong><span>23 / 24 按时</span></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="title-row">
              <h1>广告收入经营监控</h1>
              <span className="demo-badge">模拟数据 · MVP</span>
            </div>
            <p>中国电商广告业务 · 数据截至 2026 年 7 月 25 日</p>
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
            <p><strong>今日需关注：</strong>搜索流量收入连续 4 日低于基线，预计影响本月收入 0.18 亿。</p>
          </div>
          <button onClick={() => document.getElementById("alerts")?.scrollIntoView({ behavior: "smooth" })}>
            查看 3 项异常 →
          </button>
        </div>

        <section className="kpi-grid" id="overview">
          <article className="kpi-card featured">
            <div className="kpi-head"><span>本月累计收入</span><i>经营净收入</i></div>
            <strong>{dashboard.kpis.mtdRevenue.toFixed(2)}<small>亿</small></strong>
            <div className="kpi-foot positive">
              <span>同比 +{dashboard.kpis.yoy}%</span>
              <em>较上月同期 +0.12 亿</em>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>预算完成率</span><i>时间进度 80.6%</i></div>
            <strong>{dashboard.kpis.budgetAttainment.toFixed(1)}<small>%</small></strong>
            <div className="progress"><span style={{ width: `${Math.min(dashboard.kpis.budgetAttainment, 100)}%` }} /></div>
            <div className="kpi-foot"><em>月度预算 {dashboard.kpis.monthlyBudget.toFixed(2)} 亿</em></div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>月底预测</span><i>近 7 日 Run-rate</i></div>
            <strong>{dashboard.kpis.forecast.toFixed(2)}<small>亿</small></strong>
            <div className={`kpi-foot ${forecastAhead ? "positive" : "negative"}`}>
              <span>较预算 {dashboard.kpis.forecastVsBudget > 0 ? "+" : ""}{dashboard.kpis.forecastVsBudget}%</span>
              <em>置信区间 ±0.08 亿</em>
            </div>
          </article>
          <article className="kpi-card">
            <div className="kpi-head"><span>数据健康度</span><i>24 个数据源</i></div>
            <strong>{dashboard.kpis.dataHealth}<small>%</small></strong>
            <div className="mini-status">
              <span className="ok">23 按时</span>
              <span className="late">1 延迟</span>
            </div>
            <div className="kpi-foot"><em>转化数据更新至 7 月 24 日</em></div>
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
            <TrendChart />
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
              <span className="alert-count">3 项</span>
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

        <footer>
          <div><span className="live-dot" /> 数据管道最近运行：2026-07-25 09:31</div>
          <p>本页面使用模拟业务数据，仅用于能力展示与方案验证。</p>
        </footer>
      </section>

      {showDataPanel && <DataPanel onClose={() => setShowDataPanel(false)} />}
    </main>
  );
}
