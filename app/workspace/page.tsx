import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceClient } from "../../components/revenue-v3/workspace-client";

export const dynamic = "force-dynamic";

async function AuthenticatedWorkspace() {
  const user = await requireChatGPTUser("/workspace");
  return <WorkspaceClient displayName={user.displayName} />;
}

export default function WorkspacePage() {
  return <AuthenticatedWorkspace />;
}
