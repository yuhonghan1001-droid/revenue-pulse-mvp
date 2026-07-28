import type { RevenueAnalysisInputV3, RevenueAnalysisResultV3 } from "../../lib/revenue-v3/contracts.ts";

export interface RevenueV3DatabaseEnv {
  DB?: D1Database;
}

export interface StoredAnalysisV3 {
  id: string;
  classification: "demo" | "real";
  visibility: "demo_public" | "private";
  ownerEmail: string | null;
  reviewStatus: "draft" | "approved";
  approvedBy: string | null;
  approvedAt: string | null;
  contentDigest: string;
  approvedDigest: string | null;
  input: RevenueAnalysisInputV3;
  result: RevenueAnalysisResultV3;
}

type RunRow = {
  id: string;
  classification: "demo" | "real";
  visibility: "demo_public" | "private";
  owner_email: string | null;
  review_status: "draft" | "approved";
  approved_by: string | null;
  approved_at: string | null;
  content_digest: string;
  approved_digest: string | null;
  input_json: string;
  result_json: string;
};

function decode(row: RunRow | null): StoredAnalysisV3 | null {
  if (!row) return null;
  return {
    id: row.id,
    classification: row.classification,
    visibility: row.visibility,
    ownerEmail: row.owner_email,
    reviewStatus: row.review_status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    contentDigest: row.content_digest,
    approvedDigest: row.approved_digest,
    input: JSON.parse(row.input_json) as RevenueAnalysisInputV3,
    result: JSON.parse(row.result_json) as RevenueAnalysisResultV3,
  };
}

export async function saveAnalysisV3(
  db: D1Database,
  ownerEmail: string | null,
  input: RevenueAnalysisInputV3,
  result: RevenueAnalysisResultV3,
  contentDigest: string,
) {
  const visibility = input.classification === "demo" ? "demo_public" : "private";
  await db
    .prepare(
      `INSERT INTO revenue_analysis_runs_v3
      (id, contract_version, classification, visibility, owner_email, basis, as_of,
       generated_at, quality_status, review_status, content_digest, input_json, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
    .bind(
      result.analysisId,
      result.contractVersion,
      input.classification,
      visibility,
      ownerEmail,
      input.basis,
      result.asOf,
      result.generatedAt,
      result.qualityStatus,
      contentDigest,
      JSON.stringify(input),
      JSON.stringify(result),
      result.generatedAt,
    )
    .run();
}

export async function getPublicLatestV3(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT id, classification, visibility, owner_email, review_status,
       approved_by, approved_at, content_digest, approved_digest, input_json, result_json
       FROM revenue_analysis_runs_v3
       WHERE classification = 'demo' AND visibility = 'demo_public'
       ORDER BY generated_at DESC LIMIT 1`,
    )
    .first<RunRow>();
  return decode(row);
}

export async function getPrivateLatestV3(db: D1Database, ownerEmail: string) {
  const row = await db
    .prepare(
      `SELECT id, classification, visibility, owner_email, review_status,
       approved_by, approved_at, content_digest, approved_digest, input_json, result_json
       FROM revenue_analysis_runs_v3
       WHERE owner_email = ? AND visibility = 'private'
       ORDER BY generated_at DESC LIMIT 1`,
    )
    .bind(ownerEmail)
    .first<RunRow>();
  return decode(row);
}

export async function getAnalysisV3(
  db: D1Database,
  id: string,
  ownerEmail: string,
) {
  const row = await db
    .prepare(
      `SELECT id, classification, visibility, owner_email, review_status,
       approved_by, approved_at, content_digest, approved_digest, input_json, result_json
       FROM revenue_analysis_runs_v3
       WHERE id = ? AND (owner_email = ? OR visibility = 'demo_public') LIMIT 1`,
    )
    .bind(id, ownerEmail)
    .first<RunRow>();
  return decode(row);
}

export async function approveAnalysisV3(
  db: D1Database,
  id: string,
  ownerEmail: string,
  approvedAt: string,
) {
  await db
    .prepare(
      `UPDATE revenue_analysis_runs_v3
       SET review_status = 'approved', approved_by = ?, approved_at = ?,
           approved_digest = content_digest
       WHERE id = ? AND owner_email = ?`,
    )
    .bind(ownerEmail, approvedAt, id, ownerEmail)
    .run();
  return getAnalysisV3(db, id, ownerEmail);
}

export async function getDeliveryAttemptByKey(
  db: D1Database,
  idempotencyKey: string,
) {
  return db
    .prepare(
      `SELECT id, analysis_id, status, error, sent_at
       FROM feishu_delivery_attempts_v3 WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<{
      id: string;
      analysis_id: string;
      status: string;
      error: string | null;
      sent_at: string | null;
    }>();
}

export async function startDeliveryAttempt(
  db: D1Database,
  values: {
    id: string;
    analysisId: string;
    idempotencyKey: string;
    requestedBy: string;
    requestedAt: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO feishu_delivery_attempts_v3
       (id, analysis_id, idempotency_key, requested_by, channel, status, requested_at)
       VALUES (?, ?, ?, ?, 'direct_message', 'started', ?)`,
    )
    .bind(
      values.id,
      values.analysisId,
      values.idempotencyKey,
      values.requestedBy,
      values.requestedAt,
    )
    .run();
}

export async function finishDeliveryAttempt(
  db: D1Database,
  id: string,
  status: "sent" | "failed",
  sentAt: string | null,
  error: string | null,
) {
  await db
    .prepare(
      `UPDATE feishu_delivery_attempts_v3
       SET status = ?, sent_at = ?, error = ? WHERE id = ?`,
    )
    .bind(status, sentAt, error, id)
    .run();
}

export async function listMappingProfilesV3(db: D1Database, ownerEmail: string) {
  const rows = await db
    .prepare(
      `SELECT id, name, profile_json, created_at, updated_at
       FROM revenue_mapping_profiles_v3
       WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 20`,
    )
    .bind(ownerEmail)
    .all<{
      id: string;
      name: string;
      profile_json: string;
      created_at: string;
      updated_at: string;
    }>();
  return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      profile: JSON.parse(row.profile_json) as unknown,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function saveMappingProfileV3(
  db: D1Database,
  values: {
    id: string;
    ownerEmail: string;
    name: string;
    profile: unknown;
    now: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO revenue_mapping_profiles_v3
       (id, owner_email, name, contract_version, profile_json, created_at, updated_at)
       VALUES (?, ?, ?, '3.0', ?, ?, ?)`,
    )
    .bind(
      values.id,
      values.ownerEmail,
      values.name,
      JSON.stringify(values.profile),
      values.now,
      values.now,
    )
    .run();
  return values.id;
}
