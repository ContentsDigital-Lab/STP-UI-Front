import { fetchApi } from "./config";
import { ApiResponse, Withdrawal } from "./types";

export const withdrawalsApi = {
    getAll: async (params?: { limit?: number }): Promise<ApiResponse<Withdrawal[]>> => {
        const q = new URLSearchParams();
        q.set("limit", String(params?.limit ?? 100));
        return fetchApi<ApiResponse<Withdrawal[]>>(`/withdrawals?${q.toString()}`, {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Withdrawal>> => {
        return fetchApi<ApiResponse<Withdrawal>>(`/withdrawals/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Withdrawal>): Promise<ApiResponse<Withdrawal>> => {
        return fetchApi<ApiResponse<Withdrawal>>("/withdrawals", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Withdrawal>): Promise<ApiResponse<Withdrawal>> => {
        return fetchApi<ApiResponse<Withdrawal>>(`/withdrawals/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/withdrawals/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>("/withdrawals", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    },

    createFromPane: async (data: {
        paneNumber: string;
        notes?: string;
    }): Promise<ApiResponse<Withdrawal>> => {
        return fetchApi<ApiResponse<Withdrawal>>("/withdrawals/from-pane", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
};
