/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import dashboard from "../app/data/dashboard.json";
import {
  createRevenueSkillPreview,
  getLatestRevenueSkillState,
  runRevenueSkill,
  type RevenueSkillBrief,
  type RevenueSkillEnv,
} from "./revenue-skill";
import { isAdRevenueV3Enabled } from "./v3/feature-flags";

interface Env extends RevenueSkillEnv {
  ASSETS: Fetcher;
  ENABLE_AD_REVENUE_V3?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_PUSH_TOKEN?: string;
  REVENUE_PUSH_TOKEN?: string;
  FEISHU_RECIPIENT_OPEN_ID?: string;
  FEISHU_WEBHOOK_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function briefTitle(brief: RevenueSkillBrief) {
  const [, month, day] = brief.as_of.slice(0, 10).split("-");
  return `广告收入 Daily Pulse｜${Number(month)} 月 ${Number(day)} 日`;
}

function buildFeishuCard(origin: string, brief: RevenueSkillBrief) {
  const kpis = brief.metrics;
  const forecastGap = kpis.forecast_vs_budget_pct.value;

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      template: forecastGap < 0 ? "orange" : "blue",
      title: {
        tag: "plain_text",
        content: briefTitle(brief),
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**经营结论**\n${brief.summary}`,
        },
      },
      {
        tag: "hr",
      },
      {
        tag: "div",
        fields: [
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**累计收入**\n${kpis.actual_net_revenue.value.toFixed(2)} 亿`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**同比**\n${kpis.yoy_growth_pct.value > 0 ? "+" : ""}${kpis.yoy_growth_pct.value}%`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**月底预测**\n${kpis.month_end_forecast.value.toFixed(2)} 亿`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**较预算**\n${forecastGap > 0 ? "+" : ""}${forecastGap}%`,
            },
          },
        ],
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**动因**\n${brief.drivers_narrative}`,
        },
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**今日行动**\n${brief.action_narrative}`,
        },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `数据状态 ${brief.data_quality.status.toUpperCase()} · Skill ${brief.skill_version} · ${brief.engine === "openai" ? "AI 增强" : "规则引擎"}`,
          },
        ],
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "primary",
            text: {
              tag: "plain_text",
              content: "查看经营看板",
            },
            url: origin,
          },
        ],
      },
    ],
  };
}

async function getTenantAccessToken(env: Env) {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const result = await response.json().catch(() => null) as
    | { code?: number; msg?: string; tenant_access_token?: string }
    | null;

  if (!response.ok || result?.code !== 0 || !result.tenant_access_token) {
    throw new Error(result?.msg ?? "Unable to obtain Feishu tenant access token.");
  }
  return result.tenant_access_token;
}

async function pushDirectMessage(origin: string, env: Env, brief: RevenueSkillBrief) {
  const accessToken = await getTenantAccessToken(env);
  const response = await fetch(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: env.FEISHU_RECIPIENT_OPEN_ID,
        msg_type: "interactive",
        content: JSON.stringify(buildFeishuCard(origin, brief)),
      }),
    },
  );
  const result = await response.json().catch(() => null) as
    | { code?: number; msg?: string }
    | null;

  if (!response.ok || result?.code !== 0) {
    throw new Error(result?.msg ?? "Feishu rejected the direct message.");
  }
}

async function pushGroupMessage(origin: string, env: Env, brief: RevenueSkillBrief) {
  const response = await fetch(env.FEISHU_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: buildFeishuCard(origin, brief),
    }),
  });
  const result = await response.json().catch(() => null) as
    | { code?: number; StatusCode?: number; msg?: string; StatusMessage?: string }
    | null;
  const rejected =
    !response.ok ||
    (typeof result?.code === "number" && result.code !== 0) ||
    (typeof result?.StatusCode === "number" && result.StatusCode !== 0);

  if (rejected) {
    throw new Error(result?.msg ?? result?.StatusMessage ?? "Feishu rejected the group message.");
  }
}

function hasDirectMessageConfig(env: Env) {
  return Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET && env.FEISHU_RECIPIENT_OPEN_ID);
}

function isAuthorized(request: Request, env: Env) {
  const expectedToken = env.REVENUE_PUSH_TOKEN ?? env.FEISHU_PUSH_TOKEN;
  return Boolean(
    expectedToken &&
      request.headers.get("x-revenue-push-token") === expectedToken,
  );
}

async function deliverToFeishu(
  origin: string,
  env: Env,
  brief: RevenueSkillBrief,
) {
  const directMessageConfigured = hasDirectMessageConfig(env);
  if (!directMessageConfigured && !env.FEISHU_WEBHOOK_URL) {
    throw new Error("Feishu push is not configured.");
  }

  if (directMessageConfigured) {
    await pushDirectMessage(origin, env, brief);
  } else {
    await pushGroupMessage(origin, env, brief);
  }
  return directMessageConfigured ? "飞书个人私信" : dashboard.pushPreview.channel;
}

async function pushToFeishu(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const origin = new URL(request.url).origin;
  try {
    const brief = await runRevenueSkill(env);
    const channel = await deliverToFeishu(origin, env, brief);
    return jsonResponse({
      ok: true,
      channel,
      title: briefTitle(brief),
      brief,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Feishu rejected the push.",
      },
      502,
    );
  }
}

async function runAnalysis(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const payload = await request.json().catch(() => ({})) as {
    snapshot?: unknown;
    push?: boolean;
  };
  try {
    const brief = await runRevenueSkill(env, payload.snapshot);
    let channel: string | null = null;
    if (payload.push) {
      channel = await deliverToFeishu(new URL(request.url).origin, env, brief);
    }
    return jsonResponse({
      ok: true,
      channel,
      brief,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Revenue Skill execution failed.",
      },
      500,
    );
  }
}

async function latestAnalysis(env: Env) {
  try {
    const stored = await getLatestRevenueSkillState(env);
    return jsonResponse({
      ok: true,
      persisted: Boolean(stored),
      aiConfigured: Boolean(env.OPENAI_API_KEY),
      storageConfigured: Boolean(env.DB),
      brief: stored?.brief ?? createRevenueSkillPreview(),
      snapshot: stored?.snapshot ?? dashboard,
    });
  } catch {
    return jsonResponse({
      ok: true,
      persisted: false,
      aiConfigured: Boolean(env.OPENAI_API_KEY),
      storageConfigured: false,
      brief: createRevenueSkillPreview(),
      snapshot: dashboard,
    });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/v3/status") {
      if (!isAdRevenueV3Enabled(env.ENABLE_AD_REVENUE_V3)) {
        return new Response("Not found", { status: 404 });
      }
      return jsonResponse({
        ok: true,
        version: "v3",
        state: "scaffolded",
      });
    }

    if (url.pathname === "/api/feishu/push") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
      }
      return pushToFeishu(request, env);
    }

    if (url.pathname === "/api/analysis/run") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
      }
      return runAnalysis(request, env);
    }

    if (url.pathname === "/api/analysis/latest") {
      if (request.method !== "GET") {
        return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
      }
      return latestAnalysis(env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
