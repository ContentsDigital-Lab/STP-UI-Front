export interface Worker {
    _id: string;
    name: string;
    username: string;
    position: string;
    role: "admin" | "manager" | "worker";
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
    specDetails: {
        thickness?: string;
        color?: string;
        glassType?: string;
        width?: string;
        length?: string;
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
    code?: string;   // sequential QR code e.g. "001", "042", "1000"
    request: string | OrderRequest;
    priority: number;
    customer: string | Customer;
    material: string | Material;
    quantity: number;
    stations: string[];
    currentStationIndex?: number;
    stationHistory?: {
        station: string;
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

export type PaneStation = string;

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
    currentStatus: "pending" | "in_progress" | "completed" | "awaiting_scan_out";
    routing: string[];
    customRouting: boolean;
    dimensions: { width: number; height: number; thickness: number };
    glassType: string;
    glassTypeLabel: string;
    processes: string[];
    edgeTasks: PaneEdgeTask[];
    withdrawal?: string;
    remakeOf?: string;
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
    station: string;
    action: "scan_in" | "start" | "complete";
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
    // aliases added by backend mapper
    paneId?: string | Pane;
    orderId?: string | Order;
}

export type TimelineEvent =
    | (MaterialLog & { logType: "material_log" })
    | (PaneLog    & { logType: "pane_log" });

export interface PaginatedResponse<T> {
    success: boolean;
    message: string;
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
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
    pane?: string | Pane;
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
    decision?: "destroy" | "keep";
    reportedBy: string | Worker;
    approvedBy?: string | Worker;
    pane?: string | Pane;
    photos?: string[];
    claimDate?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Station {
    _id:         string;
    name:        string;
    colorId:     string;
    templateId?: string;
    createdAt:   string;
    updatedAt:   string;
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
