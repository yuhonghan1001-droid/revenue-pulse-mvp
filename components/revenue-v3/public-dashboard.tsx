"use client";

import { useMemo, useState } from "react";
import type {
  DimensionId,
  GovernedMetricV3,
  RevenueAnalysisResultV3,
} from "../../lib/revenue-v3/contracts.ts";
import { StatusPill } from "./status-pill";

const DIMENSIONS: Array<[DimensionId, string]> = [
  ["ad_format", "广告形式"],
  ["traffic_scene", "流量场景"],
  ["billing_method", "计费方式"],
  ["category", "类目"],
  ["advertiser_tier", "广告主分层"],
];

function value(metric: GovernedMetricV3) {
  if (metric.value == null) return metric.reason ?? "不可用";
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(2)}%`;
  if (metric.unit === "CNY") {
    if (Math.abs(metric.value) >= 100_000_000) return `¥${(metric.value / 100_000_000).toFixed(2)} 亿`;
    if (Math.abs(metric.value) >= 10_000) return `¥${(metric.value / 10_000).toFixed(1)} 万`;
    return `¥${metric.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  }
  return metric.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function amount(value: number) {
  return `${value >= 0 ? "+" : "−"}¥${(Math.abs(value) / 10_000).toFixed(1)} 万`;
}

function MetricCard({ metric, note }: { metric: GovernedMetricV3; note: string }) {
  return (
    <article className="rv3-metric-card">
      <div className="rv3-card-row">
        <span>{metric.label}</span>
        <StatusPill status={metric.status} />
      </div>
      <strong title={metric.reason}>{value(metric)}</strong>
      <small>{note}</small>
    </article>
  );
}

