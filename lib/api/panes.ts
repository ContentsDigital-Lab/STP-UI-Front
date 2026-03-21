import { fetchApi } from "./config";
import { ApiResponse, Pane, PaginatedResponse } from "./types";

export const panesApi = {
    getAll: async (params?: { order?: string; page?: number; limit?: number; sort?: string }): Promise<PaginatedResponse<Pane>> => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.sort) qs.set("sort", params.sort);
        const query = qs.toString();
        const res = await fetchApi<PaginatedResponse<Pane>>(`/panes${query ? `?${query}` : ""}`, {
            method: "GET",
        });
        // API doesn't support order filter — apply client-side
        if (params?.order && res.success && Array.isArray(res.data)) {
            const oid = params.order;
            res.data = res.data.filter(p => {
                const pOrder = typeof p.order === "string" ? p.order : (p.order as { _id?: string })?._id;
                return pOrder === oid;
            });
        }
        return res;
    },

    getById: async (id: string): Promise<ApiResponse<Pane>> => {
        return fetchApi<ApiResponse<Pane>>(`/panes/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Pane>): Promise<ApiResponse<Pane>> => {
        return fetchApi<ApiResponse<Pane>>("/panes", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Pane>): Promise<ApiResponse<Pane>> => {
        return fetchApi<ApiResponse<Pane>>(`/panes/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/panes/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<{ deletedCount: number }>> => {
        return fetchApi<ApiResponse<{ deletedCount: number }>>("/panes", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    },
};
