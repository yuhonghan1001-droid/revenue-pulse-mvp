"use client";

import { useMemo, useState } from "react";
import type {
  FieldMappingV3,
  RevenueAnalysisResultV3,
  RevenueBasis,
} from "../../lib/revenue-v3/contracts.ts";
import { runRevenueAnalysisV3 } from "../../lib/revenue-v3/engine.ts";
import {
  buildLocalAnalysisInput,
  parseLocalFile,
  type ParsedLocalFile,
} from "../../lib/revenue-v3/local-file.ts";
import { StatusPill } from "./status-pill";

const BASIS_OPTIONS: Array<[RevenueBasis, string, string]> = [
  ["operating_ad_revenue", "广告经营收入", "用于日常经营规模与动因分析"],
  ["advertiser_spend", "广告实际消耗", "用于广告主实际发生的投放支出"],
  ["billable_amount", "可计费金额", "用于已经形成计费事件的金额"],
  ["financial_close_revenue", "月结实际收入", "仅用于已完成关账的财务结果"],
  ["other", "其他", "需要补充明确的业务定义"],
  ["unconfirmed", "当前无法确认", "只盘点数据，不生成收入结论"],
];

function mappingLabel(mapping: FieldMappingV3) {
  const labels: Record<string, string> = {
    unknown: "待确认",
    ignored_budget_field: "忽略字段",
    date: "日期",
    revenue: "收入",
    actual_ad_spend: "广告实际消耗",
    monetizable_vv: "可商业化 VV",
    opportunities: "广告机会",
    requests: "广告请求",
    filled_requests: "填充请求",
    impressions: "曝光",
    clicks: "点击",
    gmv: "GMV",
    attributed_gmv: "归因 GMV",
    dau: "DAU",
    active_advertisers: "活跃广告主",
    prior_active_advertisers: "上期活跃广告主",
    retained_advertisers: "留存广告主",
    bounce_rate: "退出率",
    average_dwell_seconds: "平均停留时长",
    organic_conversion_rate: "自然转化率",
    advertiser: "广告主",
    ad_format: "广告形式",
    traffic_scene: "流量场景",
    billing_method: "计费方式",
    category: "类目",
    advertiser_tier: "广告主分层",
  };
  return labels[mapping.semanticField] ?? mapping.semanticField;
}

