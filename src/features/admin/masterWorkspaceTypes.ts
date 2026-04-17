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
  confirmRequest: (id: string) => void;
  updateStatus: (id: string, status: RequestStatus) => void;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void;
  moveAppointment: (appointmentId: string, windowId: string) => void;
  updateAppointmentStatus: (
    appointmentId: string,
    status: AppSnapshot["appointments"][number]["status"],
  ) => void;
  deleteAppointment: (appointmentId: string) => void;
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void;
};

export type MasterWorkspaceSectionProps = Omit<MasterWorkspaceProps, "view">;
