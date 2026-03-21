import { fetchApi } from "./config";
import { ApiResponse, Order } from "./types";

export const ordersApi = {
    getAll: async (params?: { stationId?: string; limit?: number }): Promise<ApiResponse<Order[]>> => {
        const qs = new URLSearchParams();
        if (params?.stationId) qs.set("stationId", params.stationId);
        if (params?.limit) qs.set("limit", String(params.limit));
        else qs.set("limit", "100");
        const query = qs.toString();
        return fetchApi<ApiResponse<Order[]>>(`/orders${query ? `?${query}` : ""}`, {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Order>> => {
        return fetchApi<ApiResponse<Order>>(`/orders/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Order>): Promise<ApiResponse<Order>> => {
        return fetchApi<ApiResponse<Order>>("/orders", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Order>): Promise<ApiResponse<Order>> => {
        return fetchApi<ApiResponse<Order>>(`/orders/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/orders/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/orders", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    },

    release: async (id: string): Promise<ApiResponse<Order>> => {
        return fetchApi<ApiResponse<Order>>(`/orders/${id}/release`, {
            method: "POST",
        });
    },
};
