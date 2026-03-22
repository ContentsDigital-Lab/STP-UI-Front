import { fetchApi } from "./config";
import { ApiResponse, Pane, PaginatedResponse } from "./types";

export const panesApi = {
    getAll: async (params?: { order?: string; request?: string; page?: number; limit?: number; sort?: string }): Promise<PaginatedResponse<Pane>> => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.sort) qs.set("sort", params.sort);
        const query = qs.toString();
        const res = await fetchApi<PaginatedResponse<Pane>>(`/panes${query ? `?${query}` : ""}`, {
            method: "GET",
        });
        // API doesn't support order/request filters — apply client-side
        if (res.success && Array.isArray(res.data)) {
            if (params?.order) {
                const oid = params.order;
                res.data = res.data.filter(p => {
                    const pOrder = typeof p.order === "string" ? p.order : (p.order as { _id?: string })?._id;
                    return pOrder === oid;
                });
            } else if (params?.request) {
                const rid = params.request;
                res.data = res.data.filter(p => {
                    const pReq = p.request;
                    if (!pReq) return false;
                    const reqId = typeof pReq === "string" ? pReq : (pReq as { _id?: string })?._id;
                    return reqId === rid;
                });
            }
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
