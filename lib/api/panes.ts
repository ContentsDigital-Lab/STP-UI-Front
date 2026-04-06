import { fetchApi } from "./config";
import { ApiResponse, Pane, PaginatedResponse } from "./types";

export const panesApi = {
    getAll: async (params?: { order?: string; request?: string; material?: string; status_ne?: string; laminateRole?: string; parentPane?: string; page?: number; limit?: number; sort?: string; populate?: string }): Promise<PaginatedResponse<Pane>> => {
        const qs = new URLSearchParams();
        if (params?.order)        qs.set("order",        params.order);
        if (params?.request)      qs.set("request",      params.request);
        if (params?.material)     qs.set("material",     params.material);
        if (params?.status_ne)    qs.set("status_ne",    params.status_ne);
        if (params?.laminateRole) qs.set("laminateRole", params.laminateRole);
        if (params?.parentPane)   qs.set("parentPane",   params.parentPane);
        if (params?.page)         qs.set("page",         String(params.page));
        if (params?.limit)        qs.set("limit",        String(params.limit));
        if (params?.sort)         qs.set("sort",         params.sort);
        if (params?.populate)     qs.set("populate",     params.populate);
        const query = qs.toString();
        return fetchApi<PaginatedResponse<Pane>>(`/panes${query ? `?${query}` : ""}`, {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Pane>> => {
        return fetchApi<ApiResponse<Pane>>(`/panes/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Pane>): Promise<ApiResponse<Pane | { parent: Pane; sheets: Pane[] }>> => {
        return fetchApi<ApiResponse<Pane | { parent: Pane; sheets: Pane[] }>>("/panes", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Pane>): Promise<ApiResponse<Pane | { parent: Pane; sheets: Pane[] }>> => {
        return fetchApi<ApiResponse<Pane | { parent: Pane; sheets: Pane[] }>>(`/panes/${id}`, {
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

    scan: async (paneNumber: string, data: {
        station: string;
        action: "scan_in" | "start" | "complete" | "scan_out" | "laminate";
        operator?: string;
        force?: boolean;
    }): Promise<ApiResponse<{
        pane: Pane;
        log: Record<string, unknown>;
        nextStation?: string;
        mergedSheets?: number;
    }>> => {
        return fetchApi(`/panes/${encodeURIComponent(paneNumber)}/scan`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    batchScan: async (data: {
        paneNumbers: string[];
        station: string;
        action: "scan_in" | "start" | "complete";
        worker?: string;
    }): Promise<ApiResponse<{
        panes: Pane[];
        logs: Record<string, unknown>[];
    }>> => {
        return fetchApi("/panes/batch-scan", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
};