function displayMetric(result: RevenueAnalysisResultV3, id: string) {
  const metric = result.metrics[id];
  if (!metric || metric.value == null) return metric?.reason ?? "不可用";
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(2)}%`;
  if (metric.unit === "CNY") return `¥${metric.value.toLocaleString("zh-CN")}`;
  return metric.value.toLocaleString("zh-CN");
}

export function WorkspaceClient({ displayName }: { displayName: string }) {
  const [files, setFiles] = useState<ParsedLocalFile[]>([]);
  const [basis, setBasis] = useState<RevenueBasis>("unconfirmed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RevenueAnalysisResultV3 | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [approved, setApproved] = useState(false);
  const [mappingStatus, setMappingStatus] = useState("");
  const step = result ? 5 : files.length ? (basis === "unconfirmed" ? 3 : 4) : 1;
  const ignoredFields = useMemo(
    () =>
      files.flatMap((file) =>
        file.mappings.filter((mapping) => mapping.semanticField === "ignored_budget_field"),
      ),
    [files],
  );

  async function onFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      let parsed = await Promise.all([...selected].map(parseLocalFile));
      try {
        const response = await fetch("/api/v3/mapping-profiles");
        if (response.ok) {
          const payload = (await response.json()) as {
            profiles?: Array<{
              profile?: {
                files?: Array<{
                  filename: string;
                  headers: string[];
                  mappings: Array<{
                    sourceColumn: string;
                    semanticField: string;
                    confirmed: boolean;
                  }>;
                }>;
              };
            }>;
          };
          const savedFiles = payload.profiles?.flatMap(
            (profile) => profile.profile?.files ?? [],
          );
          parsed = parsed.map((file) => {
            const saved = savedFiles?.find(
              (candidate) =>
                candidate.filename === file.filename &&
                candidate.headers.join("\u0000") === file.headers.join("\u0000"),
            );
            if (!saved) return file;
            const savedMappings = new Map(
              saved.mappings.map((mapping) => [mapping.sourceColumn, mapping]),
            );
            return {
              ...file,
              mappings: file.mappings.map((mapping) => ({
                ...mapping,
                ...(savedMappings.get(mapping.sourceColumn) ?? {}),
                sourceId: file.sourceId,
              })),
            };
          });
          if (savedFiles?.length) setMappingStatus("已应用最近保存的同结构字段映射");
        }
      } catch {
        // Mapping reuse is optional; local parsing must remain available.
      }
      setFiles(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveMappings() {
    setMappingStatus("");
    const response = await fetch("/api/v3/mapping-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Revenue mapping ${new Date().toISOString().slice(0, 10)}`,
        files: files.map((file) => ({
          filename: file.filename,
          format: file.format,
          headers: file.headers,
          mappings: file.mappings.map((mapping) => ({
            sourceColumn: mapping.sourceColumn,
            semanticField: mapping.semanticField,
            confirmed: mapping.confirmed,
          })),
        })),
      }),
    });
    setMappingStatus(
      response.ok
        ? "字段映射已保存；不包含原始行或样例值"
        : "当前环境未开启字段映射保存",
    );
  }

  function updateMapping(fileIndex: number, mappingIndex: number, semanticField: string) {
    setFiles((current) =>
      current.map((file, index) =>
        index !== fileIndex
          ? file
          : {
              ...file,
              mappings: file.mappings.map((mapping, innerIndex) =>
                innerIndex === mappingIndex
                  ? {
                      ...mapping,
                      semanticField,
                      confirmed: semanticField !== "unknown",
                    }
                  : mapping,
              ),
            },
      ),
    );
    setResult(null);
  }

  async function generate() {
    setBusy(true);
    setError("");
    setApproved(false);
    try {
      const input = buildLocalAnalysisInput(files, basis);
      const local = runRevenueAnalysisV3(input);
      setResult(local);
      try {
        const response = await fetch("/api/v3/analyses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input }),
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            persisted: boolean;
            result: RevenueAnalysisResultV3;
          };
          setResult(payload.result);
          setPersisted(payload.persisted);
        } else {
          setPersisted(false);
        }
      } catch {
        setPersisted(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成分析");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!result) return;
    if (persisted) {
      const response = await fetch(`/api/v3/analyses/${result.analysisId}/approve`, {
        method: "POST",
      });
      if (!response.ok) {
        setError("审核状态未能保存，请稍后重试");
        return;
      }
    }
    setApproved(true);
  }

  async function sendFeishu() {
    if (!result || !approved || !persisted) return;
    const confirmed = window.confirm(
      "确认将已审核简报发送到当前环境配置的飞书收件人？",
    );
    if (!confirmed) return;
    setBusy(true);
    const response = await fetch(`/api/v3/analyses/${result.analysisId}/feishu`, {
      method: "POST",
      headers: { "idempotency-key": `${result.analysisId}-${Date.now()}` },
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    setError(response.ok ? "飞书已发送" : payload?.error ?? "飞书发送失败");
  }

  return (
    <main className="rv3-workspace">
      <header className="rv3-workspace-header">
        <div>
          <a href="/v3">Revenue Pulse</a>
          <span>受保护工作区</span>
        </div>
        <p>
          当前用户：<strong>{displayName}</strong> · 原始文件仅在本浏览器解析
        </p>
      </header>

      <section className="rv3-workspace-shell">
        <div className="rv3-stepper" aria-label="数据准备步骤">
          {["上传文件", "确认数据源", "映射字段", "检查可用性", "生成分析"].map(
            (label, index) => (
              <div className={step >= index + 1 ? "active" : ""} key={label}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </div>
            ),
          )}
        </div>

        <section className="rv3-workspace-card">
          <div className="rv3-section-heading">
            <div>
              <span>LOCAL-FIRST DATA PREP</span>
              <h1>先看看你手里有哪些广告经营数据</h1>
            </div>
            <p>上传 CSV 或 XLSX；系统不会把 Sales 或广告消耗自动当作月结收入。</p>
          </div>
          <label className="rv3-upload">
            <input
              accept=".csv,.tsv,.xlsx"
              disabled={busy}
              multiple
              onChange={(event) => void onFiles(event.target.files)}
              type="file"
            />
            <strong>{busy ? "正在本地解析…" : "选择或拖入数据文件"}</strong>
            <span>支持 CSV、TSV、无宏 XLSX；不会上传原始文件</span>
          </label>
          {error && (
            <p className={error === "飞书已发送" ? "rv3-success" : "rv3-error"} role="alert">
              {error}
            </p>
          )}
        </section>

        {files.length > 0 && (
          <section className="rv3-workspace-card">
            <div className="rv3-section-heading">
              <div>
                <span>FIELD MAPPING</span>
                <h2>确认字段映射</h2>
              </div>
              <p>{files.length} 个文件，映射建议必须由你确认。</p>
            </div>
            {ignoredFields.length > 0 && (
              <div className="rv3-info-banner">
                已识别 {ignoredFields.length} 个本版本不使用的字段，将保持忽略，不进入分析。
              </div>
            )}
            <div className="rv3-mapping-files">
              {files.map((file, fileIndex) => (
                <article key={file.sourceId}>
                  <div>
                    <strong>{file.filename}</strong>
                    <span>
                      {file.rows.length.toLocaleString("zh-CN")} 行 · {file.headers.length} 列
                      {file.sheetName ? ` · ${file.sheetName}` : ""}
                    </span>
                  </div>
                  <div className="rv3-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>原字段</th>
                          <th>样例值</th>
                          <th>系统建议 / 用户确认</th>
                        </tr>
                      </thead>
                      <tbody>
                        {file.mappings.map((mapping, mappingIndex) => (
                          <tr key={mapping.sourceColumn}>
                            <th>{mapping.sourceColumn}</th>
                            <td>{file.rows[0]?.[mapping.sourceColumn] || "空"}</td>
                            <td>
                              <select
                                aria-label={`${mapping.sourceColumn} 字段映射`}
                                disabled={mapping.semanticField === "ignored_budget_field"}
                                onChange={(event) =>
                                  updateMapping(fileIndex, mappingIndex, event.target.value)
                                }
                                value={mapping.semanticField}
                              >
                                <option value="unknown">待确认</option>
                                {Object.entries({
                                  date: "日期",
                                  revenue: "收入",
                                  actual_ad_spend: "广告实际消耗",
                                  monetizable_vv: "可商业化 VV",
                                  opportunities: "广告机会",
                                  requests: "广告请求",
                                  filled_requests: "填充请求",
                                  impressions: "曝光",
                                  clicks: "点击",
                                  gmv: "GMV",
                                  attributed_gmv: "归因 GMV",
                                  dau: "DAU",
                                  active_advertisers: "活跃广告主",
                                  prior_active_advertisers: "上期活跃广告主",
                                  retained_advertisers: "留存广告主",
                                  bounce_rate: "退出率",
                                  average_dwell_seconds: "平均停留时长",
                                  organic_conversion_rate: "自然转化率",
                                  advertiser: "广告主",
                                  ad_format: "广告形式",
                                  traffic_scene: "流量场景",
                                  billing_method: "计费方式",
                                  category: "类目",
                                  advertiser_tier: "广告主分层",
                                }).map(([id, label]) => (
                                  <option key={id} value={id}>
                                    {label}
                                  </option>
                                ))}
                                <option value="ignored_budget_field">忽略字段</option>
                              </select>
                              <small>{mappingLabel(mapping)}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
            <div className="rv3-inline-actions">
              <button
                className="rv3-secondary-button"
                onClick={() => void saveMappings()}
                type="button"
              >
                保存字段映射
              </button>
              {mappingStatus && <span aria-live="polite">{mappingStatus}</span>}
            </div>
          </section>
        )}

        {files.length > 0 && (
          <section className="rv3-workspace-card">
            <div className="rv3-section-heading">
              <div>
                <span>REVENUE IDENTITY</span>
                <h2>确认收入口径</h2>
              </div>
              <p>这是生成收入结论前的必填控制。</p>
            </div>
            <div className="rv3-basis-grid" role="radiogroup" aria-label="收入口径">
              {BASIS_OPTIONS.map(([id, label, description]) => (
                <label className={basis === id ? "active" : ""} key={id}>
                  <input
                    checked={basis === id}
                    name="basis"
                    onChange={() => setBasis(id)}
                    type="radio"
                  />
                  <strong>{label}</strong>
                  <span>{description}</span>
                </label>
              ))}
            </div>
            <button
              className="rv3-primary-button"
              disabled={busy || basis === "unconfirmed"}
              onClick={() => void generate()}
              type="button"
            >
              {busy ? "正在生成…" : "检查可用性并生成分析"}
            </button>
          </section>
        )}

        {result && (
          <section className="rv3-workspace-card">
            <div className="rv3-section-heading">
              <div>
                <span>GOVERNED RESULT</span>
                <h2>分析结果与简报审核</h2>
              </div>
              <StatusPill status={result.qualityStatus} />
            </div>
            <div className="rv3-workspace-results">
              {["revenue", "ad_load", "ecpm", "ad_take_rate", "advertiser_roi"].map(
                (id) => (
                  <article key={id}>
                    <span>{result.metrics[id].label}</span>
                    <strong>{displayMetric(result, id)}</strong>
                    <StatusPill status={result.metrics[id].status} />
                  </article>
                ),
              )}
            </div>
            <div className="rv3-review-box">
              <span>管理简报草稿</span>
              <h3>{result.brief.headline}</h3>
              <p>{result.brief.summary}</p>
              {result.knownGaps.length > 0 && (
                <ul>
                  {result.knownGaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              )}
              <div>
                <button
                  className="rv3-primary-button"
                  disabled={approved}
                  onClick={() => void approve()}
                  type="button"
                >
                  {approved ? "已审核" : "确认口径并批准简报"}
                </button>
                <button
                  className="rv3-secondary-button"
                  disabled={!approved || !persisted || busy}
                  onClick={() => void sendFeishu()}
                  title={!persisted ? "当前环境未开启受保护结果保存" : ""}
                  type="button"
                >
                  人工确认后推送飞书
                </button>
              </div>
              <small>
                {persisted
                  ? "聚合结果已保存到受保护工作区；原始文件未上传。"
                  : "本次结果仅在当前页面保留；当前环境未开启真实聚合结果保存。"}
              </small>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
