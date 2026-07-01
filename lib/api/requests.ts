import { fetchApi } from "./config";
import { ApiResponse, PaginatedResponse, OrderRequest } from "./types";

export const requestsApi = {
    getAll: async (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<OrderRequest>> => {
        const q = new URLSearchParams();
        if (params?.page) q.set("page", String(params.page));
        q.set("limit", String(params?.limit ?? 1000000));
        const qs = q.toString();
        return fetchApi<PaginatedResponse<OrderRequest>>(`/requests${qs ? `?${qs}` : ""}`, {
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
    },

    cancel: async (id: string, reason: string): Promise<ApiResponse<OrderRequest>> => {
        // Send a PATCH request to update the status to cancelled.
        // Note: The reason is not strictly stored in the current backend schema for OrderRequest, 
        // but we send it anyway in case it's added later or logged by middleware.
        return fetchApi<ApiResponse<OrderRequest>>(`/requests/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "cancelled", cancelReason: reason }),
        });
    }
};
