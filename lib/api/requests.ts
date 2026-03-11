import { fetchApi } from "./config";
import { ApiResponse, OrderRequest } from "./types";

export const requestsApi = {
    getAll: async (): Promise<ApiResponse<OrderRequest[]>> => {
        return fetchApi<ApiResponse<OrderRequest[]>>("/requests", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<OrderRequest>> => {
        return fetchApi<ApiResponse<OrderRequest>>(`/requests/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<OrderRequest>): Promise<ApiResponse<OrderRequest>> => {
        return fetchApi<ApiResponse<OrderRequest>>("/requests", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<OrderRequest>): Promise<ApiResponse<OrderRequest>> => {
        return fetchApi<ApiResponse<OrderRequest>>(`/requests/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/requests/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/requests", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    }
};
