import { index, text, sqliteTable } from "drizzle-orm/sqlite-core";

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
