import type { AdminSection } from "../../app/navigation";
import type {
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../types";

export type MasterWorkspaceView = Extract<AdminSection, "dashboard" | "requests" | "schedule">;

export type MasterWorkspaceProps = {
  view: MasterWorkspaceView;
  onNavigate: (section: AdminSection) => void;
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  services: ServicePreset[];
  windows: TimeWindow[];
  confirmRequest: (id: string) => void | Promise<unknown>;
  updateStatus: (id: string, status: RequestStatus) => void | Promise<unknown>;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void | Promise<unknown>;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void | Promise<unknown>;
  deleteTimeWindow: (id: string) => void | Promise<unknown>;
  moveAppointment: (appointmentId: string, windowId: string) => void | Promise<unknown>;
  updateAppointmentStatus: (
    appointmentId: string,
    status: AppSnapshot["appointments"][number]["status"],
  ) => void | Promise<unknown>;
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void | Promise<unknown>;
};

export type MasterWorkspaceSectionProps = Omit<MasterWorkspaceProps, "view">;
