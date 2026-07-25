/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import dashboard from "../app/data/dashboard.json";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  FEISHU_PUSH_TOKEN?: string;
  FEISHU_WEBHOOK_URL?: string;
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

function buildFeishuCard(origin: string) {
  const preview = dashboard.pushPreview;
  const kpis = dashboard.kpis;

  return {
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header: {
        template: kpis.forecastVsBudget < 0 ? "orange" : "blue",
        title: {
          tag: "plain_text",
          content: preview.title,
        },
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**经营结论**\n${preview.summary}`,
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
                content: `**累计收入**\n${kpis.mtdRevenue.toFixed(2)} 亿`,
              },
            },
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**同比**\n+${kpis.yoy}%`,
              },
            },
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**月底预测**\n${kpis.forecast.toFixed(2)} 亿`,
              },
            },
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**较预算**\n${kpis.forecastVsBudget}%`,
              },
            },
          ],
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**动因**\n${preview.drivers}`,
          },
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**今日行动**\n${preview.action}`,
          },
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: `数据健康度 ${dashboard.healthSummary.averageScore} 分 · ${dashboard.healthSummary.warning} 个数据源需关注`,
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
    },
  };
}

async function pushToFeishu(request: Request, env: Env) {
  if (!env.FEISHU_PUSH_TOKEN || !env.FEISHU_WEBHOOK_URL) {
    return jsonResponse({ ok: false, error: "Feishu push is not configured." }, 503);
  }

  // Use an app-specific header because the hosting layer reserves
  // `Authorization` for its own sign-in and bypass mechanisms.
  if (request.headers.get("x-revenue-push-token") !== env.FEISHU_PUSH_TOKEN) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const origin = new URL(request.url).origin;
  const feishuResponse = await fetch(env.FEISHU_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(buildFeishuCard(origin)),
  });

  const result = await feishuResponse.json().catch(() => null) as
    | { code?: number; StatusCode?: number; msg?: string; StatusMessage?: string }
    | null;
  const rejected =
    !feishuResponse.ok ||
    (typeof result?.code === "number" && result.code !== 0) ||
    (typeof result?.StatusCode === "number" && result.StatusCode !== 0);

  if (rejected) {
    return jsonResponse(
      {
        ok: false,
        error: result?.msg ?? result?.StatusMessage ?? "Feishu rejected the push.",
      },
      502,
    );
  }

  return jsonResponse({
    ok: true,
    channel: dashboard.pushPreview.channel,
    title: dashboard.pushPreview.title,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/feishu/push") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
      }
      return pushToFeishu(request, env);
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
