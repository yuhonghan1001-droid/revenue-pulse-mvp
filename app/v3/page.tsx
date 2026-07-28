import dashboardV3 from "../data/dashboard-v3.json";
import { PublicRevenueDashboard } from "../../components/revenue-v3/public-dashboard";
import type { RevenueAnalysisInputV3 } from "../../lib/revenue-v3/contracts.ts";
import { runRevenueAnalysisV3 } from "../../lib/revenue-v3/engine.ts";

type Snapshot = {
  generatedAt: string;
  input: RevenueAnalysisInputV3;
};

export default function RevenueV3Page() {
  const snapshot = dashboardV3 as Snapshot;
  const result = runRevenueAnalysisV3(snapshot.input, {
    now: snapshot.generatedAt,
    analysisId: "rv3-public-demo",
  });
  return <PublicRevenueDashboard result={result} />;
}
