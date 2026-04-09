// ── Glass design types ────────────────────────────────────────────────────────
export type CutoutType = "circle" | "rectangle" | "slot" | "custom";

export interface VertexData {
  x: number;
  y: number;
}

export interface HoleData {
  id: string;
  type: CutoutType;
  x: number;
  y: number;
  diameter: number;
  width?: number;
  height?: number;
  length?: number;
  points?: VertexData[];
  groupId?: string;
}

// ── API types ─────────────────────────────────────────────────────────────────
export interface Role {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Worker {
  _id: string;
  name: string;
  username: string;
  position: string;
  role: Role | string;
  notificationPreferences?: {
    enabled: boolean;
    volume: number;
    sounds: Record<string, string>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Material {
  _id: string;
  name: string;
  unit: string;
  reorderPoint: number;
  /** API create/update: thickness, width, length must be strings (Zod). GET may return numbers from DB. */
  specDetails: {
    thickness?: string | number;
    color?: string;
    glassType?: string;
    width?: string | number;
    length?: string | number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Inventory {
  _id: string;
  material: string | Material; // Can save the populated Object or just the string ID
  stockType: "Raw" | "Reuse";
  quantity: number;
  location: string;
  storageColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialLog {
  _id: string;
  material: string | Material;
  actionType: "withdraw" | "claim" | "import" | "cut";
  referenceId?: string;
  referenceType?: "claim" | "withdrawal";
  quantityChanged: number;
  totalPrice?: number;
  stockType?: "Raw" | "Reuse";
  order?: string | Order;
  panes?: (string | Pane)[];
  parentLog?: string | MaterialLog;
  worker?: string | Worker;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  _id: string;
  name: string;
  address: string;
  phone: string;
  discount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRequest {
  _id: string;
  requestNumber?: string;
  details: {
    type: string;
    estimatedPrice: number;
    quantity: number;
  };
  customer: string | Customer;
  deadline: string;
  deliveryLocation: string;
  assignedTo: string | Worker;
  expectedDeliveryDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  _id: string;
  orderNumber?: string; // e.g. "ORD-0001"
  code?: string; // sequential QR code e.g. "001", "042", "1000"
  request: string | OrderRequest;
  priority: number;
  customer: string | Customer;
  material: string | Material;
  quantity: number;
  stations: (string | { _id: string; name: string })[];
  currentStationIndex?: number;
  stationHistory?: {
    station: string | { _id: string; name: string };
    enteredAt: string;
    exitedAt?: string;
    completedBy?: string;
  }[];
  stationData?: Record<string, unknown>;
  notes?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  claim: string;
  withdrawal: string;
  assignedTo: string | Worker;
  createdAt: string;
  updatedAt: string;
}

export type PaneStation = { _id: string; name: string } | string | null;

export interface EdgeProperties {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export interface PaneEdgeTask {
  side: string;
  edgeProfile: string;
  machineType: string;
  status: "pending" | "in_progress" | "completed";
}

export interface Pane {
  _id: string;
  paneNumber: string;
  qrCode: string;
  request?: string | OrderRequest;
  order?: string | Order;
  material?: string | Material;
  inventory?: string | Inventory;
  currentStation: PaneStation;
  currentStatus:
    | "pending"
    | "in_progress"
    | "completed"
    | "awaiting_scan_out"
    | "claimed";
  routing: (string | { _id: string; name: string })[];
  customRouting: boolean;
  dimensions: { width: number; height: number; thickness: number; area?: number };
  glassType: string;
  glassTypeLabel: string;
  processes: string[];
  edgeTasks: PaneEdgeTask[];
  cornerSpec?: string;
  dimensionTolerance?: string;
  jobType?: string;
  rawGlass?: {
    glassType: string;
    color: string;
    thickness: number;
    sheetsPerPane: number;
  };
  /** Backend returns arrays for new orders. Older orders return integer counts. */
  holes?: HoleData[] | number;
  notches?: HoleData[] | number;
  vertices?: VertexData[];
  withdrawal?: string | Withdrawal;
  remakeOf?: string;
  laminateRole?: "single" | "parent" | "sheet";
  parentPane?: string | Pane;
  childPanes?: (string | Pane)[];
  sheetLabel?: string;
  /** Retired pane points at survivor after laminate merge. */
  mergedInto?: string | Pane;
  laminateMergedAt?: string;
  laminateStation?: string | { _id: string; name: string };
  startedAt?: string;
  completedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaneLog {
  _id: string;
  pane: string | Pane;
  order?: string | Order;
  material?: string | Material;
  worker?: string | Worker;
  station: string | { _id: string; name: string };
  action: "scan_in" | "start" | "complete" | "scan_out";
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  // aliases added by backend mapper
  paneId?: string | Pane;
  orderId?: string | Order;
}

export type TimelineEvent =
  | (MaterialLog & { logType: "material_log" })
  | (PaneLog & { logType: "pane_log" });

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginData {
  token: string;
  worker: Worker;
}

export interface Withdrawal {
  _id: string;
  order: string | Order;
  withdrawnBy: string | Worker;
  material: string | Material;
  quantity: number;
  stockType: "Raw" | "Reuse";
  panes?: (string | Pane)[];
  inventory?: string | Inventory;
  withdrawnDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  _id: string;
  claimNumber?: string;
  order: string | Order;
  source: "customer" | "worker";
  material: string | Material;
  description: string;
  status?: "pending" | "approved" | "rejected";
  decision?: "destroy" | "keep";
  defectCode?: "broken" | "chipped" | "dimension_wrong" | "scratch" | "other";
  defectStation?: string | { _id: string; name: string };
  reportedBy: string | Worker;
  approvedBy?: string | Worker;
  pane?: string | Pane;
  remadePane?: string | Pane;
  photos?: string[];
  claimDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Station {
  _id: string;
  name: string;
  colorId: string;
  templateId?: string;
  isLaminateStation?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  recipient: string | Worker;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
  priority: "low" | "medium" | "high";
  readStatus: boolean;
  createdAt: string;
  updatedAt: string;
}
