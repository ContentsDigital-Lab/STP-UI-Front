import { fetchApi } from "./config";
import { ApiResponse, MaterialLog } from "./types";

export interface CreateMaterialLogPayload {
    material: string;
    actionType: "withdraw" | "claim" | "import" | "cut";
    quantityChanged: number;
    referenceId?: string;
    referenceType?: "claim" | "withdrawal";
    totalPrice?: number;
    stockType?: "Raw" | "Reuse";
    order?: string;
    parentLog?: string;
    worker?: string;
}

export const materialLogsApi = {
    getAll: async (params?: { materialId?: string; limit?: number }): Promise<ApiResponse<MaterialLog[]>> => {
        let query = "";
        if (params) {
            const searchParams = new URLSearchParams();
            if (params.materialId) searchParams.append("materialId", params.materialId);
            if (params.limit) searchParams.append("limit", params.limit.toString());
            query = `?${searchParams.toString()}`;
        }
        return fetchApi<ApiResponse<MaterialLog[]>>(`/material-logs${query}`, {
            method: "GET",
        });
    },

    getByMaterialId: async (materialId: string): Promise<ApiResponse<MaterialLog[]>> => {
        return fetchApi<ApiResponse<MaterialLog[]>>(`/material-logs/material/${materialId}`, {
            method: "GET",
        });
    },

    create: async (payload: CreateMaterialLogPayload): Promise<ApiResponse<MaterialLog>> => {
        return fetchApi<ApiResponse<MaterialLog>>(`/material-logs`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    },

    delete: async (id: string): Promise<ApiResponse<null>> => {
        return fetchApi<ApiResponse<null>>(`/material-logs/${id}`, {
            method: "DELETE",
        });
    },
};
