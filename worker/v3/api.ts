import dashboardV3 from "../../app/data/dashboard-v3.json";
import type { RevenueAnalysisInputV3 } from "../../lib/revenue-v3/contracts.ts";
import { validateRevenueAnalysisInputV3 } from "../../lib/revenue-v3/contracts.ts";
import { runRevenueAnalysisV3 } from "../../lib/revenue-v3/engine.ts";
import { isExplicitlyEnabled } from "./feature-flags";
import { sendFeishuDirectMessageV3 } from "./feishu";
import {
  approveAnalysisV3,
  finishDeliveryAttempt,
  getAnalysisV3,
  getDeliveryAttemptByKey,
  getPrivateLatestV3,
  getPublicLatestV3,
  listMappingProfilesV3,
  saveAnalysisV3,
  saveMappingProfileV3,
  startDeliveryAttempt,
} from "./storage";

export interface RevenueV3Env {
  DB?: D1Database;
  ALLOW_REAL_DATA_PERSISTENCE?: string;
  ALLOW_MANUAL_FEISHU_PUSH?: string;
  ALLOW_AUTOMATED_FEISHU_PUSH?: string;
  REVENUE_WORKSPACE_ALLOWED_EMAILS?: string;
  REVENUE_PUSH_TOKEN?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_RECIPIENT_OPEN_ID?: string;
}

