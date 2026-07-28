import { index, integer, text, uniqueIndex, sqliteTable } from "drizzle-orm/sqlite-core";

export const analysisRuns = sqliteTable(
  "analysis_runs",
  {
    id: text("id").primaryKey(),
    asOf: text("as_of").notNull(),
    generatedAt: text("generated_at").notNull(),
    engine: text("engine").notNull(),
    model: text("model"),
    qualityStatus: text("quality_status").notNull(),
    inputJson: text("input_json").notNull(),
    resultJson: text("result_json").notNull(),
  },
  (table) => [
    index("analysis_runs_generated_at_idx").on(table.generatedAt),
    index("analysis_runs_as_of_idx").on(table.asOf),
  ],
);

export const revenueMappingProfilesV3 = sqliteTable(
  "revenue_mapping_profiles_v3",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    contractVersion: text("contract_version").notNull(),
    profileJson: text("profile_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("revenue_mapping_profiles_v3_owner_idx").on(table.ownerEmail),
  ],
);

export const revenueAnalysisRunsV3 = sqliteTable(
  "revenue_analysis_runs_v3",
  {
    id: text("id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    classification: text("classification").notNull(),
    visibility: text("visibility").notNull(),
    ownerEmail: text("owner_email"),
    basis: text("basis").notNull(),
    asOf: text("as_of").notNull(),
    generatedAt: text("generated_at").notNull(),
    qualityStatus: text("quality_status").notNull(),
    reviewStatus: text("review_status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    contentDigest: text("content_digest").notNull(),
    approvedDigest: text("approved_digest"),
    inputJson: text("input_json").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("revenue_analysis_runs_v3_generated_idx").on(table.generatedAt),
    index("revenue_analysis_runs_v3_owner_idx").on(table.ownerEmail),
    index("revenue_analysis_runs_v3_public_idx").on(
      table.classification,
      table.visibility,
      table.generatedAt,
    ),
  ],
);

export const feishuDeliveryAttemptsV3 = sqliteTable(
  "feishu_delivery_attempts_v3",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestedBy: text("requested_by").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    requestedAt: text("requested_at").notNull(),
    sentAt: text("sent_at"),
    attemptNumber: integer("attempt_number").notNull().default(1),
  },
  (table) => [
    uniqueIndex("feishu_delivery_attempts_v3_key_idx").on(table.idempotencyKey),
    index("feishu_delivery_attempts_v3_analysis_idx").on(table.analysisId),
  ],
);
