import type { RevenueAnalysisResultV3 } from "../../lib/revenue-v3/contracts.ts";

export interface FeishuV3Env {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_RECIPIENT_OPEN_ID?: string;
}

function displayValue(value: number | null, unit: string) {
  if (value == null) return "不可用";
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  if (unit === "CNY") {
    return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value)}`;
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function topContribution(result: RevenueAnalysisResultV3) {
  const bridge = result.contributionBridges.find((item) => item.status === "available");
  if (!bridge) return "贡献分解暂不可用";
  const item = [...bridge.contributions].sort(
    (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution),
  )[0];
  return item
    ? `${item.label} ${item.contribution >= 0 ? "+" : ""}${displayValue(item.contribution, "CNY")}`
    : "暂无可展示贡献";
}

export function buildFeishuCardV3(origin: string, result: RevenueAnalysisResultV3) {
  const revenue = result.metrics.revenue;
  const adLoad = result.metrics.ad_load;
  const eCpm = result.metrics.ecpm;
  const takeRate = result.metrics.ad_take_rate;
  const health =
    result.metrics.advertiser_roi.status === "available"
      ? result.metrics.advertiser_roi
      : result.metrics.advertiser_retention;
  return {
    config: { wide_screen_mode: true, enable_forward: false },
    header: {
      template: result.qualityStatus === "fail" ? "orange" : "turquoise",
      title: {
        tag: "plain_text",
        content: `Revenue Pulse｜${result.asOf}`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**${result.basisLabel}** · ${result.classification === "demo" ? "模拟数据" : "受保护数据"}\n${result.brief.headline}`,
        },
      },
      {
        tag: "div",
        fields: [
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**收入**\n${displayValue(revenue.value, revenue.unit)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**最大贡献**\n${topContribution(result)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**Ad Load**\n${displayValue(adLoad.value, adLoad.unit)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**eCPM**\n${displayValue(eCpm.value, eCpm.unit)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**广告货币化率**\n${displayValue(takeRate.value, takeRate.unit)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**${health.label}**\n${displayValue(health.value, health.unit)}`,
            },
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `质量 ${result.qualityStatus.toUpperCase()} · 缺口 ${result.knownGaps.length} 项 · 已人工审核`,
          },
        ],
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "primary",
            text: { tag: "plain_text", content: "查看受治理分析" },
            url: result.classification === "demo" ? `${origin}/v3` : `${origin}/workspace`,
          },
        ],
      },
    ],
  };
}

export async function sendFeishuDirectMessageV3(
  origin: string,
  env: FeishuV3Env,
  result: RevenueAnalysisResultV3,
) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET || !env.FEISHU_RECIPIENT_OPEN_ID) {
    throw new Error("飞书个人私信尚未配置");
  }
  const tokenResponse = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    },
  );
  const tokenResult = (await tokenResponse.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
  } | null;
  if (!tokenResponse.ok || tokenResult?.code !== 0 || !tokenResult.tenant_access_token) {
    throw new Error(tokenResult?.msg ?? "无法获取飞书访问令牌");
  }
  const response = await fetch(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenResult.tenant_access_token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: env.FEISHU_RECIPIENT_OPEN_ID,
        msg_type: "interactive",
        content: JSON.stringify(buildFeishuCardV3(origin, result)),
      }),
    },
  );
  const sendResult = (await response.json().catch(() => null)) as {
    code?: number;
    msg?: string;
  } | null;
  if (!response.ok || sendResult?.code !== 0) {
    throw new Error(sendResult?.msg ?? "飞书拒绝发送");
  }
}