type DemoSnapshot = {
  generatedAt: string;
  input: RevenueAnalysisInputV3;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function emailFrom(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? null;
}

function allowedEmails(env: RevenueV3Env) {
  return new Set(
    (env.REVENUE_WORKSPACE_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function authorizedEmail(request: Request, env: RevenueV3Env) {
  const email = emailFrom(request);
  if (!email) return null;
  const allowed = allowedEmails(env);
  return allowed.size > 0 && allowed.has(email) ? email : null;
}

function serviceAuthorized(request: Request, env: RevenueV3Env) {
  return Boolean(
    env.REVENUE_PUSH_TOKEN &&
      request.headers.get("x-revenue-push-token") === env.REVENUE_PUSH_TOKEN,
  );
}

function demoResult() {
  const snapshot = dashboardV3 as DemoSnapshot;
  return runRevenueAnalysisV3(snapshot.input, {
    now: snapshot.generatedAt,
    analysisId: "rv3-public-demo",
  });
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function latestPublic(env: RevenueV3Env) {
  if (env.DB) {
    try {
      const stored = await getPublicLatestV3(env.DB);
      if (stored?.classification === "demo" && stored.visibility === "demo_public") {
        return json({ ok: true, persisted: true, result: stored.result });
      }
    } catch {
      // The additive migration may not be active yet. Use the reviewed demo snapshot.
    }
  }
  return json({ ok: true, persisted: false, result: demoResult() });
}

async function createAnalysis(request: Request, env: RevenueV3Env) {
  const email = authorizedEmail(request, env);
  const isService = serviceAuthorized(request, env);
  if (!email && !isService) return json({ ok: false, error: "Unauthorized." }, 401);
  const payload = (await request.json().catch(() => null)) as {
    input?: unknown;
    timestamps?: Record<string, string | null>;
  } | null;
  const validation = validateRevenueAnalysisInputV3(payload?.input);
  if (!validation.valid) {
    return json({ ok: false, error: "Invalid v3 input.", details: validation.errors }, 400);
  }
  const input = payload!.input as RevenueAnalysisInputV3;
  if (isService && input.classification !== "demo") {
    return json({ ok: false, error: "Automation may publish demo inputs only." }, 403);
  }
  const now = new Date().toISOString();
  const analysisId = crypto.randomUUID();
  const result = runRevenueAnalysisV3(input, { now, analysisId });
  const contentDigest = await sha256({ input, result });
  const mayPersist =
    Boolean(env.DB) &&
    (input.classification === "demo" ||
      (Boolean(email) && isExplicitlyEnabled(env.ALLOW_REAL_DATA_PERSISTENCE)));
  if (mayPersist && env.DB) {
    await saveAnalysisV3(env.DB, email, input, result, contentDigest);
  }
  return json(
    {
      ok: true,
      persisted: mayPersist,
      result,
      timestamps: {
        ...(payload?.timestamps ?? {}),
        analysis_finished_at: now,
        completed_at: new Date().toISOString(),
      },
    },
    201,
  );
}

async function privateResult(
  request: Request,
  env: RevenueV3Env,
  id: string | "latest",
) {
  const email = authorizedEmail(request, env);
  if (!email) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Storage is unavailable." }, 503);
  const stored =
    id === "latest"
      ? await getPrivateLatestV3(env.DB, email)
      : await getAnalysisV3(env.DB, id, email);
  if (!stored) return json({ ok: false, error: "Analysis not found." }, 404);
  if (stored.classification === "real" && stored.ownerEmail !== email) {
    return json({ ok: false, error: "Forbidden." }, 403);
  }
  return json({ ok: true, analysis: stored });
}

async function approve(
  request: Request,
  env: RevenueV3Env,
  id: string,
) {
  const email = authorizedEmail(request, env);
  if (!email) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Storage is unavailable." }, 503);
  const stored = await approveAnalysisV3(env.DB, id, email, new Date().toISOString());
  if (!stored || stored.ownerEmail !== email) {
    return json({ ok: false, error: "Analysis not found." }, 404);
  }
  return json({ ok: true, analysis: stored });
}

async function sendFeishu(
  request: Request,
  env: RevenueV3Env,
  id: string,
) {
  const email = authorizedEmail(request, env);
  if (!email) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!isExplicitlyEnabled(env.ALLOW_MANUAL_FEISHU_PUSH)) {
    return json({ ok: false, error: "Manual Feishu delivery is disabled." }, 403);
  }
  if (!env.DB) return json({ ok: false, error: "Storage is unavailable." }, 503);
  const stored = await getAnalysisV3(env.DB, id, email);
  if (!stored || stored.ownerEmail !== email) {
    return json({ ok: false, error: "Analysis not found." }, 404);
  }
  if (stored.reviewStatus !== "approved") {
    return json({ ok: false, error: "Approve the brief before delivery." }, 409);
  }
  if (stored.result.qualityStatus === "fail") {
    return json({ ok: false, error: "Quality failures block delivery." }, 409);
  }
  if (!stored.approvedDigest || stored.approvedDigest !== stored.contentDigest) {
    return json({ ok: false, error: "The approved content has changed; review it again." }, 409);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return json({ ok: false, error: "Idempotency-Key is required." }, 400);
  const existing = await getDeliveryAttemptByKey(env.DB, idempotencyKey);
  if (existing) return json({ ok: existing.status === "sent", replay: true, attempt: existing });

  const attemptId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  await startDeliveryAttempt(env.DB, {
    id: attemptId,
    analysisId: id,
    idempotencyKey,
    requestedBy: email,
    requestedAt,
  });
  try {
    await sendFeishuDirectMessageV3(new URL(request.url).origin, env, stored.result);
    const sentAt = new Date().toISOString();
    await finishDeliveryAttempt(env.DB, attemptId, "sent", sentAt, null);
    return json({ ok: true, replay: false, sentAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feishu delivery failed.";
    await finishDeliveryAttempt(env.DB, attemptId, "failed", null, message);
    return json({ ok: false, error: message }, 502);
  }
}

function sanitizedMappingProfile(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    name?: unknown;
    files?: unknown;
  };
  if (
    typeof candidate.name !== "string" ||
    !candidate.name.trim() ||
    !Array.isArray(candidate.files) ||
    candidate.files.length === 0 ||
    candidate.files.length > 20
  ) {
    return null;
  }
  const files = candidate.files.map((file) => {
    if (!file || typeof file !== "object") return null;
    const item = file as {
      filename?: unknown;
      format?: unknown;
      headers?: unknown;
      mappings?: unknown;
    };
    if (
      typeof item.filename !== "string" ||
      !["csv", "xlsx"].includes(String(item.format)) ||
      !Array.isArray(item.headers) ||
      !item.headers.every((header) => typeof header === "string") ||
      !Array.isArray(item.mappings)
    ) {
      return null;
    }
    const mappings = item.mappings.map((mapping) => {
      if (!mapping || typeof mapping !== "object") return null;
      const entry = mapping as {
        sourceColumn?: unknown;
        semanticField?: unknown;
        confirmed?: unknown;
      };
      if (
        typeof entry.sourceColumn !== "string" ||
        typeof entry.semanticField !== "string" ||
        typeof entry.confirmed !== "boolean"
      ) {
        return null;
      }
      return {
        sourceColumn: entry.sourceColumn.slice(0, 200),
        semanticField: entry.semanticField.slice(0, 100),
        confirmed: entry.confirmed,
      };
    });
    if (mappings.some((mapping) => mapping === null)) return null;
    return {
      filename: item.filename.slice(0, 200),
      format: item.format,
      headers: item.headers.slice(0, 300).map((header) => header.slice(0, 200)),
      mappings,
    };
  });
  if (files.some((file) => file === null)) return null;
  return { name: candidate.name.trim().slice(0, 100), files };
}

async function mappingProfiles(request: Request, env: RevenueV3Env) {
  const email = authorizedEmail(request, env);
  if (!email) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Storage is unavailable." }, 503);
  if (request.method === "GET") {
    return json({ ok: true, profiles: await listMappingProfilesV3(env.DB, email) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  const profile = sanitizedMappingProfile(await request.json().catch(() => null));
  if (!profile) {
    return json({ ok: false, error: "Invalid mapping profile." }, 400);
  }
  const id = crypto.randomUUID();
  await saveMappingProfileV3(env.DB, {
    id,
    ownerEmail: email,
    name: profile.name,
    profile,
    now: new Date().toISOString(),
  });
  return json({ ok: true, id }, 201);
}

export async function handleRevenueV3Api(
  request: Request,
  env: RevenueV3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/v3/")) return null;
  if (url.pathname === "/api/v3/status" && request.method === "GET") {
    return json({ ok: true, version: "3.0", state: "ready" });
  }
  if (url.pathname === "/api/v3/public/latest" && request.method === "GET") {
    return latestPublic(env);
  }
  if (url.pathname === "/api/v3/analyses" && request.method === "POST") {
    return createAnalysis(request, env);
  }
  if (url.pathname === "/api/v3/mapping-profiles") {
    return mappingProfiles(request, env);
  }
  if (url.pathname === "/api/v3/analyses/latest" && request.method === "GET") {
    return privateResult(request, env, "latest");
  }
  const match = url.pathname.match(/^\/api\/v3\/analyses\/([^/]+)(?:\/(approve|feishu))?$/);
  if (!match) return json({ ok: false, error: "Not found." }, 404);
  const [, id, action] = match;
  if (!action && request.method === "GET") return privateResult(request, env, id);
  if (action === "approve" && request.method === "POST") return approve(request, env, id);
  if (action === "feishu" && request.method === "POST") return sendFeishu(request, env, id);
  return json({ ok: false, error: "Method not allowed." }, 405);
}
