import { fetchApi } from "./config";
import { ApiResponse, Claim } from "./types";

export const claimsApi = {
    getAll: async (): Promise<ApiResponse<Claim[]>> => {
        return fetchApi<ApiResponse<Claim[]>>("/claims", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Claim>> => {
        return fetchApi<ApiResponse<Claim>>(`/claims/${id}`, {
            method: "GET",
        });
    },

    // Claims are created under a specific order
    createForOrder: async (orderId: string, data: Partial<Claim>): Promise<ApiResponse<Claim>> => {
        return fetchApi<ApiResponse<Claim>>(`/orders/${orderId}/claims`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Claim>): Promise<ApiResponse<Claim>> => {
        return fetchApi<ApiResponse<Claim>>(`/claims/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/claims/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>("/claims", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    },
};