export function PublicRevenueDashboard({
  result,
}: {
  result: RevenueAnalysisResultV3;
}) {
  const [dimension, setDimension] = useState<DimensionId>("ad_format");
  const slices = useMemo(
    () => result.breakdowns.filter((slice) => slice.dimension === dimension),
    [dimension, result.breakdowns],
  );
  const maxChange = Math.max(
    1,
    ...slices.map((slice) =>
      Math.abs((slice.current.revenue ?? 0) - (slice.comparison.revenue ?? 0)),
    ),
  );
  const traffic = result.contributionBridges.find((bridge) => bridge.id === "traffic_base")!;
  const gmv = result.contributionBridges.find((bridge) => bridge.id === "gmv")!;
  const topTraffic = [...traffic.contributions].sort(
    (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution),
  );

  return (
    <main className="rv3-page" id="main-content">
      <header className="rv3-hero">
        <nav className="rv3-nav" aria-label="公开模拟看板导航">
          <a className="rv3-brand" href="#overview">
            <span className="rv3-brand-mark">RP</span>
            <span>
              <strong>Revenue Pulse</strong>
              <small>广告收入经营分析</small>
            </span>
          </a>
          <div className="rv3-nav-links">
            <a href="#overview">经营概览</a>
            <a href="#attribution">收入归因</a>
            <a href="#health">健康护栏</a>
            <a href="#quality">数据质量</a>
          </div>
          <a className="rv3-nav-action" href="/workspace">
            导入自己的数据
          </a>
        </nav>
        <section className="rv3-hero-content">
          <div>
            <div className="rv3-kicker">
              <span>公开模拟看板</span>
              <StatusPill status={result.qualityStatus} />
            </div>
            <h1>把广告收入拆到可解释、可行动的经营变量</h1>
            <p>
              同时观察流量变现与 GMV 变现，用受治理的模拟数据演示财务 BP
              如何定位收入变化，并检查广告主与用户体验的可持续性。
            </p>
          </div>
          <div className="rv3-context-card" aria-label="分析口径">
            <span>当前收入口径</span>
            <strong>{result.basisLabel}</strong>
            <dl>
              <div>
                <dt>数据截止</dt>
                <dd>{result.asOf}</dd>
              </div>
              <div>
                <dt>比较期间</dt>
                <dd>{result.comparisonLabel}</dd>
              </div>
              <div>
                <dt>数据身份</dt>
                <dd>程序生成模拟</dd>
              </div>
            </dl>
          </div>
        </section>
      </header>

      <section className="rv3-content" id="overview">
        <div className="rv3-section-heading">
          <div>
            <span>EXECUTIVE VIEW</span>
            <h2>经营概览</h2>
          </div>
          <p>{result.brief.headline}</p>
        </div>
        <div className="rv3-metric-grid">
          <MetricCard metric={result.metrics.revenue} note={`对比 ${result.comparisonLabel}`} />
          <MetricCard metric={result.metrics.ad_load} note="曝光 ÷ 可商业化 VV" />
          <MetricCard metric={result.metrics.ecpm} note="每千次曝光收入" />
          <MetricCard metric={result.metrics.ad_take_rate} note="广告收入 ÷ GMV" />
        </div>

        <div className="rv3-path-grid">
          <article className="rv3-panel rv3-path-panel">
            <div className="rv3-panel-head">
              <div>
                <span>TRAFFIC MONETIZATION</span>
                <h3>流量变现路径</h3>
              </div>
              <StatusPill
                status={
                  result.pathAvailability.find((path) => path.id === "traffic_monetization")!
                    .status
                }
              />
            </div>
            <div className="rv3-formula" aria-label="流量变现公式">
              <b>{value(result.metrics.monetizable_vv)}</b>
              <i>×</i>
              <b>{value(result.metrics.ad_load)}</b>
              <i>×</i>
              <b>{value(result.metrics.ecpm)}</b>
              <i>÷ 1000</i>
            </div>
            <div className="rv3-formula-labels">
              <span>可商业化 VV</span>
              <span>Ad Load</span>
              <span>eCPM</span>
              <span />
            </div>
          </article>
          <article className="rv3-panel rv3-path-panel">
            <div className="rv3-panel-head">
              <div>
                <span>GMV MONETIZATION</span>
                <h3>GMV 变现路径</h3>
              </div>
              <StatusPill
                status={
                  result.pathAvailability.find((path) => path.id === "gmv_monetization")!.status
                }
              />
            </div>
            <div className="rv3-formula rv3-formula-two" aria-label="GMV 变现公式">
              <b>{value(result.metrics.gmv)}</b>
              <i>×</i>
              <b>{value(result.metrics.ad_take_rate)}</b>
            </div>
            <div className="rv3-formula-labels rv3-formula-labels-two">
              <span>GMV</span>
              <span>广告货币化率</span>
            </div>
          </article>
        </div>
      </section>

      <section className="rv3-content rv3-section" id="attribution">
        <div className="rv3-section-heading">
          <div>
            <span>REVENUE BRIDGE</span>
            <h2>收入变化归因</h2>
          </div>
          <p>贡献合计与收入变化勾稽；没有实验时只描述贡献，不声明因果。</p>
        </div>
        <div className="rv3-attribution-grid">
          <article className="rv3-panel">
            <div className="rv3-panel-head">
              <div>
                <span>SHAPLEY · 3 FACTORS</span>
                <h3>流量路径贡献</h3>
              </div>
              <strong>{traffic.change == null ? "不可用" : amount(traffic.change)}</strong>
            </div>
            <div className="rv3-bridge-list">
              {topTraffic.map((item) => {
                const max = Math.max(1, ...topTraffic.map((entry) => Math.abs(entry.contribution)));
                return (
                  <div className="rv3-bridge-row" key={item.factor}>
                    <span>{item.label}</span>
                    <div>
                      <i
                        className={item.contribution >= 0 ? "positive" : "negative"}
                        style={{ width: `${Math.max(8, (Math.abs(item.contribution) / max) * 100)}%` }}
                      />
                    </div>
                    <strong>{amount(item.contribution)}</strong>
                  </div>
                );
              })}
            </div>
            <small className="rv3-reconcile">
              残差 {traffic.residual == null ? "不可用" : amount(traffic.residual)}
            </small>
          </article>
          <article className="rv3-panel">
            <div className="rv3-panel-head">
              <div>
                <span>SYMMETRIC MIDPOINT</span>
                <h3>GMV 路径贡献</h3>
              </div>
              <strong>{gmv.change == null ? "不可用" : amount(gmv.change)}</strong>
            </div>
            <div className="rv3-gmv-contributions">
              {gmv.contributions.map((item) => (
                <div key={item.factor}>
                  <span>{item.label}</span>
                  <strong>{amount(item.contribution)}</strong>
                  <small>{item.contribution >= 0 ? "正向贡献" : "负向贡献"}</small>
                </div>
              ))}
            </div>
            <small className="rv3-reconcile">
              残差 {gmv.residual == null ? "不可用" : amount(gmv.residual)}
            </small>
          </article>
        </div>

        <article className="rv3-panel rv3-breakdown-panel">
          <div className="rv3-panel-head rv3-panel-head-wrap">
            <div>
              <span>COMMON-GRAIN DRILL DOWN</span>
              <h3>共同粒度下钻</h3>
            </div>
            <div className="rv3-tabs" role="tablist" aria-label="下钻维度">
              {DIMENSIONS.map(([id, label]) => (
                <button
                  aria-selected={dimension === id}
                  className={dimension === id ? "active" : ""}
                  key={id}
                  onClick={() => setDimension(id)}
                  role="tab"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rv3-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>分组</th>
                  <th>本期收入</th>
                  <th>对比期收入</th>
                  <th>变化</th>
                  <th>相对贡献</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((slice) => {
                  const change =
                    (slice.current.revenue ?? 0) - (slice.comparison.revenue ?? 0);
                  return (
                    <tr key={slice.member}>
                      <th>{slice.member}</th>
                      <td>¥{(slice.current.revenue ?? 0).toLocaleString("zh-CN")}</td>
                      <td>¥{(slice.comparison.revenue ?? 0).toLocaleString("zh-CN")}</td>
                      <td className={change >= 0 ? "rv3-positive-text" : "rv3-negative-text"}>
                        {amount(change)}
                      </td>
                      <td>
                        <div className="rv3-mini-bar">
                          <i
                            className={change >= 0 ? "positive" : "negative"}
                            style={{ width: `${Math.max(5, (Math.abs(change) / maxChange) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="rv3-content rv3-section" id="health">
        <div className="rv3-section-heading">
          <div>
            <span>SUSTAINABILITY</span>
            <h2>广告主健康与体验护栏</h2>
          </div>
          <p>收入增长不能以持续透支广告主回报或自然交易为代价。</p>
        </div>
        <div className="rv3-health-grid">
          {[...result.advertiserHealth, ...result.guardrails].map((metric) => (
            <MetricCard key={metric.id} metric={metric} note={metric.evidence.join(" · ")} />
          ))}
        </div>
      </section>

      <section className="rv3-content rv3-section" id="quality">
        <div className="rv3-section-heading">
          <div>
            <span>GOVERNANCE</span>
            <h2>数据质量与证据链</h2>
          </div>
          <p>每条结论都能回到指标、来源和质量状态。</p>
        </div>
        <div className="rv3-governance-grid">
          <article className="rv3-panel">
            <div className="rv3-panel-head">
              <h3>质量检查</h3>
              <StatusPill status={result.qualityStatus} />
            </div>
            <ul className="rv3-check-list">
              {result.qualityChecks.map((check) => (
                <li key={check.id}>
                  <StatusPill status={check.status} />
                  <span>
                    <strong>{check.label}</strong>
                    <small>{check.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article className="rv3-panel rv3-brief-card">
            <span>管理简报草稿</span>
            <h3>{result.brief.headline}</h3>
            <p>{result.brief.summary}</p>
            <div>
              <strong>{result.claims.length}</strong>
              <small>条受治理结论</small>
              <strong>{result.knownGaps.length}</strong>
              <small>项已知缺口</small>
            </div>
          </article>
        </div>
      </section>

      <footer className="rv3-footer">
        <span>Revenue Pulse v0.3 · 仅展示程序生成模拟数据</span>
        <a href="https://github.com/yuhonghan1001-droid/revenue-pulse-mvp">
          查看 GitHub 使用说明
        </a>
      </footer>
    </main>
  );
}
