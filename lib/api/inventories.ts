import { fetchApi } from "./config";
import { ApiResponse, Inventory } from "./types";

export const inventoriesApi = {
    getAll: async (): Promise<ApiResponse<Inventory[]>> => {
        return fetchApi<ApiResponse<Inventory[]>>("/inventories", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Inventory>> => {
        return fetchApi<ApiResponse<Inventory>>(`/inventories/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Inventory>): Promise<ApiResponse<Inventory>> => {
        return fetchApi<ApiResponse<Inventory>>("/inventories", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Inventory>): Promise<ApiResponse<Inventory>> => {
        return fetchApi<ApiResponse<Inventory>>(`/inventories/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/inventories/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/inventories", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    }
};
