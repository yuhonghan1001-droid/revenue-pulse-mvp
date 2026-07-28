import type { MetricStatus, QualityStatus } from "../../lib/revenue-v3/contracts.ts";

const LABELS: Record<MetricStatus | QualityStatus, string> = {
  available: "可用",
  warning: "质量警告",
  unavailable: "不可用",
  pending_confirmation: "口径待确认",
  blocked: "质量阻断",
  pass: "通过",
  warn: "警告",
  fail: "阻断",
};

export function StatusPill({
  status,
}: {
  status: MetricStatus | QualityStatus;
}) {
  return <span className={`rv3-status rv3-status-${status}`}>{LABELS[status]}</span>;
}
