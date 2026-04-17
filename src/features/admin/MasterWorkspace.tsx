import { AdminDashboard } from "./AdminDashboard";
import { AdminRequestsView } from "./AdminRequestsView";
import { AdminScheduleView } from "./AdminScheduleView";
import type { MasterWorkspaceProps } from "./masterWorkspaceTypes";

export function MasterWorkspace(props: MasterWorkspaceProps) {
  if (props.view === "dashboard") {
    return <AdminDashboard {...props} />;
  }

  if (props.view === "requests") {
    return <AdminRequestsView {...props} />;
  }

  return <AdminScheduleView {...props} />;
}
