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

export interface LoginData {
    token: string;
    worker: Worker;
}
