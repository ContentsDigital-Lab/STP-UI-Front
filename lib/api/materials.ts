import { fetchApi } from "./config";
import { ApiResponse, Material } from "./types";

export const materialsApi = {
    getAll: async (): Promise<ApiResponse<Material[]>> => {
        return fetchApi<ApiResponse<Material[]>>("/materials", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Material>> => {
        return fetchApi<ApiResponse<Material>>(`/materials/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Material>): Promise<ApiResponse<Material>> => {
        return fetchApi<ApiResponse<Material>>("/materials", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Material>): Promise<ApiResponse<Material>> => {
        return fetchApi<ApiResponse<Material>>(`/materials/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/materials/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/materials", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    }
};
