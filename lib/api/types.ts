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
        height?: string;
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
    createdAt: string;
    updatedAt: string;
}

export interface MaterialLog {
    _id: string;
    material: string | Material;
    action: "Import" | "Withdraw" | "Update" | "Delete";
    quantity: number;
    previousQuantity: number;
    newQuantity: number;
    warehouseLocation: string;
    worker: string | Worker;
    note?: string;
    createdAt: string;
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
    request: string | OrderRequest;
    priority: number;
    customer: string | Customer;
    material: string | Material;
    quantity: number;
    stations: string[];
    status: "pending" | "in_progress" | "completed" | "cancelled";
    claim: string;
    withdrawal: string;
    assignedTo: string | Worker;
    createdAt: string;
    updatedAt: string;
}

export interface LoginData {
    token: string;
    worker: Worker;
}
